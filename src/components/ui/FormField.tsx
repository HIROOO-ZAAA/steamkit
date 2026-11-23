"use client";

import React, { useId } from "react";
import styles from "./FormField.module.css";

export interface FormFieldProps {
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  error,
  helperText,
  children,
  className = "",
  htmlFor,
}) => {
  const generatedId = useId();
  const fieldId = htmlFor || generatedId;

  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""} ${className}`}>
      {label && (
        <label htmlFor={fieldId} className={styles.label}>
          {label}
          {required && <span className={styles.required} aria-hidden="true">*</span>}
        </label>
      )}
      <div className={styles.inputWrapper}>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          const childProps = child.props as Record<string, unknown>;
          return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
            id: childProps.id || fieldId,
            error: childProps.error ?? error,
            helperText: childProps.helperText ?? helperText,
          });
        })}
      </div>
      {(error || helperText) && (
        <div className={styles.feedback}>
          {error && <span className={styles.errorMessage} role="alert">{error}</span>}
          {!error && helperText && <span className={styles.helperMessage}>{helperText}</span>}
        </div>
      )}
    </div>
  );
};

export interface FormFieldSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormFieldSection: React.FC<FormFieldSectionProps> = ({
  title,
  description,
  children,
  className = "",
}) => (
  <fieldset className={`${styles.section} ${className}`}>
    <legend className={styles.legend}>
      <span className={styles.legendTitle}>{title}</span>
      {description && <span className={styles.legendDescription}>{description}</span>}
    </legend>
    <div className={styles.sectionContent}>{children}</div>
  </fieldset>
);

export interface FormRowProps {
  children: React.ReactNode;
  className?: string;
  columns?: 1 | 2 | 3 | 4;
}

export const FormRow: React.FC<FormRowProps> = ({
  children,
  className = "",
  columns = 2,
}) => (
  <div
    className={`${styles.row} ${styles["cols" + columns] || ""} ${className}`}
    style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` } as React.CSSProperties}
  >
    {children}
  </div>
);

export interface FormActionsProps {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end" | "stretch";
}

export const FormActions: React.FC<FormActionsProps> = ({
  children,
  className = "",
  align = "end",
}) => {
  const alignClass = `align${align.charAt(0).toUpperCase() + align.slice(1)}`;
  return (
    <div className={`${styles.actions} ${styles[alignClass]} ${className}`}>
      {children}
    </div>
  );
};
