import React, { useId } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  className = "",
  id,
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="input-group">
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`input ${error ? "input-error" : ""} ${className}`.trim()}
        {...props}
      />
      {error && <span className="input-error-message">{error}</span>}
      {!error && helperText && (
        <span className="input-helper-text">{helperText}</span>
      )}
    </div>
  );
};
