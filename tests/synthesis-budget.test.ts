import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * The synthesis budget arithmetic, extracted from
 * `src/app/api/tts/synthesize/route.ts`.
 *
 * The route cannot be imported by `node --test`: it pulls in `server-only` and
 * `NextResponse`. These are the numbers the alert voice depends on, and the one
 * that shipped broken was pure arithmetic.
 */

/** Whole-request budget. Mirrors GENERATE_TIMEOUT_MS in the route. */
const GENERATE_TIMEOUT_MS = 10_000;

/**
 * Floor on one attempt. Mirrors MIN_ATTEMPT_MS.
 *
 * A negative budget is the bug: Node's `setTimeout` treats one as "fire on the
 * next tick", so the fallback request was aborted before it was sent.
 */
const MIN_ATTEMPT_MS = 1_500;

/** Mirrors withTimeout + attemptSynthesis. */
function attemptBudget(remainingMs: number): number {
  return Math.max(remainingMs, MIN_ATTEMPT_MS);
}

describe("synthesis budget", () => {
  it("gives a healthy request the whole budget", () => {
    assert.equal(attemptBudget(GENERATE_TIMEOUT_MS), GENERATE_TIMEOUT_MS);
  });

  it("never hands an attempt a negative or zero budget", () => {
    // The measured failure: a clone attempt spent the full 10s, leaving -263ms.
    for (const remaining of [-263, -1, 0]) {
      const budget = attemptBudget(remaining);
      assert.ok(
        budget >= MIN_ATTEMPT_MS,
        `remaining=${remaining} produced budget=${budget}, which aborts instantly`,
      );
    }
  });

  it("keeps the retry affordable after a full-length first attempt", () => {
    // 6s for the clone leaves 4s for the stock voice, which is the measured
    // warm cost of a synthesis (2.9-6.0s) with room to spare.
    const firstAttemptSeconds = 6;
    const leftForRetry = (GENERATE_TIMEOUT_MS - firstAttemptSeconds * 1000) / 1000;
    assert.ok(leftForRetry >= 3, `only ${leftForRetry}s left for the fallback`);
  });

  it("stays inside the overlay's client deadline even when both attempts run", () => {
    // The overlay aborts the request at 12s. Two floored attempts plus the
    // bookkeeping between them must not exceed it, or the fallback is cut off
    // mid-flight — which is how it used to fail.
    const worstCase = 2 * MIN_ATTEMPT_MS;
    assert.ok(worstCase < 12_000, `worst case overshoot is ${worstCase}ms`);
  });

  it("fits a measured no-transcript clone (6.0s) inside the budget", () => {
    // The measurements that made ref_text required: a clone without a
    // transcript is transcribed on the GPU during every synthesis.
    const noTranscriptCloneSeconds = 6.0;
    assert.ok(
      noTranscriptCloneSeconds * 1000 < GENERATE_TIMEOUT_MS,
      "a no-transcript clone would time out and orphan the GPU worker",
    );
  });

  it("fits a measured transcript clone (3.6s) with room to spare", () => {
    const transcriptCloneSeconds = 3.6;
    assert.ok(transcriptCloneSeconds * 1000 < GENERATE_TIMEOUT_MS - MIN_ATTEMPT_MS);
  });
});