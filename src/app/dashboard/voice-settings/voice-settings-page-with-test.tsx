// src/app/dashboard/voice-settings/voice-settings-page-with-test.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./voice-settings.module.css";

type VoiceClone = {
  id: string;
  label: string;
  voicestudio_voice_id: string | null;
  consent_at: string | null;
  created_at: string;
};

/** The supabase browser client, as `createClient()` builds it. */
type Supabase = ReturnType<typeof createClient>;

/**
 * Reads the creator's clones. A plain fetch with no state of its own, so both
 * the mount effect and the post-upload refresh share one query — and so the
 * effect's state updates all sit after an await, which is what keeps
 * `react-hooks/set-state-in-effect` quiet about cascading renders.
 */
async function fetchCloneRows(supabase: Supabase) {
  const { data, error } = await supabase
    .from("voice_clones")
    .select("id, label, voicestudio_voice_id, consent_at, created_at")
    .order("created_at", { ascending: false });
  return { rows: (data ?? []) as VoiceClone[], error };
}

/**
 * Sample-length rules, from the engine's own reference policy
 * (`omnivoice/models/omnivoice.py`): without a transcript a reference longer
 * than one 15s window needs a speech-to-text model to pick the passage out of
 * it, and with none installed the clone is accepted at upload and only refused
 * when an alert tries to speak — the worst possible moment to find out. With a
 * transcript the cap is 20s, above which ASR is required either way.
 *
 * Measured in the browser because the server cannot decode the container
 * cheaply. The server re-checks nothing here, so `null` (a container the
 * browser cannot read) deliberately does not block the upload.
 */
const SAMPLE_MIN_SECONDS = 3;
const SAMPLE_MAX_SECONDS = 15;
const TRANSCRIPT_REQUIRED_OVER_SECONDS = 15;
const TRANSCRIPT_MAX_SECONDS = 20;

const DEFAULT_TEST_PHRASE =
  "This is a test of your alert voice. Thanks so much for the support!";

/**
 * A clone can only be spoken when BOTH conditions hold, and both routes enforce
 * them: `consent_at` says the sample cleared consent, `voicestudio_voice_id`
 * says the provider actually handed back an id. The badge used to key on
 * consent alone, which rendered a "Ready" voice the preview route then refused
 * with a 409 — the one place a creator would have found out.
 */
function isSpeakable(clone: VoiceClone): boolean {
  return Boolean(clone.consent_at && clone.voicestudio_voice_id);
}

/** Duration in seconds, or null when the browser cannot read the container. */
function sampleDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.addEventListener(
      "loadedmetadata",
      () => finish(Number.isFinite(audio.duration) ? audio.duration : null),
      { once: true },
    );
    audio.addEventListener("error", () => finish(null), { once: true });
    audio.src = url;
  });
}

