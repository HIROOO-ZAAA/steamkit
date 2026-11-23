"use client";

import { useEffect, useRef, useState } from "react";
import OBSWebSocket from "obs-websocket-js";
import {
  Check,
  Circle,
  Eye,
  EyeOff,
  Loader2,
  MonitorPlay,
  Plug,
  PlugZap,
  Radio,
  RefreshCw,
  Square,
  Unplug,
  Video,
} from "lucide-react";
import {
  OBS_CONNECTION_STORAGE_KEY,
  parseSavedObsConnection,
  serializeObsConnection,
} from "@/lib/obs-connection-storage";
import styles from "./obs.module.css";

type Scene = { sceneName: string; sceneIndex: number };
type SceneItem = {
  sceneItemId: number;
  sourceName: string;
  sceneItemEnabled: boolean;
  isGroup?: boolean;
};

type ConnState = "disconnected" | "connecting" | "connected" | "error";

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatBytes(bytes: number) {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

export default function OBSRemotePage() {
  const obsRef = useRef<OBSWebSocket | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [host, setHost] = useState("ws://127.0.0.1:4455");
  const [password, setPassword] = useState("");
  const [conn, setConn] = useState<ConnState>("disconnected");
  const [connError, setConnError] = useState("");
  const [obsVersion, setObsVersion] = useState("");

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentScene, setCurrentScene] = useState("");
  const [sceneItems, setSceneItems] = useState<SceneItem[]>([]);

  const [streaming, setStreaming] = useState(false);
  const [streamDuration, setStreamDuration] = useState(0);
  const [streamBytes, setStreamBytes] = useState(0);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  // Restore saved connection details
  // Reading localStorage must happen after hydration: a useState initializer
  // would touch window during SSR and cause a hydration mismatch.
  useEffect(() => {
    try {
      const saved = parseSavedObsConnection(
        window.localStorage.getItem(OBS_CONNECTION_STORAGE_KEY),
      );
      if (!saved) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved.host) setHost(saved.host);
      window.localStorage.setItem(
        OBS_CONNECTION_STORAGE_KEY,
        serializeObsConnection(saved.host),
      );
    } catch {}
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
      if (obsRef.current) void obsRef.current.disconnect().catch(() => {});
    };
  }, []);

  async function refreshScenes(obs: OBSWebSocket) {
    const list = await obs.call("GetSceneList");
    setScenes((list.scenes as unknown as Scene[]).slice().reverse());
    setCurrentScene(list.currentProgramSceneName);
    await refreshSceneItems(obs, list.currentProgramSceneName);
  }

  async function refreshSceneItems(obs: OBSWebSocket, sceneName: string) {
    const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
    setSceneItems(
      (sceneItems as unknown as SceneItem[]).slice().reverse().map((i) => ({
        sceneItemId: i.sceneItemId,
        sourceName: i.sourceName,
        sceneItemEnabled: i.sceneItemEnabled,
        isGroup: i.isGroup,
      })),
    );
  }

  async function refreshStreamStatus(obs: OBSWebSocket) {
    try {
      const stream = await obs.call("GetStreamStatus");
      setStreaming(stream.outputActive);
      setStreamDuration(stream.outputActive ? stream.outputDuration : 0);
      setStreamBytes(stream.outputBytes);
      const record = await obs.call("GetRecordStatus");
      setRecording(record.outputActive);
    } catch {
      // OBS older versions may lack some calls
    }
  }

  async function handleConnect() {
    setConn("connecting");
    setConnError("");
    const obs = new OBSWebSocket();
    obsRef.current = obs;

    try {
      await obs.connect(host, password || undefined);
      try {
        const version = await obs.call("GetVersion");
        setObsVersion(version.obsVersion);
      } catch {}
      setConn("connected");
      setPassword("");
      try {
        window.localStorage.setItem(
          OBS_CONNECTION_STORAGE_KEY,
          serializeObsConnection(host),
        );
      } catch {}

      obs.on("CurrentProgramSceneChanged", (data) => {
        setCurrentScene(data.sceneName);
        void refreshSceneItems(obs, data.sceneName);
      });
      obs.on("SceneItemEnableStateChanged", (data) => {
        setSceneItems((prev) =>
          prev.map((i) =>
            i.sceneItemId === data.sceneItemId
              ? { ...i, sceneItemEnabled: data.sceneItemEnabled }
              : i,
          ),
        );
      });
      obs.on("StreamStateChanged", (data) => {
        setStreaming(data.outputActive);
        void refreshStreamStatus(obs);
      });
      obs.on("RecordStateChanged", (data) => setRecording(data.outputActive));
      obs.on("ConnectionClosed", () => {
        setConn("disconnected");
        if (statusTimerRef.current) clearInterval(statusTimerRef.current);
      });

      await refreshScenes(obs);
      await refreshStreamStatus(obs);
      statusTimerRef.current = setInterval(() => void refreshStreamStatus(obs), 2000);
    } catch (err) {
      setConn("error");
      setConnError(
        err instanceof Error
          ? err.message
          : "Could not connect. Is OBS open with the WebSocket server enabled?",
      );
      obsRef.current = null;
    }
  }

  async function handleDisconnect() {
    if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    if (obsRef.current) await obsRef.current.disconnect().catch(() => {});
    obsRef.current = null;
    setConn("disconnected");
    setScenes([]);
    setSceneItems([]);
    setStreaming(false);
    setRecording(false);
  }

  async function switchScene(sceneName: string) {
    if (!obsRef.current) return;
    await obsRef.current.call("SetCurrentProgramScene", { sceneName });
  }

  async function toggleSource(item: SceneItem) {
    if (!obsRef.current) return;
    setSceneItems((prev) =>
      prev.map((i) =>
        i.sceneItemId === item.sceneItemId
          ? { ...i, sceneItemEnabled: !i.sceneItemEnabled }
          : i,
      ),
    );
    try {
      await obsRef.current.call("SetSceneItemEnabled", {
        sceneName: currentScene,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: !item.sceneItemEnabled,
      });
    } catch {
      void refreshSceneItems(obsRef.current, currentScene);
    }
  }

  async function toggleStream() {
    if (!obsRef.current || busy) return;
    setBusy(true);
    try {
      await obsRef.current.call(streaming ? "StopStream" : "StartStream");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecord() {
    if (!obsRef.current || busy) return;
    setBusy(true);
    try {
      await obsRef.current.call(recording ? "StopRecord" : "StartRecord");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>OBS REMOTE CONTROL</h1>
        <p className={styles.pageSubtitle}>
          Connect to OBS Studio over WebSocket. Switch scenes, toggle sources, and monitor your stream.
        </p>
      </div>

      {/* Connect card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span><Plug size={16} /> CONNECTION</span>
          <span
            className={`${styles.statusPill} ${
              conn === "connected"
                ? styles.statusLive
                : conn === "connecting"
                  ? styles.statusBusy
                  : styles.statusOff
            }`}
          >
            <Circle size={7} fill="currentColor" />
            {conn === "connected"
              ? `CONNECTED${obsVersion ? ` · OBS ${obsVersion}` : ""}`
              : conn === "connecting"
                ? "CONNECTING..."
                : conn === "error"
                  ? "FAILED"
                  : "OFFLINE"}
          </span>
        </div>

        <div className={styles.connectRow}>
          <input
            type="text"
            className={styles.input}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="ws://127.0.0.1:4455"
            disabled={conn === "connected" || conn === "connecting"}
          />
          <input
            type="password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="WebSocket password (if set)"
            disabled={conn === "connected" || conn === "connecting"}
          />
          {conn === "connected" ? (
            <button type="button" className={styles.btnDanger} onClick={() => void handleDisconnect()}>
              <Unplug size={14} /> DISCONNECT
            </button>
          ) : (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void handleConnect()}
              disabled={conn === "connecting"}
            >
              {conn === "connecting" ? <Loader2 size={14} className={styles.spinIcon} /> : <PlugZap size={14} />}
              CONNECT
            </button>
          )}
        </div>

        <p className={styles.hintText}>
          In OBS Studio: <strong>Tools → WebSocket Server Settings</strong> → enable the server (default port 4455) and set a password if needed. The password is used only for this connection and is never saved in this browser.
        </p>
        {connError && <p className={styles.hintText} style={{ color: "#EF4444" }}>{connError}</p>}
      </div>

      {conn === "connected" && (
        <div className={styles.mainGrid}>
          {/* Left: scenes + sources */}
          <div className={styles.leftColumn}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span><MonitorPlay size={16} /> SCENES</span>
                <button
                  type="button"
                  className={styles.btnIcon}
                  title="Refresh scenes"
                  onClick={() => obsRef.current && void refreshScenes(obsRef.current)}
                >
                  <RefreshCw size={13} />
                </button>
              </div>
              <div className={styles.sceneGrid}>
                {scenes.map((s) => (
                  <button
                    key={s.sceneName}
                    type="button"
                    className={currentScene === s.sceneName ? styles.sceneActive : styles.sceneBtn}
                    onClick={() => void switchScene(s.sceneName)}
                  >
                    {currentScene === s.sceneName && <Check size={13} />}
                    {s.sceneName}
                  </button>
                ))}
                {scenes.length === 0 && <span className={styles.emptyText}>No scenes found.</span>}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span><Eye size={16} /> SOURCES — {currentScene.toUpperCase()}</span>
              </div>
              <div className={styles.sourceList}>
                {sceneItems.map((item) => (
                  <div key={item.sceneItemId} className={styles.sourceRow}>
                    <span className={item.sceneItemEnabled ? styles.sourceName : styles.sourceNameOff}>
                      {item.sourceName}
                    </span>
                    <button
                      type="button"
                      className={item.sceneItemEnabled ? styles.eyeOn : styles.eyeOff}
                      title={item.sceneItemEnabled ? "Hide source" : "Show source"}
                      onClick={() => void toggleSource(item)}
                    >
                      {item.sceneItemEnabled ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                  </div>
                ))}
                {sceneItems.length === 0 && <span className={styles.emptyText}>No sources in this scene.</span>}
              </div>
            </div>
          </div>

          {/* Right: stream status */}
          <div className={styles.rightColumn}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span><Radio size={16} /> STREAM STATUS</span>
                <span className={`${styles.statusPill} ${streaming ? styles.statusLive : styles.statusOff}`}>
                  <Circle size={7} fill="currentColor" />
                  {streaming ? "LIVE" : "OFFLINE"}
                </span>
              </div>

              <div className={styles.statsGrid}>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>UPTIME</span>
                  <span className={styles.statValue}>{formatDuration(streamDuration)}</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>DATA SENT</span>
                  <span className={styles.statValue}>{formatBytes(streamBytes)}</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>RECORDING</span>
                  <span className={styles.statValue} style={{ color: recording ? "#EF4444" : undefined }}>
                    {recording ? "REC" : "STOPPED"}
                  </span>
                </div>
              </div>

              <div className={styles.controlBtns}>
                <button
                  type="button"
                  className={streaming ? styles.btnDanger : styles.btnPrimary}
                  onClick={() => void toggleStream()}
                  disabled={busy}
                >
                  {streaming ? <Square size={14} /> : <Radio size={14} />}
                  {streaming ? "STOP STREAM" : "START STREAM"}
                </button>
                <button
                  type="button"
                  className={recording ? styles.btnDanger : styles.btnSecondary}
                  onClick={() => void toggleRecord()}
                  disabled={busy}
                >
                  <Video size={14} />
                  {recording ? "STOP REC" : "START REC"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}