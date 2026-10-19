/**
 * Startup resume of the ABA PayWay listener, and the guard that keeps exactly
 * one Telegram event handler attached.
 *
 * WHY THIS EXISTS
 *
 * `telegram-local-agent.json` is written by POST /configure and was read
 * NOWHERE at startup. ABA listening therefore stopped after every bridge
 * restart: the process came back signed in, reported 70 groups, and silently
 * ingested nothing. Nothing errored, so the failure was invisible.
 *
 * The fix resumes from the saved configuration. It deliberately does NOT mint a
 * new agent token, because `streamkit_create_local_telegram_agent` begins with
 *
 *     update telegram_local_agents set revoked_at = now()
 *       where creator_id = ... and revoked_at is null
 *
 * so minting a fresh token revokes every existing agent for the creator. The
 * saved token is the safe asset. Re-registering it calls
 * `streamkit_register_local_telegram_sender`, which is an UPDATE keyed on
 * token_hash -- idempotent, and required because ingestion gates on
 * `expected_sender_user_id`, which only that RPC sets.
 *
 * No value from the config file is ever logged. Only field PRESENCE and shape.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const AGENT_CONFIG_FILE = "telegram-local-agent.json";

/**
 * @typedef {{ agentToken: string, chatId: string, botUsername: string }} AgentConfig
 * @typedef {{ ok: true, config: AgentConfig }
 *          | { ok: false, reason: string }} ConfigResult
 * @typedef {{ ok: boolean, resumed?: boolean, reason?: string }} ListenResult
 */

/**
 * Validates a saved agent config.
 *
 * Returns a discriminated result instead of throwing, so a missing or corrupt
 * file degrades to "not listening" rather than taking the bridge down.
 *
 * `reason` is a fixed string from this file -- never derived from the file's
 * contents -- so it is safe to log.
 *
 * @param {unknown} value
 * @returns {ConfigResult}
 */
export function validateAgentConfig(value) {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "not an object" };
  }
  const agentToken = value.agentToken;
  const chatId = value.telegramChatId;
  const botUsername = value.paywayBotUsername;

  if (typeof agentToken !== "string" || agentToken.length === 0) {
    return { ok: false, reason: "missing agentToken" };
  }
  // Same shape the database enforces: '-'? + 1-20 digits.
  if (typeof chatId !== "string" || !/^-?\d{1,20}$/.test(chatId.trim())) {
    return { ok: false, reason: "invalid telegramChatId" };
  }
  if (typeof botUsername !== "string" || !/^@?[A-Za-z0-9_]{5,32}$/.test(botUsername.trim())) {
    return { ok: false, reason: "invalid paywayBotUsername" };
  }

  return {
    ok: true,
    config: {
      agentToken,
      chatId: chatId.trim(),
      // startListening passes this to client.getEntity, which wants a peer
      // handle; it already tolerates a leading '@', so it is preserved.
      botUsername: botUsername.trim(),
    },
  };
}

/**
 * Reads and validates the saved config from disk.
 *
 * `root` is the project directory. Only the file's existence, parseability and
 * field presence are reported -- never a field value.
 *
 * @param {string} root
 * @param {{ fileExists?: (p: string) => boolean, fileRead?: (p: string) => string }} [io]
 * @returns {ConfigResult}
 */
export function readAgentConfig(root, { fileExists = existsSync, fileRead = readFileSync } = {}) {
  const file = path.join(root, AGENT_CONFIG_FILE);
  if (!fileExists(file)) {
    return { ok: false, reason: `${AGENT_CONFIG_FILE} not found` };
  }
  let parsed;
  try {
    parsed = JSON.parse(fileRead(file, "utf8"));
  } catch {
    return { ok: false, reason: `${AGENT_CONFIG_FILE} is not valid JSON` };
  }
  const result = validateAgentConfig(parsed);
  if (!result.ok) {
    return { ok: false, reason: `${AGENT_CONFIG_FILE}: ${result.reason}` };
  }
  return { ok: true, config: result.config };
}

