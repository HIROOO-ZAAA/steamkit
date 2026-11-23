import { MessageSquareText, RadioTower } from "lucide-react";
import styles from "./chat.module.css";

export default function YouTubeChatPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>
            <MessageSquareText size={21} strokeWidth={1.8} /> YouTube Live Chat
          </h1>
          <p className={styles.subtitle}>
            Live chat overlay connection status.
          </p>
        </div>
      </header>

      <section className={`${styles.previewCard} card`}>
        <RadioTower size={26} strokeWidth={1.8} />
        <h2>YouTube chat is not connected</h2>
        <p>
          No chat messages are available. Connect a YouTube Live source before
          configuring an OBS chat overlay.
        </p>
      </section>
    </div>
  );
}
