import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ALERT_TTS_GENERATION_TIMEOUT_MS,
  remainingTtsGenerationBudget,
  ttsGenerationFailureStatus,
} from "../src/lib/voice/tts-timeouts.ts";
import { shouldUseDefaultVoiceFallback } from "../src/lib/voice/tts-fallback.ts";

describe("synthesis budget and fallback policy", () => {
  it("uses the configured whole-request budget for cold VoiceStudio startup", () => {
    assert.equal(ALERT_TTS_GENERATION_TIMEOUT_MS, 55_000);
    assert.ok(40_000 < ALERT_TTS_GENERATION_TIMEOUT_MS);
  });

  it("shares one deadline across clone and fallback synthesis", () => {
    const startedAt = 1_000;
    const deadline = startedAt + ALERT_TTS_GENERATION_TIMEOUT_MS;

    assert.equal(remainingTtsGenerationBudget(deadline, startedAt), 55_000);
    assert.equal(remainingTtsGenerationBudget(deadline, startedAt + 20_000), 35_000);
    assert.equal(remainingTtsGenerationBudget(deadline, deadline), 0);
    assert.equal(remainingTtsGenerationBudget(deadline, deadline + 1_000), 0);
  });

  it("keeps timeouts distinct from provider failures", () => {
    assert.equal(ttsGenerationFailureStatus(true), 504);
    assert.equal(ttsGenerationFailureStatus(false), 502);
  });

  it("uses the default voice only after a clone receives a retryable provider error", () => {
    assert.equal(
      shouldUseDefaultVoiceFallback({ voiceSource: "clone", failureKind: "provider" }),
      true,
    );
    assert.equal(
      shouldUseDefaultVoiceFallback({ voiceSource: "clone", failureKind: "timeout" }),
      false,
    );
    assert.equal(
      shouldUseDefaultVoiceFallback({ voiceSource: "clone", failureKind: "transport" }),
      false,
    );
    assert.equal(
      shouldUseDefaultVoiceFallback({
        voiceSource: "clone",
        failureKind: "provider",
        providerRefused: true,
      }),
      false,
    );
    assert.equal(
      shouldUseDefaultVoiceFallback({ voiceSource: "fallback", failureKind: "provider" }),
      false,
    );
  });

  it("wires the route to one shared deadline and never retries a timed-out clone", () => {
    const route = readFileSync(
      join(process.cwd(), "src", "app", "api", "tts", "synthesize", "route.ts"),
      "utf8",
    );

    assert.match(route, /const remaining = \(\) => remainingTtsGenerationBudget\(deadline\)/);
    assert.match(route, /shouldUseDefaultVoiceFallback\(\{/);
    assert.match(route, /voiceId = DEFAULT_VOICE_ID;\s*voiceSource = "fallback";\s*fellBack = true;/);
    assert.match(route, /audioBuffer = await attemptSynthesis\(voiceId, text, remaining\(\)\)/);

    const timeoutStart = route.indexOf("if (error instanceof TimeoutError)");
    const fallbackDecision = route.indexOf("const shouldFallback = shouldUseDefaultVoiceFallback", timeoutStart);
    assert.ok(timeoutStart >= 0 && fallbackDecision > timeoutStart);
    assert.match(route.slice(timeoutStart, fallbackDecision), /return NextResponse\.json\([\s\S]*ttsGenerationFailureStatus\(true\)/);
  });
});