export default function VoiceSettingsPage() {
  const [supabase] = useState(() => createClient());
  const [clones, setClones] = useState<VoiceClone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [refText, setRefText] = useState("");
  const [clipDuration, setClipDuration] = useState<number | null>(null);
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [testPhrase, setTestPhrase] = useState(DEFAULT_TEST_PHRASE);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const applyRows = useCallback(
    (rows: VoiceClone[] | null, queryError: { message: string } | null) => {
      if (queryError) {
        // Swallowing this renders an empty list, which looks identical to "you
        // have no voices". A missing migration or a broken RLS policy must show.
        setLoadError(`Could not load your voices: ${queryError.message}`);
        setClones([]);
      } else {
        setLoadError(null);
        setClones(rows ?? []);
      }
      setLoading(false);
    },
    [],
  );

  const loadClones = useCallback(async () => {
    const { rows, error: queryError } = await fetchCloneRows(supabase);
    applyRows(rows, queryError);
  }, [supabase, applyRows]);

  // The fetch is declared inside the effect and every state update sits after
  // an await, so nothing cascades on the mount render.
  useEffect(() => {
    void (async () => {
      const { rows, error: queryError } = await fetchCloneRows(supabase);
      applyRows(rows, queryError);
    })();
  }, [supabase, applyRows]);

  // Newest first, so the first usable clone is the one alerts speak with.
  // Derived during render: this page holds one list and the cost is a `find`.
  // Mirrors the synthesis route's choice — the two must agree, or this page
  // advertises a voice nothing speaks with.
  const activeVoice = clones.find((c) => c.consent_at && c.voicestudio_voice_id) ?? null;
  const transcriptRequired =
    clipDuration !== null && clipDuration > TRANSCRIPT_REQUIRED_OVER_SECONDS;

  async function handleFileChange(picked: File | null) {
    setFile(picked);
    setClipDuration(null);
    if (picked) setClipDuration(await sampleDuration(picked));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Add a voice sample before uploading.");
      return;
    }
    if (clipDuration !== null && clipDuration > TRANSCRIPT_MAX_SECONDS) {
      setError(
        `That sample is ${clipDuration.toFixed(1)}s. Trim it to ${TRANSCRIPT_MAX_SECONDS}s or less — ` +
          "past that the engine needs a speech-to-text model to pick the passage, and none is installed.",
      );
      return;
    }
    if (clipDuration !== null && clipDuration < SAMPLE_MIN_SECONDS) {
      setError(`That sample is only ${clipDuration.toFixed(1)}s. Record at least ${SAMPLE_MIN_SECONDS}s of speech.`);
      return;
    }
    if (transcriptRequired && !refText.trim()) {
      setError(
        `This clip is over ${TRANSCRIPT_REQUIRED_OVER_SECONDS}s, so it needs a transcript of exactly what is said.`,
      );
      return;
    }
    if (!consented) {
      setError("Confirm you have the right to clone this voice.");
      return;
    }

    setSubmitting(true);
    const form = new FormData();
    form.append("label", label.trim());
    form.append("sample", file);
    // Load-bearing: it is what makes consent_at non-null, and a null consent_at
    // hides the clone from the overlay entirely.
    form.append("consent", "true");
    if (refText.trim()) form.append("ref_text", refText.trim());

    try {
      const res = await fetch("/api/voice-clones", { method: "POST", body: form });

      if (!res.ok) {
        // The server distinguishes config (503), consent (400), format (415),
        // size (413) and provider failure (502); prefer its message.
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Upload failed. Try a shorter, cleaner sample.");
        return;
      }

      setLabel("");
      setFile(null);
      setRefText("");
      setClipDuration(null);
      setConsented(false);
      await loadClones();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setTestError(null);
    setRemovingId(id);
    try {
      const res = await fetch(`/api/voice-clones/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not remove that voice.");
        return;
      }
      setClones((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Could not remove that voice.");
    } finally {
      setRemovingId(null);
    }
  }

  /**
   * Previews a clone through the session-authed test route. The button is
   * disabled until consent is recorded, which is the same gate the route and
   * the alert route enforce — there is no point previewing a voice the overlay
   * would refuse to speak.
   */
  async function handleTest(id: string) {
    setTestError(null);
    setTestingId(id);
    try {
      const res = await fetch(`/api/voice-clones/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testPhrase }),
      });
      const payload = (await res.json().catch(() => null)) as {
        audioUrl?: string;
        error?: string;
      } | null;
      if (!res.ok || !payload?.audioUrl) {
        setTestError(payload?.error ?? "Test failed.");
        return;
      }
      // A new Audio element per click: reusing one would cut a short clip short
      // by loading the next URL into the element that is still playing.
      const audio = new Audio(payload.audioUrl);
      audio.addEventListener("error", () => setTestError("Preview audio could not be played."));
      await audio.play().catch(() => {
        // Autoplay can be refused if the browser source has never been clicked;
        // the clip is still downloadable from the same URL.
        setTestError("Your browser blocked playback. Interact with the page, then try again.");
      });
    } catch {
      setTestError("Test failed — the TTS backend may be unreachable.");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headline}>Alert voices</h1>
        <p className={styles.subhead}>
          Add a voice to read your donation alerts out loud. Every clone needs a sample
          and a confirmation that you have the right to use it.
        </p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Add a voice</h2>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>Voice name</span>
            <input
              className={styles.input}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. My stream voice"
              maxLength={80}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              Sample audio ({SAMPLE_MIN_SECONDS}s–{SAMPLE_MAX_SECONDS}s, clean speech)
            </span>
            <input
              className={styles.input}
              type="file"
              accept="audio/*"
              onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
              required
            />
            {clipDuration !== null && (
              <span className={styles.subhead}>
                {clipDuration.toFixed(1)}s
                {transcriptRequired
                  ? ` — over ${TRANSCRIPT_REQUIRED_OVER_SECONDS}s, so a transcript is required below`
                  : ""}
              </span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              Reference transcript{" "}
              {transcriptRequired
                ? "(required for this clip length)"
                : "(optional — lets the engine clone a longer clip)"}
            </span>
            <input
              className={styles.input}
              type="text"
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              placeholder="Type exactly what is said in the sample audio"
              maxLength={600}
            />
          </label>

          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
            />
            <span>
              I confirm this is my own voice, or I have explicit consent from the
              speaker to clone and use it for donation alerts.
            </span>
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {submitting ? "Cloning…" : "Create voice"}
          </button>
        </form>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Your voices</h2>

        {!loading && !loadError && (
          <p className={styles.subhead}>
            Alerts read aloud with{" "}
            <strong>{activeVoice ? `"${activeVoice.label}"` : "the default voice"}</strong>
            .
          </p>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Test phrase</span>
          <input
            className={styles.input}
            type="text"
            value={testPhrase}
            onChange={(e) => setTestPhrase(e.target.value)}
            maxLength={300}
          />
        </label>

        {testError && (
          <p className={styles.error} role="alert">
            {testError}
          </p>
        )}

        {loading && <p className={styles.subhead}>Loading…</p>}

        {loadError && (
          <p className={styles.error} role="alert">
            {loadError}
          </p>
        )}

        {!loading && !loadError && clones.length === 0 && (
          <p className={styles.subhead}>No voices yet. Add one above to get started.</p>
        )}

        <ul className={styles.voiceList}>
          {clones.map((clone) => {
            const speakable = isSpeakable(clone);
            return (
              <li key={clone.id} className={styles.voiceRow}>
                <div className={styles.voiceInfo}>
                  <span className={styles.voiceName}>{clone.label}</span>
                  <span className={speakable ? styles.badgeLive : styles.badgePending}>
                    {!clone.consent_at
                      ? "Pending consent"
                      : speakable
                        ? "Ready"
                        : "No provider id"}
                  </span>
                </div>
                <div className={styles.voiceActions}>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => void handleTest(clone.id)}
                    disabled={!speakable || testingId === clone.id}
                    title={
                      speakable
                        ? "Play this voice speaking the test phrase"
                        : !clone.consent_at
                          ? "Record consent when creating the voice to preview it"
                          : "This clone has no provider voice id, so there is nothing to speak"
                    }
                  >
                    {testingId === clone.id ? "Generating…" : "Test this voice"}
                  </button>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => void handleDelete(clone.id)}
                    disabled={removingId === clone.id}
                  >
                    {removingId === clone.id ? "Removing…" : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}