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
 * What a caller is told when it asks to be told.
 *
 * Carries the failure *name* and never the error itself: a `DOMException` from a
 * media element embeds the media URL in its message, and the URL of a signed
 * object embeds its token. `NotAllowedError` is the question being asked here,
 * and the name answers it.
 */
export type PlaybackDiagnostic = {
  outcome: PlaybackOutcome;
  errorName?: string;
};

/** Reads a media error's name without trusting its shape. */
export function errorNameOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("name" in error)) return undefined;
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

/** A decoded clip that has been wired to the speakers but not yet started. */
export type DecodedAudio = {
  /** Starts it. `finished` settles when the clip reaches its end or fails. */
  play(): { finished: Promise<void>; stop(): void };
};

/**
 * Fetches and decodes a URL into something playable.
 *
 * Structural, for the same reason `PlayableAudio` is: the Web Audio API is not
 * available under `node --test`, so the caller supplies the real implementation
 * and tests pass a stub.
 */
export type AudioDecoder = {
  decode(url: string): Promise<DecodedAudio>;
};

/**
 * Plays `url` through Web Audio instead of an `HTMLAudioElement`.
 *
 * WHY THIS EXISTS
 *   Chromium's autoplay policy refuses `HTMLMediaElement.play()` with
 *   `NotAllowedError` unless the document has a user gesture - and an OBS
 *   browser source never has one, because alerts arrive from a poll or a
 *   realtime push with no click anywhere. Measured on this machine: muting the
 *   element and attaching it to the document both still refuse, and only a
 *   synthetic click makes `play()` resolve.
 *
 *   Web Audio is not subject to that restriction. An `AudioContext` created in
 *   the same document, under the same policy, starts `running`, decodes the
 *   bytes and advances its clock - measured, not assumed. So this is the path
 *   that actually produces sound in a browser source.
 *
 * The same bounds apply as `playAudioToEnd`: it resolves `ended`, `error` or
 * `timeout`, and exactly once, so the alert queue can keep waiting on real
 * playback finishing.
 */
export async function playViaWebAudio(
  url: string,
  decoder: AudioDecoder,
  timeoutMs: number = PLAYBACK_TIMEOUT_MS,
  onStarted?: () => void,
): Promise<PlaybackOutcome> {
  let decoded: DecodedAudio;
  try {
    decoded = await decoder.decode(url);
  } catch {
    return "error";
  }

  return new Promise<PlaybackOutcome>((resolve) => {
    let settled = false;
    // `play()` is guarded rather than allowed to throw: an escaping throw would
    // reject this promise and leave the alert queue awaiting it forever.
    const voice = tryPlay(decoded);
    if (!voice) {
      resolve("error");
      return;
    }
    try {
      onStarted?.();
    } catch {
      // A diagnostic callback must not affect playback.
    }

    const timer = setTimeout(() => {
      try {
        voice.stop();
      } catch {
        // Already finished, or the source never started.
      }
      settleWith("timeout");
    }, timeoutMs);

    /** Declared after the timer so it can close over it; hoisted for the callback. */
    function settleWith(result: PlaybackOutcome): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    voice.finished.then(() => settleWith("ended"), () => settleWith("error"));
  });
}

/** Starts a decoded clip, reporting a synchronous failure as `null`. */
function tryPlay(decoded: DecodedAudio): { finished: Promise<void>; stop(): void } | null {
  try {
    return decoded.play();
  } catch {
    return null;
  }
}

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
  onDiagnostic?: (diagnostic: PlaybackDiagnostic) => void,
  onStarted?: () => void,
): Promise<PlaybackOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let failureName: string | undefined;
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
      // Reported after the resolve, and guarded: a reporter that throws must not
      // become the stall this module exists to prevent.
      try {
        onDiagnostic?.({ outcome, errorName: failureName });
      } catch {
        // Reporting is best-effort; playback has already settled.
      }
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
    const notifyStarted = () => {
      try {
        onStarted?.();
      } catch {
        // A diagnostic callback must not affect playback.
      }
    };
    try {
      started = audio.play();
    } catch (error) {
      // A browser can refuse playback synchronously (autoplay policy).
      failureName = errorNameOf(error);
      settle("error");
      return;
    }
    if (started && typeof (started as Promise<void>).then === "function") {
      // Resolution of play() only means playback *started*; the element decides
      // when it ends. Rejection means it will never start.
      (started as Promise<void>).then(
        notifyStarted,
        (error: unknown) => {
          failureName = errorNameOf(error);
          settle("error");
        },
      );
    } else {
      notifyStarted();
    }
  });
}
