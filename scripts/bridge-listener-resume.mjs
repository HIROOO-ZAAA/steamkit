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
  let inFlightConfig = null;
  let started = false;
  let activeConfig = null;
  let teardown = null;
  let generation = 0;

  function sameConfig(left, right) {
    return Boolean(
      left &&
      right &&
      left.agentToken === right.agentToken &&
      left.chatId === right.chatId &&
      String(left.botUsername ?? "").replace(/^@/, "").toLowerCase() ===
        String(right.botUsername ?? "").replace(/^@/, "").toLowerCase()
    );
  }

  function getActiveConfig() {
    return activeConfig;
  }

  async function ensureListening(config, wasReplaced = false) {
    if (started) {
      if (sameConfig(activeConfig, config)) {
        return { ok: true, resumed: false, reason: "already listening" };
      }

      reset();
      return ensureListening(config, true);
    }

    if (inFlight) {
      if (sameConfig(inFlightConfig, config)) {
        return inFlight;
      }

      const pending = inFlight;
      try {
        await pending;
      } catch {
        // A failed previous attempt must not prevent the requested config
        // from getting its own attempt.
      }
      return ensureListening(config, true);
    }

    const attemptGeneration = generation;
    let attempt;

    attempt = Promise.resolve().then(async () => {
      let result;

      try {
        result = await run(config, {
          isCurrent: () => attemptGeneration === generation,
        });

        if (attemptGeneration !== generation) {
          const dispose = result && typeof result === "object" ? result.detach : null;
          if (typeof dispose === "function") {
            try {
              dispose();
            } catch (err) {
              console.error("[resume] teardown after reset failed: " + (err?.message ?? err));
            }
          }
          return {
            ok: false,
            resumed: false,
            reason: "superseded by reset",
          };
        }

        // commit() is deliberately synchronous. It publishes the listener
        // only after the generation check, without an await between the check
        // and publication.
        if (result && typeof result === "object" && typeof result.commit === "function") {
          result.commit();
        }

        started = true;
        activeConfig = config;
        teardown =
          result && typeof result === "object" && typeof result.detach === "function"
            ? result.detach
            : null;

        const { commit, ...publicResult } =
          result && typeof result === "object" ? result : {};

        return {
          ok: true,
          resumed: true,
          ...publicResult,
          replaced: wasReplaced,
        };
      } catch (err) {
        // A failed commit or startup must not strand a handler.
        const dispose = result && typeof result === "object" ? result.detach : null;
        if (typeof dispose === "function") {
          try {
            dispose();
          } catch (cleanupError) {
            console.error(
              "[resume] teardown after failed startup failed: " +
                (cleanupError?.message ?? cleanupError),
            );
          }
        }
        throw err;
      } finally {
        // An older attempt must never clear the reference to a newer attempt.
        if (inFlight === attempt) {
          inFlight = null;
          inFlightConfig = null;
        }
      }
    });

    inFlight = attempt;
    inFlightConfig = config;
    return attempt;
  }

  function reset() {
    generation += 1;
    started = false;
    inFlight = null;
    inFlightConfig = null;
    activeConfig = null;

    if (typeof teardown === "function") {
      try {
        teardown();
      } catch (err) {
        console.error("[resume] teardown during reset failed: " + (err?.message ?? err));
      }
    }

    teardown = null;
  }

  return { ensureListening, reset, getActiveConfig, isStarted: () => started };
}
