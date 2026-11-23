import type { Metadata } from "next";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getSetupReadiness,
  getSelectedCloneReadiness,
} from "@/lib/setup-guide-readiness";
import SetupGuideExperience from "./SetupGuideExperience";
import { guideCategories, guides } from "./guides";
import styles from "./setup-guides-redesign.module.css";

export const metadata: Metadata = {
  title: "Setup Guides | Steam Kit",
  description:
    "Interactive walkthroughs for configuring Steam Kit creator features, overlays, alerts, tipping, and integrations.",
};

type SetupGuidesPageProps = {
  searchParams: Promise<{
    guide?: string | string[];
    step?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SetupGuidesPage({
  searchParams,
}: SetupGuidesPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const readiness = user
    ? await (async () => {
        const [
          profileResult,
          overlayResult,
          voiceResult,
          clonesResult,
          telegramResult,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("username, display_name")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("streamkit_overlay_credentials")
            .select("creator_id")
            .eq("creator_id", user.id)
            .maybeSingle(),
          supabase
            .from("voice_settings")
            .select("cloning_enabled, active_clone_id")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("voice_clones")
            .select("id, consent_at, voicestudio_voice_id")
            .eq("owner_id", user.id),
          supabase
            .from("telegram_groups")
            .select("creator_id")
            .eq("creator_id", user.id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle(),
        ]);

        const activeCloneId = voiceResult.data?.active_clone_id ?? null;
        const selectedCloneReadiness = getSelectedCloneReadiness(
          voiceResult.data?.cloning_enabled === true,
          activeCloneId,
          (clonesResult.data ?? []).map((clone) => ({
            id: clone.id,
            consentAt: clone.consent_at,
            voiceStudioVoiceId: clone.voicestudio_voice_id,
          })),
        );

        return getSetupReadiness({
          profile: profileResult.data
            ? {
                username: profileResult.data.username,
                displayName: profileResult.data.display_name,
              }
            : null,
          profileUnavailable: Boolean(profileResult.error),
          overlayCredentialExists: Boolean(overlayResult.data),
          overlayUnavailable: Boolean(overlayResult.error),
          selectedCloneReadiness,
          voiceUnavailable: Boolean(voiceResult.error || clonesResult.error),
          telegramGroupLinked: Boolean(telegramResult.data),
          telegramUnavailable: Boolean(telegramResult.error),
        });
      })()
    : getSetupReadiness({
        profile: null,
        profileUnavailable: true,
        overlayCredentialExists: false,
        overlayUnavailable: true,
        selectedCloneReadiness: "not_selected",
        voiceUnavailable: true,
        telegramGroupLinked: false,
        telegramUnavailable: true,
      });

  const requestedGuideSlug = firstValue(params.guide);
  const requestedGuide = guides.find(
    (guide) => guide.slug === requestedGuideSlug,
  );
  const requestedStep = Number.parseInt(firstValue(params.step) ?? "", 10);
  const initialStep =
    requestedGuide && Number.isFinite(requestedStep)
      ? Math.max(requestedStep - 1, 0)
      : undefined;

  return (
    <div className={styles.page}>
      <SetupGuideExperience
        key={`${requestedGuide?.slug ?? "default"}-${initialStep ?? 0}`}
        guides={guides}
        readiness={readiness}
        initialSlug={requestedGuide?.slug}
        initialStep={initialStep}
      />

      <details className={styles.coverage}>
        <summary>
          <span>
            <ShieldCheck size={13} aria-hidden="true" />
            Scope &amp; limitations · {guides.length} guides across{" "}
            {guideCategories.length} categories
          </span>
          <ChevronDown
            className={styles.chevron}
            size={14}
            aria-hidden="true"
          />
        </summary>
        <div className={styles.coverageBody}>
          <div>
            <h2>What these walkthroughs do not cover</h2>
            <p>
              A feature gets a walkthrough only when this build exposes a
              complete, verifiable setup path. These areas are intentionally left
              out rather than documented with invented controls.
            </p>
          </div>
          <ul className={styles.coverageList}>
            <li>
              <strong>Media Share</strong>
              <span>
                The public tip form shows a YouTube field, but there is no
                verified queue-to-overlay playback flow in this build.
              </span>
            </li>
            <li>
              <strong>YouTube Live Chat</strong>
              <span>
                This build has no YouTube account connection or live-chat
                listener.
              </span>
            </li>
            <li>
              <strong>Subscriptions</strong>
              <span>
                Subscription plans are not configured, so there is no creator
                setup flow to document.
              </span>
            </li>
            <li>
              <strong>Discord account linking</strong>
              <span>
                Discord OAuth is not configured. Telegram is the only supported
                integration walkthrough here.
              </span>
            </li>
            <li>
              <strong>Supporter alert tab</strong>
              <span>
                The tab exists, but it does not expose a separate supporter alert
                configuration in this build.
              </span>
            </li>
          </ul>
        </div>
      </details>
    </div>
  );
}
