"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Trash2 } from "lucide-react";

export type DonorVoice = {
  blob: Blob;
  durationSeconds: number;
  previewUrl: string;
};

/**
 * Picks the best container this browser can record. Chromium produces
 * `audio/webm;codecs=opus`, Firefox `audio/ogg`, Safari `audio/mp4`. The
 * server allowlist accepts all three; anything else falls back to the browser
 * default, which is then rejected there with a clear message.
 */
function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Donor-facing voice message recorder for the public tip page.
 *
 * Records at most MAX_SECONDS, lets the donor play back before committing, and
 * hands the blob to `onChange`. Nothing is uploaded here -- the pay page
 * uploads on submit so an abandoned recording never reaches storage.
 */
export function DonorVoiceRecorder({
  value,
  onChange,
  disabled,
  maxSeconds = 30,
}: {
  value: DonorVoice | null;
  onChange: (voice: DonorVoice | null) => void;
  disabled?: boolean;
  maxSeconds?: number;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  // Each recording makes a new object URL; the previous one has to be released
  // or every take leaks its blob for the life of the page.
  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  // Leaving the page mid-recording would otherwise leave the mic indicator on.
  useEffect(() => {
    return () => {
      clearTick();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      stopTracks();
      releasePreview();
    };
  }, [clearTick, releasePreview, stopTracks]);

  const finish = useCallback(
    (blob: Blob) => {
      const seconds = Math.min(
        Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
        maxSeconds,
      );
      releasePreview();
      const previewUrl = URL.createObjectURL(blob);
      previewUrlRef.current = previewUrl;
      onChange({ blob, durationSeconds: seconds, previewUrl });
      setRecording(false);
      setElapsed(0);
      clearTick();
      stopTracks();
    },
    [clearTick, maxSeconds, onChange, releasePreview, stopTracks],
  );

  const start = async () => {
    setError("");
    // Capability is checked here rather than at mount: MediaRecorder is absent
    // during server rendering, so any mount-time probe would disagree with the
    // server's markup and trip a hydration mismatch.
    if (
      typeof navigator === "undefined" ||
      typeof navigator.mediaDevices?.getUserMedia !== "function" ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("This browser can't record audio. You can still send a message.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        "Microphone access was blocked. Allow it in your browser to record.",
      );
      return;
    }

    const mimeType = preferredMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stopTracks();
      setError("This browser cannot record audio here.");
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    startedAtRef.current = Date.now();
    setElapsed(0);
    setRecording(true);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || mimeType || "audio/webm",
      });
      finish(blob);
    };

    // Stop at the cap so the donor never records past what the server accepts.
    tickRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(seconds);
      if (seconds >= maxSeconds && recorder.state === "recording") {
        recorder.stop();
      }
    }, 250);

    recorder.start();
  };

  const stop = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const clear = () => {
    releasePreview();
    onChange(null);
    setError("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-400">
          VOICE MESSAGE (OPTIONAL)
        </span>
        <span className="text-[12px] text-slate-400 font-mono">
          {recording
            ? formatSeconds(elapsed)
            : value
              ? `${value.durationSeconds}s`
              : `${maxSeconds}s max`}
        </span>
      </div>

      {value && !recording ? (
        <div className="flex items-center gap-3 rounded-xl border border-nexusBorder bg-nexusNeutral p-3">
          <audio
            controls
            src={value.previewUrl}
            className="h-9 min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label="Remove voice message"
            className="shrink-0 rounded-lg border border-nexusBorder p-2 text-slate-400 transition-colors hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={recording ? stop : () => void start()}
          disabled={disabled}
          className={
            recording
              ? "flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 py-3 font-rajdhani text-xs font-bold uppercase tracking-widest text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              : "flex w-full items-center justify-center gap-2 rounded-xl border border-nexusBorder bg-nexusNeutral py-3 font-rajdhani text-xs font-bold uppercase tracking-widest text-slate-300 transition-colors hover:border-nexusPrimary hover:text-white disabled:opacity-50"
          }
        >
          {recording ? (
            <>
              <Square size={14} />
              STOP · {formatSeconds(elapsed)}
            </>
          ) : (
            <>
              <Mic size={14} />
              RECORD A MESSAGE
            </>
          )}
        </button>
      )}

      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <Loader2 size={12} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
