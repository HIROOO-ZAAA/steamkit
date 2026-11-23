import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./setup-guides.module.css";

export default function SetupGuideNotFound() {
  return (
    <div className={`${styles.container} ${styles.notFoundWrap}`}>
      <div className={styles.notFoundCard}>
        <p className={styles.eyebrow}>Setup Guide</p>
        <h1>Guide not found</h1>
        <p>
          That setup guide does not exist, or its address has changed. Return to
          the setup guide and choose a feature from the current list.
        </p>
        <Link href="/setup-guides" className={styles.primaryAction}>
          <ArrowLeft aria-hidden="true" size={16} />
          Back to Setup Guide
        </Link>
      </div>
    </div>
  );
}
