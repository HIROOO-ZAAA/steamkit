"use client";

import { useState, useEffect, use, useRef, type Dispatch, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tip } from "@/lib/types";
import styles from "../[token]/overlay.module.css";
import widgetStyles from "../../dashboard/alerts/alerts.module.css";
import {
  applyTier,
  highlightText,
  parseTemplate,
  pickTier,
  speechText,
  type AlertSettings,
  type AlertTier,
} from "@/lib/overlay/alert-logic";
import {
  PLAYBACK_TIMEOUT_MS,
  errorNameOf,
  playAudioToEnd,
  playViaWebAudio,
  type AudioDecoder,
} from "@/lib/overlay/audio-playback";

type VoiceSettings = {
  language: string;
  pitch: number;
  speed: number;
  provider?: string | null;
  voice_id?: string | null;
};

type OverlayConfig = AlertSettings & VoiceSettings & {
  creator_id: string;
  tiers?: AlertTier[];
  voice_intro_enabled?: boolean;
  voice_intro_template?: string;
};

const PHOTO_STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/donation-photos`;
const VOICE_STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/donation-voice`;

/**
 * How long an alert stays on screen at minimum, even once the speech has
 * finished. Without a floor, an instant failure would flash and vanish, which
 * is harder to notice than no alert at all.
 */
const MIN_ALERT_MS = 1_500;

/**
 * `speechSynthesis.getVoices()` is populated asynchronously -- Chromium returns
 * an empty array until the `voiceschanged` event fires. Cache the list so an
 * alert never lands before the voices have loaded.
 */
let cachedVoices: SpeechSynthesisVoice[] | null = null;
let voicesListenerBound = false;

function browserVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  if (cachedVoices && cachedVoices.length > 0) return cachedVoices;
  if (!voicesListenerBound) {
    voicesListenerBound = true;
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      cachedVoices = window.speechSynthesis.getVoices();
    });
  }
  cachedVoices = window.speechSynthesis.getVoices();
  return cachedVoices;
}

/**
 * Picks the voice for this creator: the cloned voice when cloning is enabled,
 * otherwise the configured `voice_id`, otherwise the closest match for the
 * configured language. Falls back to null so the caller can set `lang` instead.
 */
function resolveVoice(voice: VoiceSettings): SpeechSynthesisVoice | null {
  const all = browserVoices();
  if (all.length === 0) return null;

  const preferredId = voice.voice_id;
  if (preferredId) {
    // `voiceURI` is the stable cross-platform identifier; `name` is display text.
    const exact = all.find(
      (v) => v.voiceURI === preferredId || v.name === preferredId,
    );
    if (exact) return exact;
  }

  const lang = (voice.language ?? "km-KH").toLowerCase();
  const base = lang.split("-")[0];
  return (
    all.find((v) => v.lang.toLowerCase() === lang) ??
    all.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    null
  );
}

/**
 * Speaks `text` through the host OS voice, resolving when it finishes.
 * Always resolves: a browser that has no voice for the language, or a
 * synthesis error, must not strand the alert queue waiting on a callback that
 * never fires.
 */
function speakWithBrowser(text: string, voice: VoiceSettings): Promise<void> {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ""));
    const picked = resolveVoice(voice);
    if (picked) utterance.voice = picked;
    else utterance.lang = voice.language;
    utterance.pitch = voice.pitch;
    utterance.rate = voice.speed;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * The overlay token, held at module level for the same reason `cachedVoices` is:
 * this page serves exactly one creator, and `speak()` is a module function that
 * the alert queue calls without threading props through. Assigned once the
 * config load proves the token is valid — an unverified token would only earn a
 * 401 from the synthesis route.
 */
let synthesisToken: string | null = null;

/** How long to wait for the synthesis route before using the OS voice anyway. */
const SYNTHESIS_TIMEOUT_MS = 12_000;

/**
 * How long one alert may hold the queue while its audio is produced.
 *
 * The alert itself is on screen for `duration_seconds` (~7s), so a synthesis
 * that has not produced a URL by now has already outlived its own alert. Above
 * this the alert stops *waiting* on the audio — it still plays if it arrives,
 * but the queue moves on, because the failure being guarded against is a
 * head-of-line block: every later donation silent behind one stuck alert.
 *
 * Only a diagnosis aid for now; the queue is still serial and still waits.
 */