/**
 * Runs listener resume so that no failure can escape into the caller's
 * authentication error handling.
 *
 * This is a named function because the invariant matters and is easy to break
 * later: boot()'s catch block treats some messages as a revoked Telegram session
 * and rewrites the session file. If a resume failure could propagate there, a
 * Supabase outage or an entity-lookup error would destroy a working Telegram
 * login and force a fresh QR scan.
 *
 * Swallows every error and returns a boolean. Never rethrows, by construction.
 *
 * @param {() => unknown} resume
 * @param {{ log?: (message: string) => void }} [options]
 * @returns {boolean}
 */
export function runResumeSafely(resume, { log = () => {} } = {}) {
  try {
    const result = resume();
    if (result && typeof result.then === "function") {
      // Async resume: attach a rejection handler so it cannot surface as an
      // unhandled rejection or reach a caller error boundary.
      result.then(
        () => {},
        (err) => log(`ABA listener failed to start (session untouched): ${err?.message ?? err}`),
      );
    }
    return true;
  } catch (err) {
    log(`unexpected error (session untouched): ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Serialises listener startup so only one Telegram event handler is ever
 * attached.
 *
 * Three properties, each of which has been a real failure mode here:
 *
 * 1. Concurrent callers SHARE one attempt. Without this, startup-resume racing
 *    a manual /configure attaches two handlers to the same client and every ABA
 *    message is ingested twice.
 * 2. After a SUCCESSFUL start, later calls are no-ops. They must not re-register
 *    or re-attach.
 * 3. After a FAILED attempt, a retry is allowed and the guard does not consider
 *    itself started. A partial failure must not leave the guard latched, and
 *    must not leave a handler attached.
 *
 * `run` receives the config and must resolve only once the handler is attached.
 * It is called at most once per successful attempt.
 *
 * @param {(config: AgentConfig) => Promise<unknown>} run
 */
export function createListenGuard(run) {
  let inFlight = null;
  let started = false;
  let activeConfig = null;
  /** Teardown returned by the last successful `run`, used by reset(). */
  let teardown = null;
  /**
   * Bumped by reset(). An attempt captures the value it started with and must
   * not commit its result if reset() happened meanwhile -- otherwise a logout
   * during a slow startup would be undone by the in-flight attempt landing
   * afterwards, re-arming a guard for a client that no longer exists.
   */
  let generation = 0;

  /** @returns {AgentConfig | null} */
  function getActiveConfig() {
    return activeConfig;
  }

  /**
   * @param {AgentConfig} config
   * @returns {Promise<ListenResult>}
   */
  async function ensureListening(config) {
    // Already listening: a repeat /configure is a no-op, not a second handler.
    if (started) {
      return { ok: true, resumed: false, reason: "already listening" };
    }
    // An attempt is already in flight: join it rather than start a second.
    if (inFlight) {
      return inFlight;
    }

    const attemptGeneration = generation;

    inFlight = (async () => {
      try {
        const result = await run(config);
        // A reset() during this attempt invalidates it. The handler is already
        // attached, so use its own teardown rather than leaving it stranded.
        if (attemptGeneration !== generation) {
          const dispose = result && typeof result === "object" ? result.detach : null;
          if (typeof dispose === "function") {
            try {
              dispose();
            } catch (err) {
              console.error(`[resume] teardown after reset failed: ${err?.message ?? err}`);
            }
          }
          return { ok: false, resumed: false, reason: "superseded by reset" };
        }
        started = true;
        activeConfig = config;
        teardown = result && typeof result === "object" && typeof result.detach === "function"
          ? result.detach
          : null;
        return { ok: true, resumed: true, ...(result ?? {}) };
      } finally {
        // Cleared on both success and failure. On failure `started` stays false
        // so a later retry is permitted; no handler is attached because `run`
        // resolves only after attachment.
        inFlight = null;
      }
    })();

    return inFlight;
  }

  /**
   * Clears the guard so a new client (after logout) can listen again.
   *
   * Invokes the teardown from the last successful attempt so the handler is
   * explicitly removed rather than relying on the old client being collected.
   * Bumps `generation`, which invalidates any attempt still in flight.
   */
  function reset() {
    generation += 1;
    started = false;
    inFlight = null;
    activeConfig = null;
    if (typeof teardown === "function") {
      try {
        teardown();
      } catch (err) {
        console.error(`[resume] teardown during reset failed: ${err?.message ?? err}`);
      }
    }
    teardown = null;
  }

  return { ensureListening, reset, getActiveConfig, isStarted: () => started };
}