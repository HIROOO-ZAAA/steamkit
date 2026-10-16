/**
 * Guarded audio playback for the OBS alert queue.
 *
 * WHY THIS EXISTS
 *   An audio element resolves playback on `ended` or `error` — and on nothing
 *   else. A stalled element (a signed URL that never resolves, OBS throttling
 *   the browser source, a network that accepts the socket and then stops)
 *   fires neither, so the promise stayed pending forever: `triggerAlert` never
 *   reached its cleanup, `currentAlert` was never cleared, and because the queue
 *   drains only when nothing is showing (see `alerts/page.tsx`), **every later
 *   alert was blocked for the life of the page**. A page refresh was the only
 *   recovery.
 *
 *   This module adds the missing third outcome — a bounded timeout — and stops
 *   the element before releasing it, so a stalled clip cannot keep talking over
 *   the alert that follows.
 *
 * WHY IT IS A SEPARATE MODULE
 *   The alert overlay is a client component, so `node --test` cannot import it.
 *   The playback contract is pure logic, so it lives here beside
 *   `alert-logic.ts` and the component keeps only its wiring — the same split
 *   that module already uses.
 */

/**
 * How long playback may run before it is treated as stalled.
 *
 * Deliberately generous, because cutting off real audio is worse than waiting:
 *   - a donor voice message is capped at 30s by the upload route, so the bound
 *     has to clear that or legitimate messages get cut off mid-word; and
 *   - a synthesised alert line is capped at 300 characters, which reads well
 *     inside 45s even slowly.
 * 45s leaves headroom over both while still bounding a stall to under a minute,
 * after which the queue moves on.
 */
export const PLAYBACK_TIMEOUT_MS = 45_000;

/** How playback ended. `timeout` means the element stalled and was stopped. */
export type PlaybackOutcome = "ended" | "error" | "timeout";

/**
 * The part of `HTMLAudioElement` this module uses. Structural rather than the
 * DOM type so tests can pass a stub and so the module stays importable outside
 * a browser.
 */
export type PlayableAudio = {
  play(): Promise<void> | void;
  pause?(): void;
  currentTime?: number;
  addEventListener?(type: string, listener: () => void, options?: { once?: boolean }): void;
  removeEventListener?(type: string, listener: () => void): void;
};

/**
 * Plays `audio` and resolves once it ends, fails, or stalls.
 *
 * Every path funnels through one `settle`, so the promise resolves exactly once
 * however the events race — a timeout and an `ended` arriving in the same tick
 * cannot both win. Listeners are removed and the timer cleared on that single
 * path, which is also what stops a late event from a discarded element from
 * touching anything the caller has moved on to.
 */
export function playAudioToEnd(
  audio: PlayableAudio,
  timeoutMs: number = PLAYBACK_TIMEOUT_MS,
): Promise<PlaybackOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    /**
     * Teardown registered as it is created, so `settle` can run it without
     * holding a reference to the timer or the listeners before they exist.
     */
    const teardown: Array<() => void> = [];
    const attached: Array<[string, () => void]> = [];

    const settle = (outcome: PlaybackOutcome) => {
      if (settled) return;
      settled = true;
      for (const undo of teardown) undo();
      teardown.length = 0;
      resolve(outcome);
    };

    const onEnded = (): void => settle("ended");
    const onError = (): void => settle("error");

    const timer = setTimeout(() => {
      // Stop before releasing. A stalled clip left playing would talk over the
      // next alert, which is the failure this whole module exists to prevent.
      // `currentTime` is reset too, so the buffer is released rather than held.
      try {
        audio.pause?.();
      } catch {
        // The element can already be torn down; nothing left to stop.
      }
      try {
        if (audio.currentTime !== undefined) audio.currentTime = 0;
      } catch {
        // Same: a detached element rejects the seek.
      }
      settle("timeout");
    }, timeoutMs);
    teardown.push(() => clearTimeout(timer));

    attached.push(["ended", onEnded], ["error", onError]);
    audio.addEventListener?.("ended", onEnded, { once: true });
    audio.addEventListener?.("error", onError, { once: true });
    teardown.push(() => {
      for (const [type, listener] of attached) {
        audio.removeEventListener?.(type, listener);
      }
      attached.length = 0;
    });

    let started: Promise<void> | void;
    try {
      started = audio.play();
    } catch {
      // A browser can refuse playback synchronously (autoplay policy).
      settle("error");
      return;
    }
    if (started && typeof (started as Promise<void>).then === "function") {
      // Resolution of play() only means playback *started*; the element decides
      // when it ends. Rejection means it will never start.
      (started as Promise<void>).then(undefined, () => settle("error"));
    }
  });
}