const ALERT_PLAYBACK_BUDGET_MS = 15_000;

/**
 * Asks /api/tts/synthesize to speak `text` in the creator's own voice, and
 * returns a playable URL — or null for "cannot, use the browser instead".
 *
 * Null is the answer for every failure: no token, a non-2xx (which is where a
 * misconfigured backend or an unreachable provider lands), or a response without
 * audio. The route falls back to the stock voice on its own failures, so the
 * overlay only has to decide between "the creator's voice" and "the OS voice".
 */
async function synthesizeWithCreatorVoice(text: string): Promise<string | null> {
  if (!synthesisToken) return null;
  console.warn(`[alerts] tts request chars=${text.length}`);

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SYNTHESIS_TIMEOUT_MS);
  // An alert is on screen for a few seconds. If synthesis has not produced a URL
  // by then, waiting longer only delays the next alert while the on-screen one
  // has already outlived its own duration — so playback may still finish and
  // still be worth hearing, but the alert must not hold the queue open for it.
  const queueDeadline = Date.now() + ALERT_PLAYBACK_BUDGET_MS;
  let abandoned = false;
  const queueTimer = window.setTimeout(() => {
    abandoned = true;
  }, ALERT_PLAYBACK_BUDGET_MS);
  try {
    const res = await fetch("/api/tts/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overlayToken: synthesisToken, text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[alerts] tts response status=${res.status}`);
      return null;
    }
    const payload = (await res.json().catch(() => null)) as { audioUrl?: string } | null;
    const url = typeof payload?.audioUrl === "string" ? payload.audioUrl : null;
    if (url && abandoned) {
      console.warn(
        `[alerts] tts arrived ${Date.now() - queueDeadline}ms after the alert ` +
          "budget expired; playing, but the next alert will not wait for it",
      );
    }
    console.warn(`[alerts] tts response status=${res.status} audio=${url ? "yes" : "no"}`);
    return url;
  } catch {
    console.warn("[alerts] tts request failed before a response");
    return null;
  } finally {
    window.clearTimeout(timer);
    window.clearTimeout(queueTimer);
  }
}

/**
 * Where an audio file lives, for logs: origin and path only.
 *
 * The signed TTS URLs carry their credential in the query string and the path
 * itself is a sha256 of voice plus text, so this identifies the object without
 * revealing the token or the donation message.
 */
function audioLocation(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<unparsable url>";
  }
}

/**
 * Outcome and failure name only - never a full URL, a token, or the alert text.
 *
 * `console.error`, not `console.warn`, and that is load-bearing. OBS's browser
 * source forwards ONLY uncaught errors to its log: verified against a live
 * obs-browser 2.26.9 session, where seven uncaught errors from this page were
 * recorded and ZERO `console.warn` lines were. Every diagnostic this feature
 * emits is invisible in the one place a creator will ever look, which is why
 * "the overlay is silent" has been so hard to explain.
 *
 * These are not errors being invented — each one is emitted at a point where
 * the alert genuinely may have produced no sound, which is exactly what needs
 * to be diagnosable from the OBS log.
 */
function playbackLog(label: string, outcome: string, errorName?: string): void {
  const line = `[alerts] ${label} playback=${outcome}${errorName ? ` error=${errorName}` : ""}`;
  if (outcome === "ended") {
    console.warn(line);
    return;
  }
  console.error(line);
}

/**
 * Says an alert was spoken, at a level OBS will keep.
 *
 * `console.error` for a success is not a mistake. OBS's browser source forwards
 * ONLY uncaught errors to its log — measured on a live obs-browser 2.26.9
 * session, where seven uncaught errors were recorded and zero `console.warn`
 * lines were. So while every success was reported at warn level, a working
 * alert and a browser source that is capturing nothing at all looked exactly
 * the same: both silent. That is the trap this feature has already fallen into
 * twice, and it is why "the overlay says nothing" was so hard to tell apart from
 * "OBS is not listening".
 *
 * This is the line to read after a test donation. It reports only what was
 * decided, never the alert text or a token.
 */
function spokenVerdict(path: string, audible: boolean): void {
  console.error(
    `[alerts] SPOKEN path=${path} audioOutputAvailable=${audible} ` +
      "— if you cannot hear this, the audio did not reach your speakers",
  );
}

