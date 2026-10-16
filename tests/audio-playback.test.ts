import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
  playAudioToEnd,
  PLAYBACK_TIMEOUT_MS,
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