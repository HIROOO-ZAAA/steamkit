import Image from "next/image";
import {
  useId,
  type HTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Badge } from "./Badge";
import styles from "./primitives.module.css";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

type Status = "online" | "offline" | "warning" | "neutral";

interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  status?: Status;
  label?: string;
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
}

interface TableColumn<T> {
  key: keyof T;
  label: string;
  align?: "left" | "right";
}

interface TableProps<T extends Record<string, unknown>> {
  caption: string;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey?: keyof T;
  emptyMessage?: string;
}

export function Select({
  label,
  error,
  helperText,
  id,
  className = "",
  children,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const controlId = id || generatedId;

  return (
    <div className={styles.field}>
      {label && (
        <label className="input-label" htmlFor={controlId}>
          {label}
        </label>
      )}
      <select
        id={controlId}
        className={`input ${error ? "input-error" : ""} ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error
            ? `${controlId}-error`
            : helperText
              ? `${controlId}-help`
              : undefined
        }
        {...props}
      >
        {children}
      </select>
      {error && (
        <span className="input-error-message" id={`${controlId}-error`}>
          {error}
        </span>
      )}
      {!error && helperText && (
        <span className="input-helper-text" id={`${controlId}-help`}>
          {helperText}
        </span>
      )}
    </div>
  );
}

export function Textarea({
  label,
  error,
  helperText,
  id,
  className = "",
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const controlId = id || generatedId;

  return (
    <div className={styles.field}>
      {label && (
        <label className="input-label" htmlFor={controlId}>
          {label}
        </label>
      )}
      <textarea
        id={controlId}
        className={`input ${error ? "input-error" : ""} ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error
            ? `${controlId}-error`
            : helperText
              ? `${controlId}-help`
              : undefined
        }
        {...props}
      />
      {error && (
        <span className="input-error-message" id={`${controlId}-error`}>
          {error}
        </span>
      )}
      {!error && helperText && (
        <span className="input-helper-text" id={`${controlId}-help`}>
          {helperText}
        </span>
      )}
    </div>
  );
}

export function Panel({ children, className = "", ...props }: PanelProps) {
  return (
    <section className={`${styles.panel} ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function StatusDot({
  status = "neutral",
  label,
  className = "",
  ...props
}: StatusDotProps) {
  return (
    <span
      className={`${styles.statusDot} ${styles["status_" + status] || ""} ${className}`.trim()}
      {...props}
    >
      <span className={styles.statusMark} aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function LiveBadge({
  active = true,
  className = "",
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <Badge variant={active ? "green" : "gray"} className={className}>
      <StatusDot status={active ? "online" : "offline"} />
      {active ? "LIVE" : "OFFLINE"}
    </Badge>
  );
}

export function Avatar({ name, src, size = "md" }: AvatarProps) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "?";

  return (
    <span
      className={`${styles.avatar} ${styles["avatar_" + size] || ""}`}
      role="img"
      aria-label={name}
    >
      {src ? (
        <Image src={src} alt="" width={40} height={40} unoptimized />
      ) : (
        initials
      )}
    </span>
  );
}

export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  return (
    <span className={styles.tooltip} title={content} aria-label={content}>
      {children}
    </span>
  );
}

export function Table<T extends Record<string, unknown>>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage = "No records yet.",
}: TableProps<T>) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                scope="col"
                className={
                  column.align === "right" ? styles.alignRight : undefined
                }
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.tableEmpty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const key =
                rowKey && row[rowKey] != null
                  ? String(row[rowKey])
                  : String(index);
              return (
                <tr key={key}>
                  {columns.map((column) => (
                    <td
                      key={String(column.key)}
                      className={
                        column.align === "right" ? styles.alignRight : undefined
                      }
                    >
                      {row[column.key] == null ? "-" : String(row[column.key])}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Dropdown({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className={styles.dropdown}>
      <summary aria-label={label}>{trigger}</summary>
      <div role="menu" aria-label={label} className={styles.dropdownMenu}>
        {children}
      </div>
    </details>
  );
}

export function Alert({
  tone = "info",
  children,
  className = "",
  ...props
}: AlertProps) {
  return (
    <div
      className={`${styles.alert} ${styles["alert_" + tone] || ""} ${className}`.trim()}
      role={tone === "error" ? "alert" : "status"}
      {...props}
    >
      {children}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.state}>
      <h3>{title}</h3>
      <p>{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className={`${styles.state} ${styles.errorState}`} role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
