import { isDonationVoicePath } from "./donation-voice-path.ts";

type DonationVoiceTip = {
  creator_id: unknown;
  payment_status: unknown;
  voice_path: unknown;
};

export function getAuthorizedDonationVoicePath(
  tip: DonationVoiceTip | null,
  creatorId: string,
): string | null {
  if (!tip || !creatorId || tip.creator_id !== creatorId) {
    return null;
  }

  if (
    tip.payment_status !== "successful" &&
    tip.payment_status !== "test"
  ) {
    return null;
  }

  return isDonationVoicePath(tip.voice_path) ? tip.voice_path : null;
}
