// src/app/dashboard/voice-settings/voice-settings-page-with-test.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playAudioToEnd } from "@/lib/overlay/audio-playback";
import { Pencil, Play, Scissors, Trash2, WandSparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/ui/PageHeader";
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
const SAMPLE_MAX_SECONDS = 35;
const TRANSCRIPT_MAX_SECONDS = 35;

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

function audioBufferToWav(buffer: AudioBuffer, startSeconds: number, endSeconds: number): Blob {
  const channels = buffer.numberOfChannels;
  const start = Math.floor(startSeconds * buffer.sampleRate);
  const end = Math.min(buffer.length, Math.floor(endSeconds * buffer.sampleRate));
  const frames = Math.max(0, end - start);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const bytes = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bytes);
  const writeText = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = start; frame < end; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel]![frame]!));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export default function VoiceSettingsPage() {
  const [supabase] = useState(() => createClient());
  const [clones, setClones] = useState<VoiceClone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [refText, setRefText] = useState("");
  const [clipDuration, setClipDuration] = useState<number | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [trimming, setTrimming] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptNotice, setTranscriptNotice] = useState<string | null>(null);
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<"auto" | "km" | "en">("auto");
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [testPhrase, setTestPhrase] = useState(DEFAULT_TEST_PHRASE);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);
  const mountedRef = useRef(true);
  const [activeCloneId, setActiveCloneId] = useState<string | null>(null);
  const [spokenAlertsEnabled, setSpokenAlertsEnabled] = useState(true);
  const [savingActiveId, setSavingActiveId] = useState<string | null>(null);

  /**
   * Which voice the donation alert speaks with. Mirrors `voice_settings`, which
   * /api/tts/synthesize reads to decide between the creator's chosen clone and
   * the "newest consented clone" it used to assume on their behalf.
   */
  const loadActiveClone = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data, error: queryError } = await supabase
      .from("voice_settings")
      .select("cloning_enabled, active_clone_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (queryError) return;
    setActiveCloneId(data?.cloning_enabled ? data.active_clone_id ?? null : null);

    const { data: alertRows } = await supabase
      .from("alert_settings")
      .select("tts_enabled")
      .eq("user_id", userData.user.id);
    setSpokenAlertsEnabled(
      alertRows !== null &&
        alertRows !== undefined &&
        !alertRows.some((row) => row.tts_enabled === false),
    );
  }, [supabase]);

  const handleSetActive = useCallback(
    async (cloneId: string | null) => {
      setSavingActiveId(cloneId ?? "");
      setTestError(null);
      try {
        const res = await fetch("/api/voice-settings/active-clone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cloneId }),
        });
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          setTestError(payload?.error ?? "Could not save that choice.");
          return;
        }
        setActiveCloneId(cloneId);
        if (cloneId) setSpokenAlertsEnabled(true);
      } finally {
        setSavingActiveId(null);
      }
    },
    [],
  );

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
      await loadActiveClone();
    })();
  }, [supabase, applyRows, loadActiveClone]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);

    const audio = testAudioRef.current;
    testAudioRef.current = null;
    if (audio) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // The element may already be detached.
      }
      }
    };
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setCreateOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, submitting]);

  // Match /api/tts/synthesize: an explicitly selected speakable clone wins;
  // otherwise alerts use the newest speakable clone automatically.
  const activeVoice =
    clones.find(
      (clone) =>
        clone.id === activeCloneId && clone.consent_at && clone.voicestudio_voice_id,
    ) ?? clones.find((clone) => clone.consent_at && clone.voicestudio_voice_id) ?? null;

  async function handleFileChange(picked: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = picked ? URL.createObjectURL(picked) : null;
    setPreviewUrl(previewUrlRef.current);
    setFile(picked);
    setClipDuration(null);
    setTrimStart(0);
    setTrimEnd(0);
    setTranscriptNotice(null);
    setRefText("");
    setError(null);
    if (picked) {
      const duration = await sampleDuration(picked);
      setClipDuration(duration);
      setTrimEnd(duration ?? 0);
    }
  }

  async function handleApplyTrim() {
    if (!file || clipDuration === null) return;
    const duration = trimEnd - trimStart;
    if (trimStart < 0 || duration < SAMPLE_MIN_SECONDS) {
      setError(`Keep at least ${SAMPLE_MIN_SECONDS} seconds of speech in the selection.`);
      return;
    }
    if (duration > TRANSCRIPT_MAX_SECONDS) {
      setError(`Keep the selected sample under ${TRANSCRIPT_MAX_SECONDS} seconds.`);
      return;
    }

    setTrimming(true);
    setError(null);
    try {
      const context = new AudioContext();
      try {
        const audioBuffer = await context.decodeAudioData(await file.arrayBuffer());
        const wav = audioBufferToWav(audioBuffer, trimStart, trimEnd);
        const trimmed = new File([wav], `${file.name.replace(/\.[^.]+$/, "")}-trimmed.wav`, {
          type: "audio/wav",
          lastModified: Date.now(),
        });
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = URL.createObjectURL(trimmed);
        setPreviewUrl(previewUrlRef.current);
        setFile(trimmed);
        setClipDuration(duration);
        setTrimStart(0);
        setTrimEnd(duration);
        setTranscriptNotice("Trim applied. Generate or update the transcript for this clip, then check it against the audio.");
        setRefText("");
      } finally {
        await context.close().catch(() => {});
      }
    } catch {
      setError("This audio format could not be trimmed in the browser. Try a WAV, MP3, or M4A recording.");
    } finally {
      setTrimming(false);
    }
  }

  async function handleAutoTranscribe() {
    if (!file || transcribing) return;
    setTranscribing(true);
    setError(null);
    setTranscriptNotice(null);
    try {
      const form = new FormData();
      form.append("sample", file);
      if (transcriptionLanguage !== "auto") form.append("language", transcriptionLanguage);
      const res = await fetch("/api/voice-clones/transcribe", { method: "POST", body: form });
      const payload = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok || !payload?.text) {
        setError(payload?.error ?? "Could not transcribe this sample. Enter the words manually.");
        return;
      }
      setRefText(payload.text);
      setTranscriptNotice("Draft generated. Listen to your recording and correct any mistakes before creating the clone, especially for Khmer speech.");
    } catch {
      setError("Transcription failed. Check the VoiceStudio service or enter the words manually.");
    } finally {
      setTranscribing(false);
    }
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
        `That sample is ${clipDuration.toFixed(1)}s. Trim it to ${TRANSCRIPT_MAX_SECONDS}s or less.`,
      );
      return;
    }
    if (clipDuration !== null && clipDuration < SAMPLE_MIN_SECONDS) {
      setError(`That sample is only ${clipDuration.toFixed(1)}s. Record at least ${SAMPLE_MIN_SECONDS}s of speech.`);
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
    // Required by the route, and by the physics of the instance: a clone without
    // a transcript is transcribed on the GPU during every synthesis.
    form.append("ref_text", refText.trim());

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
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      setPreviewUrl(null);
      previewUrlRef.current = null;
      setRefText("");
      setClipDuration(null);
      setConsented(false);
      setCreateOpen(false);
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

  async function handleRename(clone: VoiceClone) {
    const nextLabel = window.prompt("Rename voice clone", clone.label)?.trim();
    if (!nextLabel || nextLabel === clone.label) return;
    setError(null);
    try {
      const res = await fetch(`/api/voice-clones/${clone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: nextLabel }),
      });
      const payload = (await res.json().catch(() => null)) as { clone?: VoiceClone; error?: string } | null;
      if (!res.ok || !payload?.clone) {
        setError(payload?.error ?? "Could not rename that voice.");
        return;
      }
      setClones((current) => current.map((item) => item.id === clone.id ? payload.clone! : item));
    } catch {
      setError("Could not rename that voice. Check your connection and try again.");
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
      if (!mountedRef.current) return;
      if (!res.ok || !payload?.audioUrl) {
        setTestError(payload?.error ?? "Test failed.");
        return;
      }
      // A new Audio element per test keeps each preview independent.
      const previousAudio = testAudioRef.current;
      if (previousAudio) {
        previousAudio.pause();
        try {
          previousAudio.currentTime = 0;
        } catch {
          // The previous element may already be detached.
        }
      }

      const audio = new Audio(payload.audioUrl);
      testAudioRef.current = audio;
      const outcome = await playAudioToEnd(audio, 45_000);
      if (!mountedRef.current) return;

      if (testAudioRef.current === audio) {
        testAudioRef.current = null;
      }

      if (outcome !== "ended") {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          // The element may already be detached.
        }
        setTestError(
          outcome === "timeout"
            ? "Preview audio timed out. Please try again."
            : "Preview audio could not be played. Interact with the page, then try again."
        );
      }
    } catch {
      if (mountedRef.current) {
        setTestError("Test failed — the TTS backend may be unreachable.");
      }
    } finally {
      if (mountedRef.current) setTestingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Steam Kit // Voice"
        title="Voice clones"
        description="Create a voice and choose which one reads your donation alerts."
        actions={
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              setError(null);
              setCreateOpen(true);
            }}
          >
            <span aria-hidden="true">＋</span> Add voice clone
          </button>
        }
      />

      <section className={styles.card} aria-labelledby="tts-settings-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Alert audio</p>
            <h2 id="tts-settings-title" className={styles.cardTitle}>Text-to-speech settings</h2>
          </div>
          <span className={spokenAlertsEnabled ? styles.badgeLive : styles.badgePending}>
            {spokenAlertsEnabled ? "Speech enabled" : "Speech muted in Alerts"}
          </span>
        </div>
        <div className={styles.settingsGrid}>
          <label className={styles.field}>
            <span className={styles.label}>TTS engine</span>
            <div className={styles.engineValue}>
              <span className={styles.statusDot} /> StreamKit voice synthesis
              <span className={styles.engineNote}>Automatic</span>
            </div>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Voice clone for donation alerts</span>
            <select
              className={styles.input}
              value={activeCloneId ?? ""}
              onChange={(event) => void handleSetActive(event.target.value || null)}
              disabled={savingActiveId !== null || loading}
            >
              <option value="">Automatic (newest ready voice)</option>
              {clones.filter(isSpeakable).map((clone) => (
                <option key={clone.id} value={clone.id}>{clone.label}</option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.settingsHint}>
          {activeVoice
            ? `Donation alerts will use “${activeVoice.label}” when spoken alerts are enabled.`
            : "Choose a ready clone to have donation alerts spoken in that voice. Your default voice remains available as a fallback."}
        </p>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Voice library</p>
            <h2 className={styles.cardTitle}>My voice clones</h2>
          </div>
          <span className={styles.count}>{clones.length} voices</span>
        </div>

        {!loading && !loadError && activeVoice && !spokenAlertsEnabled && (
          <p className={styles.notice} role="status">
            The clone is selected, but spoken alerts are muted. Turn text-to-speech on in Alert Settings.
          </p>
        )}
        <div className={styles.testPanel}>
          <label className={styles.field}>
            <span className={styles.label}>Preview phrase</span>
            <input className={styles.input} type="text" value={testPhrase} onChange={(e) => setTestPhrase(e.target.value)} maxLength={300} />
          </label>
          {testError && <p className={styles.error} role="alert">{testError}</p>}
        </div>

        {loading && <p className={styles.subhead}>Loading voices…</p>}
        {loadError && <p className={styles.error} role="alert">{loadError}</p>}
        {error && !createOpen && <p className={styles.error} role="alert">{error}</p>}
        {!loading && !loadError && clones.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true">◉</span>
            <strong>No voice clones yet</strong>
            <span>Add a short voice sample to create your first clone.</span>
            <button type="button" className={styles.secondaryButton} onClick={() => setCreateOpen(true)}>Create a voice clone</button>
          </div>
        )}

        <ul className={styles.voiceList}>
          {clones.map((clone) => {
            const speakable = isSpeakable(clone);
            const isActive = activeCloneId === clone.id;
            return (
              <li key={clone.id} className={`${styles.voiceRow} ${isActive ? styles.voiceSelected : ""}`}>
                <div className={styles.voiceInfo}>
                  <span className={styles.voiceAvatar} aria-hidden="true">{clone.label.slice(0, 1).toUpperCase()}</span>
                  <div className={styles.voiceMeta}>
                    <span className={styles.voiceName}>{clone.label}</span>
                    <span className={styles.voiceCaption}>{speakable ? "Voice clone · VoiceStudio" : "Setup required before this voice can speak"}</span>
                  </div>
                  <span className={speakable ? styles.badgeLive : styles.badgePending}>
                    {!clone.consent_at ? "Pending consent" : speakable ? isActive ? "Selected for alerts" : "Ready" : "Unavailable"}
                  </span>
                </div>
                <div className={styles.voiceActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => void handleTest(clone.id)}
                    disabled={!speakable || testingId !== null}
                    aria-label={`Test ${clone.label}`}
                    title={speakable ? "Test voice" : "This voice needs consent and a provider ID before it can speak"}
                    aria-busy={testingId === clone.id}
                  >
                    {testingId === clone.id ? <span className={styles.iconSpinner} aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => void handleRename(clone)}
                    aria-label={`Rename ${clone.label}`}
                    title="Rename voice"
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                    onClick={() => void handleDelete(clone.id)}
                    disabled={removingId !== null}
                    aria-label={`Delete ${clone.label}`}
                    title={removingId === clone.id ? "Deleting voice" : "Delete voice"}
                  >
                    {removingId === clone.id ? <span className={styles.iconSpinner} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {createOpen && (
        <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setCreateOpen(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-clone-title">
            <div className={styles.modalHeader}>
              <div>
                <h2 id="create-clone-title" className={styles.cardTitle}>Create voice clone</h2>
                <p className={styles.modalSubhead}>Upload a clean recording to create a voice for your alerts.</p>
              </div>
              <button type="button" className={styles.closeButton} aria-label="Close" onClick={() => setCreateOpen(false)} disabled={submitting} autoFocus>×</button>
            </div>
            <form onSubmit={handleSubmit} className={styles.form}>
              <label
                className={styles.dropZone}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleFileChange(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <input type="file" accept="audio/*" onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)} required={!file} />
                <span className={styles.uploadIcon} aria-hidden="true">↑</span>
                <strong>{file ? file.name : "Drop an audio sample here or browse"}</strong>
                <span>{file ? `${clipDuration !== null ? `${clipDuration.toFixed(1)} seconds · ` : ""}${(file.size / (1024 * 1024)).toFixed(1)} MB` : `Audio file · ${SAMPLE_MIN_SECONDS}–${SAMPLE_MAX_SECONDS} seconds`}</span>
                {file && <span className={styles.fileAction}>Choose a different recording</span>}
              </label>
              {previewUrl && (
                <audio className={styles.audioPreview} controls preload="metadata" src={previewUrl}>
                  Your browser does not support audio preview.
                </audio>
              )}
              {file && clipDuration !== null && (
                <div className={styles.trimPanel}>
                  <div className={styles.trimHeading}>
                    <span className={styles.label}>Trim recording</span>
                    <span className={styles.helper}>
                      Keep {Math.max(0, trimEnd - trimStart).toFixed(1)}s of {clipDuration.toFixed(1)}s
                    </span>
                  </div>
                  <div className={styles.trimTrack} aria-label="Trim selection">
                    <label className={styles.trimControl}>
                      <span className={styles.helper}>Start: {trimStart.toFixed(1)}s</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(0, clipDuration - SAMPLE_MIN_SECONDS)}
                        step="0.1"
                        value={trimStart}
                        aria-label="Trim start time"
                        onChange={(event) => setTrimStart(Math.min(Number(event.target.value), trimEnd - SAMPLE_MIN_SECONDS))}
                      />
                    </label>
                    <label className={styles.trimControl}>
                      <span className={styles.helper}>End: {trimEnd.toFixed(1)}s</span>
                      <input
                        type="range"
                        min={Math.min(clipDuration, trimStart + SAMPLE_MIN_SECONDS)}
                        max={clipDuration}
                        step="0.1"
                        value={trimEnd}
                        aria-label="Trim end time"
                        onChange={(event) => setTrimEnd(Math.max(Number(event.target.value), trimStart + SAMPLE_MIN_SECONDS))}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void handleApplyTrim()}
                    disabled={trimming || trimEnd - trimStart < SAMPLE_MIN_SECONDS || trimEnd - trimStart > TRANSCRIPT_MAX_SECONDS}
                  >
                    <Scissors size={15} aria-hidden="true" />
                    {trimming ? "Trimming…" : "Apply trim"}
                  </button>
                  <span className={styles.helper}>
                    Select {SAMPLE_MIN_SECONDS}–{TRANSCRIPT_MAX_SECONDS} seconds of clean speech. Applying the trim replaces the sample with that section.
                  </span>
                </div>
              )}
              <label className={styles.field}>
                <span className={styles.label}>Voice name</span>
                <input className={styles.input} type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My stream voice" maxLength={80} required />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Recording transcript</span>
                <textarea className={`${styles.input} ${styles.textarea}`} value={refText} onChange={(e) => setRefText(e.target.value)} placeholder="Type the exact words spoken in your recording…" maxLength={600} required />
                <span className={styles.helper}>A correct transcript helps the clone read Khmer, USD, and KHR alerts more clearly and keeps synthesis fast.</span>
                <select
                  className={styles.input}
                  value={transcriptionLanguage}
                  onChange={(event) => setTranscriptionLanguage(event.target.value as "auto" | "km" | "en")}
                  aria-label="Recording language for transcript generation"
                >
                  <option value="auto">Transcript language: Auto detect</option>
                  <option value="km">Transcript language: Khmer</option>
                  <option value="en">Transcript language: English</option>
                </select>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void handleAutoTranscribe()}
                  disabled={!file || transcribing || submitting}
                >
                  <WandSparkles size={15} aria-hidden="true" />
                  {transcribing ? "Generating transcript…" : "Generate transcript"}
                </button>
                {transcriptNotice && <span className={styles.helper} role="status">{transcriptNotice}</span>}
              </label>
              <label className={styles.consent}>
                <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} />
                <span>I own this voice or have the speaker’s permission to clone and use it.</span>
              </label>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className={styles.primaryButton} disabled={submitting}>{submitting ? "Creating…" : "Create voice clone"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
