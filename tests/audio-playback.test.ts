import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
  playAudioToEnd,
  playViaWebAudio,
  PLAYBACK_TIMEOUT_MS,
  type PlaybackDiagnostic,
  type PlaybackOutcome,
} from "../src/lib/overlay/audio-playback.ts";

/**
 * A stand-in for HTMLAudioElement.
 *
 * `once` is deliberately NOT honoured: keeping the listener registered after it
 * fires is what lets a test emit a *late* event from an element the caller has
 * already discarded, and assert that it changes nothing. A browser that honours
 * `once` would pass such a test trivially and prove nothing.
 */
class FakeAudio {
  currentTime = 7;
  pauseCalls = 0;
  removed: string[] = [];
  playCalls = 0;
  playThrows = false;
  playRejects: Promise<void> | null = null;
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, fn: () => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: () => void): void {
    this.removed.push(type);
    this.listeners.get(type)?.delete(fn);
  }

  emit(type: string): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }

  pause(): void {
    this.pauseCalls += 1;
  }

  play(): Promise<void> | void {
    this.playCalls += 1;
    if (this.playThrows) throw new Error("autoplay blocked");
    return this.playRejects ?? undefined;
  }
}

/** Resolves once, recording every outcome the caller ever saw. */
function track(promise: Promise<PlaybackOutcome>) {
  const seen: PlaybackOutcome[] = [];
  const settled = promise.then((outcome) => {
    seen.push(outcome);
    return outcome;
  });
  return { seen, settled };
}

afterEach(() => {
  mock.timers.reset();
});

describe("playAudioToEnd — normal completion", () => {
  it("resolves ended when the clip finishes", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { settled } = track(playAudioToEnd(audio));

    audio.emit("ended");
    assert.equal(await settled, "ended");
  });

  it("does not fire the timeout after a normal end", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { seen, settled } = track(playAudioToEnd(audio));

    audio.emit("ended");
    await settled;
    mock.timers.tick(PLAYBACK_TIMEOUT_MS * 2);

    assert.deepEqual(seen, ["ended"]);
    assert.equal(audio.pauseCalls, 0, "a finished clip must not be paused");
  });

  it("removes both listeners on the way out", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { settled } = track(playAudioToEnd(audio));

    audio.emit("ended");
    await settled;

    assert.deepEqual(audio.removed.sort(), ["ended", "error"]);
  });
});

describe("playAudioToEnd — failure paths", () => {
  it("resolves error when the element fires error", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { settled } = track(playAudioToEnd(audio));

    audio.emit("error");
    assert.equal(await settled, "error");
  });

  it("resolves error when play() rejects", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    audio.playRejects = Promise.reject(new Error("NotAllowedError"));
    const { settled } = track(playAudioToEnd(audio));

    assert.equal(await settled, "error");
  });

  it("resolves error when play() throws synchronously", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    audio.playThrows = true;

    assert.equal(await playAudioToEnd(audio), "error");
  });
});

describe("playAudioToEnd — the stall this module exists for", () => {
  it("times out when neither ended nor error ever fires", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { settled } = track(playAudioToEnd(audio));

    assert.equal(audio.playCalls, 1);
    mock.timers.tick(PLAYBACK_TIMEOUT_MS);

    assert.equal(await settled, "timeout");
  });

  it("stops the stalled element so it cannot talk over the next alert", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { settled } = track(playAudioToEnd(audio));

    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    await settled;

    assert.equal(audio.pauseCalls, 1);
    assert.equal(audio.currentTime, 0, "the buffer should be released");
  });

  it("lets the queue advance: a second alert plays after a stall", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const first = new FakeAudio();
    const second = new FakeAudio();
    const order: string[] = [];

    const a = track(playAudioToEnd(first)).settled.then((o) => order.push(`first:${o}`));
    const b = track(playAudioToEnd(second)).settled.then((o) => order.push(`second:${o}`));

    // The first alert stalls and is abandoned; the queue drains it and the next
    // alert is free to run rather than being blocked behind it.
    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    await Promise.all([a, b]);

    assert.deepEqual(order, ["first:timeout", "second:timeout"]);
  });

  it("ignores a late event from an element already discarded", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { seen, settled } = track(playAudioToEnd(audio));

    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    await settled;
    assert.deepEqual(seen, ["timeout"]);

    // The browser dispatches the clip finishing long after we gave up on it.
    audio.emit("ended");
    audio.emit("error");
    await Promise.resolve();

    assert.deepEqual(seen, ["timeout"], "a late event must not rewrite the outcome");
  });
});