/**
 * The Web Audio implementation of `AudioDecoder`.
 *
 * One context for the life of the page: a browser caps how many may exist, and
 * reusing it keeps each alert's setup down to a fetch and a decode.
 */
let audioContext: AudioContext | null = null;

/**
 * The lines a creator needs from the OBS log, at the level OBS actually keeps.
 *
 * OBS forwards only uncaught errors, so anything worth reading from
 * `%APPDATA%/obs-studio/logs` has to be `console.error`. Used for the two facts
 * that decide "did the alert speak": the audio output could not start, and no
 * audio came back at all. Routine progress stays on `console.warn` — visible
 * with devtools open, absent from the OBS log, which is the right trade for
 * lines that fire every few seconds.
 */
function alertFault(message: string): void {
  console.error(`[alerts] ${message}`);
}

/**
 * Whether audio can actually reach the speakers on this page, and whether we
 * have asked yet.
 *
 * Both are needed because `ended` is not proof of sound. An `HTMLAudioElement`
 * reports it whether or not an output device is attached, and a suspended
 * `AudioContext` fires `onended` while its clock advances in silence. Measured
 * on this machine: a real alert logged `playback=ended` with
 * `context=suspended` throughout, so the page believed it had spoken and the
 * stream heard nothing.
 *
 * Probed once, with a one-sample silent buffer, before any clip is played.
 */
let audioOutputKnown = false;
let audioOutputAvailable = false;

/**
 * The AudioContext, primed and asked to run.
 *
 * A browser source never has a user gesture, so a new context can come back
 * suspended and stay there: `decodeAudioData` still resolves and `onended`
 * still fires, which means the clip "plays" perfectly while nothing is ever
 * sent to the speakers. Observed in a real headless Chromium alert:
 * `contexts: [{ state: "suspended" }]` with `decode: []` — nothing reached the
 * output.
 *
 * The context is primed with a one-sample buffer first, because on a freshly
 * attached output Chromium can start suspended *because* it is muted, and
 * `resume()` alone leaves it that way.
 *
 * `resume()` is bounded because it does not always settle: with no audio device
 * at all it never resolves, and since the decode happens BEFORE
 * `playViaWebAudio` arms its timeout, an unbounded await there would hang the
 * alert queue permanently — the exact stall `audio-playback.ts` exists to
 * prevent, re-introduced upstream of it.
 */
const AUDIOCONTEXT_RESUME_MS = 1_500;

async function runningAudioContext(): Promise<AudioContext> {
  audioContext ??= new AudioContext();
  if (audioContext.state !== "running") {
    try {
      const source = audioContext.createBufferSource();
      source.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
      source.connect(audioContext.destination);
      source.start(0);
    } catch {
      // Nothing to prime; `resume()` below is still worth trying.
    }
    await Promise.race([
      audioContext.resume().catch(() => undefined),
      new Promise((resolve) => window.setTimeout(resolve, AUDIOCONTEXT_RESUME_MS)),
    ]);
  }
  return audioContext;
}

/**
 * Decides once whether this page can make sound, and caches the answer.
 *
 * Called before the first clip is played, because the choice of playback path
 * depends on it and only one path may play the clip.
 */
async function ensureAudioOutputKnown(): Promise<boolean> {
  if (audioOutputKnown) return audioOutputAvailable;
  audioOutputKnown = true;
  try {
    const context = await runningAudioContext();
    audioOutputAvailable = context.state === "running";
  } catch {
    audioOutputAvailable = false;
  }
  // Stated plainly, and at error level either way: a creator cannot act on
  // "playback=ended", because it looks identical to success. And OBS keeps only
  // errors, so reporting `true` at warn level would leave a working setup and a
  // dead browser source indistinguishable in the one log a creator reads.
  const line = `audio output available=${audioOutputAvailable}`;
  if (audioOutputAvailable) spokenVerdict("probe", true);
  else alertFault(`${line} — nothing this page plays will be audible`);
  return audioOutputAvailable;
}

