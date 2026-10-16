import styles from "./primitives.module.css";

interface SteamKitMarkProps {
  size?: number;
  className?: string;
}

export function SteamKitMark({ size = 32, className = "" }: SteamKitMarkProps) {
  return (
    <span
      className={`${styles.nexusMark} ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
    </span>
  );
}

export function SteamKitWordmark({ size = 30 }: { size?: number }) {
  return (
    <span className={styles.nexusWordmark}>
      <span>STEAM KIT</span>
    </span>
  );
}