describe("playAudioToEnd — diagnostics", () => {
  it("reports a normal end with no error name", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const reports: PlaybackDiagnostic[] = [];
    const { settled } = track(playAudioToEnd(audio, undefined, (d) => reports.push(d)));

    audio.emit("ended");
    await settled;
    assert.deepEqual(reports, [{ outcome: "ended", errorName: undefined }]);
  });

  it("reports the name of a rejected play(), which is the autoplay question", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    audio.playRejects = Promise.reject(
      Object.assign(new Error("play() blocked"), { name: "NotAllowedError" }),
    );
    const reports: PlaybackDiagnostic[] = [];
    const { settled } = track(playAudioToEnd(audio, undefined, (d) => reports.push(d)));

    assert.equal(await settled, "error");
    assert.deepEqual(reports, [{ outcome: "error", errorName: "NotAllowedError" }]);
  });

  it("reports the name of a synchronous throw", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    audio.playThrows = true;
    const reports: PlaybackDiagnostic[] = [];
    const { settled } = track(playAudioToEnd(audio, undefined, (d) => reports.push(d)));

    assert.equal(await settled, "error");
    assert.equal(reports.length, 1);
    assert.equal(reports[0].outcome, "error");
  });

  it("reports a timeout, which is how a stall is told from a refusal", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const reports: PlaybackDiagnostic[] = [];
    const { settled } = track(playAudioToEnd(audio, undefined, (d) => reports.push(d)));

    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    await settled;
    assert.deepEqual(reports, [{ outcome: "timeout", errorName: undefined }]);
  });

  it("reports exactly once even when a later event arrives", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const reports: PlaybackDiagnostic[] = [];
    const { settled } = track(playAudioToEnd(audio, undefined, (d) => reports.push(d)));

    audio.emit("ended");
    await settled;
    audio.emit("error");
    await Promise.resolve();
    assert.equal(reports.length, 1);
  });

  it("a reporter that throws still leaves the caller with its outcome", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { settled } = track(
      playAudioToEnd(audio, undefined, () => {
        throw new Error("reporter exploded");
      }),
    );

    audio.emit("ended");
    assert.equal(await settled, "ended");
  });

  it("stays quiet when no reporter is supplied", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { settled } = track(playAudioToEnd(audio));

    audio.emit("ended");
    assert.equal(await settled, "ended");
  });
});