function webAudioDecoder(): AudioDecoder {
  return {
    async decode(url: string) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`audio fetch ${res.status}`);
      const bytes = await res.arrayBuffer();
      const context = await runningAudioContext();
      const buffer = await context.decodeAudioData(bytes);
      return {
        play() {
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          source.start();
          return {
            finished: new Promise<void>((resolve, reject) => {
              source.onended = () => resolve();
              // AudioBufferSourceNode has no `onerror`; errors arrive as events.
              source.addEventListener("error", () => reject(new Error("source error")), {
                once: true,
              });
            }),
            stop() {
              try {
                source.stop();
              } catch {
                // Already stopped or never started.
              }
            },
          };
        },
      };
    },
  };
}

/**
 * Plays a URL, resolving true only when something was actually sent to the
 * speakers.
 *
 * Exactly ONE path plays the clip, and which one is decided BEFORE playback
 * starts. That ordering matters in both directions. Probing afterwards means
 * the alert is heard twice when audio does work — measured: `playback=ended`
 * from the element, then the same clip again through Web Audio. Probing never
 * means the page reports success while the stream hears nothing.
 */
async function playAudioUrl(url: string): Promise<boolean> {
  const where = audioLocation(url);
  console.warn(`[alerts] playback start ${where}`);

  const audible = await ensureAudioOutputKnown();

  // Web Audio is not bound by the autoplay policy that refuses `play()`, so it
  // is the only path that can make sound in a browser source with no user
  // gesture — and the only one whose success can be verified.
  if (!audible) {
    const outcome = await playViaWebAudio(url, webAudioDecoder(), PLAYBACK_TIMEOUT_MS);
    console.warn(
      `[alerts] tts-webaudio ${where} playback=${outcome} context=${audioContext?.state ?? "none"}`,
    );
    // `ended` on a context that never started is a clock advancing in silence.
    if (outcome === "ended" && audioContext?.state !== "running") {
      alertFault(
        "the clip finished but the audio context never started, so nothing was " +
          "sent to the speakers; falling back to the OS voice",
      );
      return false;
    }
    if (outcome === "ended") spokenVerdict("webaudio", audible);
    return outcome === "ended";
  }

  const outcome = await playAudioToEnd(new Audio(url), PLAYBACK_TIMEOUT_MS, (d) =>
    playbackLog(`tts ${where}`, d.outcome, d.errorName),
  );
  if (outcome === "ended") {
    spokenVerdict("element", audible);
    return true;
  }

  // Audio works but this element still failed — a corrupt body, a dead
  // connection. Web Audio fetches and decodes independently, so this is a real
  // second chance rather than a repeat.
  console.warn(`[alerts] tts element playback=${outcome}; retrying through Web Audio`);
  const fallback = await playViaWebAudio(url, webAudioDecoder(), PLAYBACK_TIMEOUT_MS);
  playbackLog(`tts-webaudio ${where}`, fallback);
  if (fallback === "ended") spokenVerdict("webaudio-after-element", audible);
  return fallback === "ended";
}

/**
 * Speaks `text`: the creator's cloned voice when the synthesis route can produce
 * it, otherwise the host OS voice.
 *
 * Always resolves. An alert is on screen for a few seconds, so every branch —
 * no route, refused request, dead audio element, no OS voice — has to land back
 * on `speakWithBrowser` rather than strand the queue.
 */
async function speak(text: string, voice: VoiceSettings): Promise<void> {
  const line = text.replace(/<[^>]+>/g, "");
  const audioUrl = await synthesizeWithCreatorVoice(line);
  if (!audioUrl) {
    // The two failure modes a creator has to be able to tell apart: the server
    // produced nothing, versus the audio exists but would not play. Both are
    // otherwise silent in the OBS log.
    alertFault("tts synthesis returned no audio; using OS voice");
    await speakWithBrowser(line, voice);
    return;
  }
  if (await playAudioUrl(audioUrl)) return;
  alertFault("tts playback did not run to the end; using OS voice");
  await speakWithBrowser(line, voice);
}

/**
 * Plays an alert's sound effect.
 *
 * Deliberately fire-and-forget and NOT awaited: an effect that starts a little
 * late is unnoticeable, whereas awaiting it puts a third audio device in front
 * of the spoken message. It goes through the same guarded path as the voice
 * because the autoplay refusal is identical — observed in a real browser alert:
 * `sound … playback=error error=NotAllowedError` — and this call is what proves
 * the symptom is the policy rather than the file.
 */
