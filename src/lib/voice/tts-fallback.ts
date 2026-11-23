export type TtsVoiceSource = "clone" | "fallback";
export type TtsFailureKind = "timeout" | "provider" | "transport";

/** Only retry a clone after an answered provider error; timeout and transport errors may leave work running. */
export function shouldUseDefaultVoiceFallback(input: {
  voiceSource: TtsVoiceSource;
  failureKind: TtsFailureKind;
  providerRefused?: boolean;
}): boolean {
  return (
    input.voiceSource === "clone" &&
    input.failureKind === "provider" &&
    input.providerRefused !== true
  );
}