describe("playViaWebAudio", () => {
  /** A decoder whose voice the test drives by hand. */
  function fakeVoice() {
    let resolveFinished: () => void = () => {};
    let rejectFinished: (e: unknown) => void = () => {};
    const finished = new Promise<void>((res, rej) => {
      resolveFinished = res;
      rejectFinished = rej;
    });
    const state = { decoded: [] as string[], stopped: 0, plays: 0 };
    const decoder = {
      decode(url: string) {
        state.decoded.push(url);
        return Promise.resolve({
          play() {
            state.plays += 1;
            return { finished, stop() { state.stopped += 1; } };
          },
        });
      },
    };
    return {
      state,
      finish: () => resolveFinished(),
      fail: () => rejectFinished(new Error("source error")),
      decoder,
    };
  }

  /**
   * Lets `playViaWebAudio` get past its `await decode(...)` so the timeout is
   * actually registered before a mocked clock is advanced. `setImmediate` is
   * used because `mock.timers` replaces `setTimeout`.
   */
  const flush = () => new Promise((r) => setImmediate(r));

  it("decodes the url it was given and resolves ended when it finishes", async () => {
    const voice = fakeVoice();
    const promise = playViaWebAudio("https://x.test/a.mp3", voice.decoder);

    voice.finish();
    assert.equal(await promise, "ended");
    assert.deepEqual(voice.state.decoded, ["https://x.test/a.mp3"]);
    assert.equal(voice.state.plays, 1);
  });

  it("resolves error when the fetch or decode fails", async () => {
    const outcome = await playViaWebAudio("https://x.test/a.mp3", {
      decode: () => Promise.reject(new Error("audio fetch 403")),
    });
    assert.equal(outcome, "error");
  });

  it("resolves error when a decoder throws while starting the voice", async () => {
    const outcome = await playViaWebAudio("https://x.test/a.mp3", {
      decode: () => Promise.resolve({
        play() {
          throw new Error("no destination");
        },
      }),
    });
    assert.equal(outcome, "error");
  });

  it("resolves error when the source fails mid-playback", async () => {
    const voice = fakeVoice();
    const promise = playViaWebAudio("https://x.test/a.mp3", voice.decoder);
    await flush();
    voice.fail();
    assert.equal(await promise, "error");
  });

  it("stops a stalled clip and bounds it, so the queue moves on", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const voice = fakeVoice();
    const promise = playViaWebAudio("https://x.test/a.mp3", voice.decoder, PLAYBACK_TIMEOUT_MS);
    await flush();

    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    assert.equal(await promise, "timeout");
    assert.equal(voice.state.stopped, 1, "a stalled clip must be stopped, not left talking");
  });

  it("resolves exactly once when a late finish follows a timeout", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const voice = fakeVoice();
    const seen: PlaybackOutcome[] = [];
    const promise = playViaWebAudio("https://x.test/a.mp3", voice.decoder, PLAYBACK_TIMEOUT_MS);
    promise.then((o) => seen.push(o));
    await flush();

    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    await promise;
    voice.finish();
    await flush();

    assert.deepEqual(seen, ["timeout"]);
  });

  it("does not let a later timeout overwrite an outcome already settled", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const voice = fakeVoice();
    const seen: PlaybackOutcome[] = [];
    const promise = playViaWebAudio("https://x.test/a.mp3", voice.decoder, PLAYBACK_TIMEOUT_MS);
    promise.then((o) => seen.push(o));
    await flush();

    // `finished` settles through a microtask, so let it land before the clock
    // moves; otherwise the tick would win a race it never really had.
    voice.finish();
    await flush();
    mock.timers.tick(PLAYBACK_TIMEOUT_MS * 2);
    await promise;
    await flush();

    assert.deepEqual(seen, ["ended"]);
  });
});

describe("playAudioToEnd — races settle exactly once", () => {
  it("a timeout and an ended event in the same tick resolve once", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { seen, settled } = track(playAudioToEnd(audio));

    audio.emit("ended");
    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    await settled;
    await Promise.resolve();

    assert.deepEqual(seen, ["ended"], "only the first outcome may be delivered");
    assert.equal(audio.pauseCalls, 0);
  });

  it("an error after a timeout does not deliver a second outcome", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { seen, settled } = track(playAudioToEnd(audio));

    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    audio.emit("error");
    await settled;
    await Promise.resolve();

    assert.deepEqual(seen, ["timeout"]);
  });

  it("cleans up listeners once even when every path fires", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const audio = new FakeAudio();
    const { settled } = track(playAudioToEnd(audio));

    audio.emit("error");
    audio.emit("ended");
    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    await settled;

    const removals = audio.removed.filter((t) => t === "ended").length;
    assert.equal(removals, 1, "listeners are detached on the single settling path");
  });
});

describe("playAudioToEnd — tolerance for a minimal element", () => {
  it("works without pause(), currentTime or listener methods", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const bare = {
      play: () => undefined,
    };
    const { settled } = track(playAudioToEnd(bare));

    mock.timers.tick(PLAYBACK_TIMEOUT_MS);
    assert.equal(await settled, "timeout");
  });
});