function playSoundEffect(url: string): void {
  const where = audioLocation(url);
  void (async () => {
    const outcome = await playAudioToEnd(new Audio(url), PLAYBACK_TIMEOUT_MS, (d) =>
      playbackLog(`sound ${where}`, d.outcome, d.errorName),
    );
    if (outcome === "ended") return;
    // Same fallback the voice uses: Web Audio is not bound by the autoplay
    // policy, so an OBS browser source still gets its sound.
    const fallback = await playViaWebAudio(url, webAudioDecoder(), PLAYBACK_TIMEOUT_MS);
    playbackLog(`sound-webaudio ${where}`, fallback);
  })();
}

/** Plays a donor voice message, resolving when it ends, fails or stalls. */
async function playVoiceMessage(path: string): Promise<void> {
  const where = audioLocation(`${VOICE_STORAGE_BASE}/${path}`);
  await playAudioToEnd(new Audio(`${VOICE_STORAGE_BASE}/${path}`), PLAYBACK_TIMEOUT_MS, (d) =>
    playbackLog(`donor-voice ${where}`, d.outcome, d.errorName),
  );
}

function triggerAlert(
  tip: Tip,
  settings: AlertSettings,
  voice: VoiceSettings,
  setCurrentAlert: Dispatch<SetStateAction<Tip | null>>,
  tiers: AlertTier[] = [],
  intro: { enabled: boolean; template: string } = { enabled: false, template: "" },
) {
  const tier = pickTier(tiers, tip);
  const effective = applyTier(settings, tier);
  setCurrentAlert(tip);

  if (effective.sound_url) playSoundEffect(effective.sound_url);

  // The alert stays up until the speech finishes, then for whatever is left of
  // its configured duration, with a floor so a short phrase still gets read.
  // A fixed timer set at trigger time would cut a cloned voice off mid-word,
  // because synthesis adds a second or two before the first sample plays.
  const scheduleClear = (elapsedMs: number) => {
    const budget = effective.duration_seconds * 1000;
    const remaining = Math.max(budget - elapsedMs, MIN_ALERT_MS);
    window.setTimeout(() => setCurrentAlert(null), remaining);
  };

  const finish = () => {
    if (!effective.tts_enabled) {
      scheduleClear(0);
      return;
    }
    const tpl = effective.message_template ??
      "Thank you {name} for {amount} {currency}!";
    const startedAt = Date.now();
    void speak(speechText(tpl, tip), voice).then(() => {
      scheduleClear(Date.now() - startedAt);
    });
  };

  // A donor voice message replaces the read-aloud for that alert: speaking the
  // template while the recording plays would talk over it. The intro is
  // independent of `tts_enabled` -- a creator can keep lower tiers silent and
  // still hear the voice messages announced.
  if (!tip.voice_path) {
    finish();
    return;
  }

  const announce = intro.enabled
    ? speak(parseTemplate(intro.template || "{name} sent a voice message", tip), voice)
    : Promise.resolve();

  void announce
    .then(() => playVoiceMessage(tip.voice_path!))
    .then(finish);
}

