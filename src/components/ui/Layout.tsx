import type { HTMLAttributes, ReactNode } from "react";
import styles from "./primitives.module.css";

interface ShellProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

interface SectionHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Navbar({ children, className = "", ...props }: ShellProps) {
  return (
    <header className={`${styles.navbar} ${className}`.trim()} {...props}>
      <nav className={styles.navbarInner} aria-label="Primary navigation">
        {children}
      </nav>
    </header>
  );
}

export function Footer({ children, className = "", ...props }: ShellProps) {
  return (
    <footer className={`${styles.footer} ${className}`.trim()} {...props}>
      <div className={styles.footerInner}>{children}</div>
    </footer>
  );
}

export function Container({
  children,
  className = "",
  ...props
}: ContainerProps) {
  return (
    <div className={`${styles.container} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  description,
  action,
  className = "",
}: SectionHeaderProps) {
  return (
    <header className={`${styles.sectionHeader} ${className}`.trim()}>
      <div>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2>{title}</h2>
        {description && (
          <p className={styles.sectionDescription}>{description}</p>
        )}
      </div>
      {action && <div className={styles.sectionAction}>{action}</div>}
    </header>
  );
}
