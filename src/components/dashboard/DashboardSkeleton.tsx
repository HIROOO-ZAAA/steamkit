import styles from "./DashboardSkeleton.module.css";

export default function DashboardSkeleton() {
  return (
    <div
      className={styles.wrap}
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className={`${styles.hero} skeleton`} />
      <div className={styles.statusGrid}>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`${styles.card} skeleton`} />
        ))}
      </div>
      <div className={styles.mainGrid}>
        <div className={`${styles.chart} skeleton`} />
        <div className={`${styles.activity} skeleton`} />
      </div>
      <div className={`${styles.block} skeleton`} />
      <div className={styles.supportGrid}>
        <div className={`${styles.support} skeleton`} />
        <div className={`${styles.support} skeleton`} />
      </div>
    </div>
  );
}