export default function AlertsOverlayPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [supabase] = useState(() => createClient());

  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [alertSettings, setAlertSettings] = useState<AlertSettings | null>(null);
  const [voice, setVoice] = useState<VoiceSettings>({ language: "km-KH", pitch: 1, speed: 1 });
  const [currentAlert, setCurrentAlert] = useState<Tip | null>(null);
  const [queue, setQueue] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [lookupError, setLookupError] = useState(false);

  const seenRef = useRef<Set<string>>(new Set());
  const queueDepthRef = useRef<number>(0);
  const sinceRef = useRef<string>(new Date().toISOString());
  const bootedAtRef = useRef<string>(new Date().toISOString());
  const lastConfigJsonRef = useRef<string>("");
  const settingsRef = useRef<AlertSettings | null>(null);
  const voiceRef = useRef<VoiceSettings>({ language: "km-KH", pitch: 1, speed: 1 });
  // Held in a ref rather than state because the queue-drain effect reads it on
  // every alert and must not re-run (and restart the queue) when tiers change.
  const tiersRef = useRef<AlertTier[]>([]);
  // Read once per alert inside the drain effect, so it lives in a ref for the
  // same reason tiers do: changing it must not restart the queue.
  const introRef = useRef<{ enabled: boolean; template: string }>({
    enabled: false,
    template: "",
  });

  function enqueueTip(tip: Tip) {
    if (!tip?.id || seenRef.current.has(tip.id)) return;
    if ((tip.created_at ?? "") < bootedAtRef.current) return;
    seenRef.current.add(tip.id);
    setQueue((q) => [...q, tip]);
    // Count only: the tip carries the donor's name and message, neither of which
    // may reach a log.
    console.warn(`[alerts] tip queued depth=${queueDepthRef.current + 1}`);
  }

  // Play queued alerts one at a time
  useEffect(() => {
    if (currentAlert || queue.length === 0) return;
    const s = settingsRef.current;
    if (!s) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    queueDepthRef.current = rest.length;
    console.warn(`[alerts] drain depth=${rest.length + 1}`);
    triggerAlert(
      next,
      s,
      voiceRef.current,
      setCurrentAlert,
      tiersRef.current,
      introRef.current,
    );
  }, [queue, currentAlert]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700;800&family=Hanuman:wght@400;700&family=Kdam+Thmor+Pro&family=Suwannaphum:wght@400;700&family=Dangrek&family=Siemreap&family=Noto+Serif+Khmer:wght@400;700&family=Battambang:wght@400;700&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: number | null = null;
    let settingsRefreshTimer: number | null = null;

    async function initOverlay() {
      if (!token) {
        console.warn(`[alerts] init no-token visibility=${document.visibilityState}`);
        if (!disposed) {
          setLookupError(true);
          setLoading(false);
        }
        return;
      }

      console.warn(`[alerts] init visibility=${document.visibilityState}`);

      try {
        const { data, error } = await supabase.rpc("streamkit_resolve_overlay", {
          p_token: token,
        });

        if (error) throw error;
        const config = (data as unknown as OverlayConfig[] | null)?.[0];
        if (!config || disposed) return;

        function applyConfig(cfg: OverlayConfig) {
          const settings: AlertSettings = {
            duration_seconds: cfg.duration_seconds,
            sound_url: cfg.sound_url,
            animation_type: cfg.animation_type,
            font_color: cfg.font_color,
            tts_enabled: cfg.tts_enabled,
            layout: (cfg as AlertSettings).layout ?? "image_left",
            image_url: (cfg as AlertSettings).image_url ?? "",
            image_scale: (cfg as AlertSettings).image_scale ?? 50,
            show_donor_profile: (cfg as AlertSettings).show_donor_profile ?? true,
            message_template:
              (cfg as AlertSettings).message_template ??
              "អរគុណ {name} សម្រាប់ការឧបត្ថម {amount}{currency}",
            text_color: (cfg as AlertSettings).text_color ?? "#FFFFFF",
            bg_color: (cfg as AlertSettings).bg_color ?? "#000000",
            enable_card: (cfg as AlertSettings).enable_card ?? false,
            font_family: (cfg as AlertSettings).font_family ?? "'Noto Sans Khmer', sans-serif",
            font_size: (cfg as AlertSettings).font_size ?? 36,
            font_weight: (cfg as AlertSettings).font_weight ?? "700",
            alert_animation: (cfg as AlertSettings).alert_animation ?? cfg.animation_type,
            text_animation: (cfg as AlertSettings).text_animation ?? "Fade",
            text_delay: (cfg as AlertSettings).text_delay ?? 0,
            donor_avatar: (cfg as AlertSettings).donor_avatar ?? "ðŸ¦”",
          };

          const v: VoiceSettings = {
            language: cfg.language,
            pitch: cfg.pitch,
            speed: cfg.speed,
            provider: cfg.provider,
            voice_id: cfg.voice_id,
          };

          tiersRef.current = Array.isArray(cfg.tiers) ? cfg.tiers : [];
          introRef.current = {
            enabled: cfg.voice_intro_enabled ?? false,
            template: cfg.voice_intro_template ?? "{name} sent a voice message",
          };

          setCreatorId(cfg.creator_id);
          setAlertSettings(settings);
          setVoice(v);
          settingsRef.current = settings;
          voiceRef.current = v;
          // Only now is the token known good: an invalid one must not reach the
          // synthesis route on every alert.
          synthesisToken = token ?? null;
        }

        applyConfig(config);
        lastConfigJsonRef.current = JSON.stringify(config);
        console.warn(
          `[alerts] init ready tts=${config.tts_enabled ? "on" : "off"} ` +
            `template=${config.message_template ? "set" : "missing"}`,
        );

        // Instant path: realtime push
        channel = supabase
          .channel(`overlay-tips-${config.creator_id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "tips",
              filter: `creator_id=eq.${config.creator_id}`,
            },
            (payload) => {
              const tip = payload.new as Tip;
              if (tip.payment_status === "successful" || tip.payment_status === "test") {
                enqueueTip(tip);
              }
            },
          )
          .subscribe((status) => {
            // Realtime is the instant path; if it never reaches SUBSCRIBED the
            // 3s poll below is the only thing left delivering alerts.
            console.warn(`[alerts] realtime ${status}`);
          });

        // Reliable path: poll recent tips every 3s (works even if realtime is blocked).
        // Baseline comes from DB timestamps (client clock may be ahead of the server).
        try {
          const { data: existing } = await supabase.rpc("streamkit_recent_alerts", {
            p_token: token,
            p_since: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          });
          if (disposed) return;
          if (existing && existing.length > 0) {
            sinceRef.current = (existing[existing.length - 1] as Tip).created_at;
            (existing as Tip[]).forEach((t) => seenRef.current.add(t.id));
          } else {
            sinceRef.current = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          }
        } catch {
          // keep default baseline
        }

        let pollTicks = 0;
        let pollFailureLogged = false;
        pollTimer = window.setInterval(async () => {
          pollTicks += 1;
          // Chromium freezes or heavily throttles timers in a page it considers
          // hidden, which is exactly what an OBS browser source becomes when its
          // scene item is hidden. A 3s interval that silently stops is the one
          // failure the rest of this cannot detect, so say when a tick happened
          // and what the visibility state was.
          if (pollTicks === 1 || pollTicks % 20 === 0) {
            console.warn(
              `[alerts] poll tick=${pollTicks} visibility=${document.visibilityState}`,
            );
          }
          try {
            const { data: recent, error } = await supabase.rpc("streamkit_recent_alerts", {
              p_token: token,
              p_since: sinceRef.current,
            });
            if (error) {
              if (!pollFailureLogged) {
                pollFailureLogged = true;
                console.warn(`[alerts] poll error=${error.code ?? "unknown"}`);
              }
              return;
            }
            if (disposed || !recent || recent.length === 0) return;
            console.warn(`[alerts] poll new=${recent.length}`);
            sinceRef.current = (recent[recent.length - 1] as Tip).created_at;
            (recent as Tip[]).forEach(enqueueTip);
          } catch (error) {
            if (!pollFailureLogged) {
              pollFailureLogged = true;
              console.warn(`[alerts] poll threw=${errorNameOf(error) ?? "unknown"}`);
            }
          }
        }, 3000);

        // Re-apply settings on save from the dashboard (no OBS refresh needed)
        settingsRefreshTimer = window.setInterval(async () => {
          try {
            const { data: fresh } = await supabase.rpc("streamkit_resolve_overlay", {
              p_token: token,
            });
            const cfg = (fresh as unknown as OverlayConfig[] | null)?.[0];
            if (disposed || !cfg) return;
            const json = JSON.stringify(cfg);
            if (json === lastConfigJsonRef.current) return;
            lastConfigJsonRef.current = json;
            applyConfig(cfg);
          } catch {
            // retry next tick
          }
        }, 4000);
      } catch {
        if (!disposed) setLookupError(true);
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void initOverlay();
    return () => {
      disposed = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (settingsRefreshTimer) window.clearInterval(settingsRefreshTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, token]);

  if (loading) return null;

  if (!creatorId) {
    return (
      <div className={styles.invalidToken} role="alert">
        {lookupError
          ? "âš  Unable to validate OBS URL. Check Supabase connection."
          : "âš  Invalid or missing token. Use /overlay/alerts?token=YOUR_TOKEN"}
      </div>
    );
  }

  if (!alertSettings) return null;

  const {
    layout = "image_left",
    image_url = "",
    image_scale = 50,
    show_donor_profile = true,
    message_template = "áž¢ážšáž‚áž»ážŽ {name} ážŸáž˜áŸ’ážšáž¶áž”áŸ‹áž€áž¶ážšáž§áž”ážáŸ’ážáž˜ {amount}{currency}",
    text_color = "#FFFFFF",
    font_color,
    bg_color = "#000000",
    enable_card = false,
    font_family = "'Noto Sans Khmer', sans-serif",
    font_size = 36,
    font_weight = "700",
    alert_animation = "bounce",
    text_animation,
    text_delay = 0,
    donor_avatar,
    tts_enabled,
  } = alertSettings;

  const widgetAnimMap: Record<string, string> = {
    bounceIn: "bounceIn",
    "Bounce In": "bounceIn",
    bounce: "bounceIn",
    fadeIn: "fadeIn",
    fade: "fadeIn",
    "Fade": "fadeIn",
    zoomIn: "zoomIn",
    zoom: "zoomIn",
    "Zoom In": "zoomIn",
    slideUp: "slideUp",
    slide: "slideUp",
    "Slide Up": "slideUp",
    flip: "flip",
    "Flip In": "flip",
    pulseGlow: "pulseGlow",
  };
  const widgetAnimClass = widgetStyles[widgetAnimMap[alert_animation] ?? "bounceIn"];
  const textAnimClass = widgetStyles[text_animation ?? "wiggle"] ?? widgetStyles.wiggle;

  const imgSize = Math.round(60 + (image_scale / 100) * 160);

  return (
    <div className={styles.overlayRoot} aria-live="polite">
      {currentAlert && (
        <div
          key={currentAlert.id}
          className={`${widgetStyles.alertContainer} ${widgetAnimClass} ${
            layout === "image_left" ? widgetStyles.alertContainerRow : ""
          }`}
          role="alert"
        >
          <div className={layout === "image_left" ? widgetStyles.alertMediaGroup : widgetStyles.alertMediaGroupStacked}>
            {image_url && (
              <img
                src={image_url}
                alt=""
                className={widgetStyles.alertGraphic}
                style={{ width: `${image_scale * 2}px` }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}

            {show_donor_profile && (
              <div className={widgetStyles.avatarCircle} style={{ borderColor: font_color }}>
                {donor_avatar && donor_avatar.match(/^https?:\/\//) ? (
                  <img src={donor_avatar} alt="" className={widgetStyles.avatarImg} />
                ) : (
                  <span className={widgetStyles.avatarEmoji}>
                    {donor_avatar || currentAlert.tipper_name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            )}

            {currentAlert.photo_path &&
              currentAlert.photo_status === "approved" && (
                <img
                  src={`${PHOTO_STORAGE_BASE}/${currentAlert.photo_path}`}
                  alt=""
                  className={widgetStyles.donorPhoto}
                  style={{ width: `${image_scale * 2}px` }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
          </div>

          <div
            className={layout === "image_left" ? widgetStyles.alertTextColumn : widgetStyles.alertTextColumnStacked}
            style={{
              textAlign: "center",
              animation: `textDelayIn 0.4s ease ${text_delay}s both`,
            }}
          >
            <div
              className={`${widgetStyles.donorMessage} ${textAnimClass}`}
              style={{
                color: text_color,
                fontFamily: font_family,
                fontSize: `${Math.max(16, font_size * 0.6)}px`,
                fontWeight: font_weight,
              }}
              dangerouslySetInnerHTML={{
                __html: highlightText(
                  parseTemplate(message_template, currentAlert),
                  font_color,
                ),
              }}
            />

            {currentAlert.message && (
              <div
                className={widgetStyles.donorSubMessage}
                style={{
                  color: text_color,
                  fontFamily: font_family,
                  fontSize: `${Math.max(13, font_size * 0.42)}px`,
                }}
              >
                &quot;{currentAlert.message}&quot;
              </div>
            )}

            {/* Without this the alert sits on screen silently while the donor's
                recording plays, which reads as a broken overlay. */}
            {currentAlert.voice_path ? (
              <div
                className={widgetStyles.alertVoiceBadge}
                style={{
                  color: font_color,
                  fontFamily: font_family,
                  fontSize: `${Math.max(12, font_size * 0.32)}px`,
                }}
              >
                &#9679; VOICE MESSAGE
              </div>
            ) : null}

          </div>
        </div>
      )}
    </div>
  );
}
