"use client";

import React, { useId, useRef, useState, useEffect } from "react";
import { ChevronDown, ChevronUp, X, Check } from "lucide-react";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "children"> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  clearable?: boolean;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  options,
  value,
  onChange,
  placeholder = "Select an option",
  searchable = false,
  clearable = false,
  className = "",
  disabled,
  id,
  required,
  ...props
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const selectRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchQuery("");
    setFocusedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledOptions = filteredOptions.filter((opt) => !opt.disabled);
    if (enabledOptions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < enabledOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev > 0 ? prev - 1 : enabledOptions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < enabledOptions.length) {
          handleSelect(enabledOptions[focusedIndex].value);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearchQuery("");
        setFocusedIndex(-1);
        break;
      case "Tab":
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
      setIsOpen(false);
      setSearchQuery("");
      setFocusedIndex(-1);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const currentFilteredOptions = options.filter((opt) =>
      opt.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const initialIndex = value ? currentFilteredOptions.findIndex((o) => o.value === value) : -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
    setFocusedIndex(initialIndex);
  }, [isOpen, value, searchQuery]);

  useEffect(() => {
    if (focusedIndex >= 0 && optionsRef.current) {
      const optionElements = optionsRef.current.querySelectorAll(
        `[data-value]:not([data-disabled])`
      );
      if (optionElements[focusedIndex]) {
        (optionElements[focusedIndex] as HTMLElement).scrollIntoView({
          block: "nearest",
        });
      }
    }
  }, [focusedIndex, isOpen]);

  const displayValue = options.find((o) => o.value === value)?.label ?? placeholder;

  return (
    <div className={`input-group ${className}`}>
      {label && (
        <label htmlFor={selectId} className="input-label">
          {label}
        </label>
      )}
      <div
        ref={selectRef}
        className={`${styles.selectWrapper} ${error ? styles.error : ""} ${disabled ? styles.disabled : ""} ${isOpen ? styles.open : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
        aria-invalid={!!error}
        aria-required={required}
      >
        <div className={styles.selectTrigger}>
          <span className={value ? styles.selectedValue : styles.placeholder}>
            {displayValue}
          </span>
          {clearable && value && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={handleClear}
              aria-label="Clear selection"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
          <span className={styles.chevron} aria-hidden="true">
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </div>

        {isOpen && (
          <div className={styles.dropdown}>
            {searchable && (
              <div className={styles.searchWrapper}>
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setFocusedIndex(-1);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            )}
            <div
              ref={optionsRef}
              className={styles.optionsList}
              role="listbox"
              aria-label="Options"
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.option} ${option.disabled ? styles.disabled : ""} ${index === focusedIndex ? styles.focused : ""} ${value === option.value ? styles.selected : ""}`}
                    data-value={option.value}
                    data-disabled={option.disabled}
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    onMouseEnter={() => !option.disabled && setFocusedIndex(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    role="option"
                    aria-selected={value === option.value}
                    aria-disabled={option.disabled}
                    disabled={option.disabled}
                  >
                    <span className={styles.optionLabel}>{option.label}</span>
                    {value === option.value && (
                      <Check size={14} className={styles.checkIcon} aria-hidden="true" />
                    )}
                  </button>
                ))
              ) : (
                <div className={styles.noResults}>No options found</div>
              )}
            </div>
          </div>
        )}
      </div>
      {error && <span className="input-error-message">{error}</span>}
      {!error && helperText && <span className="input-helper-text">{helperText}</span>}
    </div>
  );
}

// Simple Select without search/portal (for basic use cases)
interface SimpleSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export const SimpleSelect: React.FC<SimpleSelectProps> = ({
  label,
  error,
  helperText,
  options,
  placeholder = "Select an option",
  className = "",
  id,
  disabled,
  required,
  ...props
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;

  return (
    <div className={`input-group ${className}`}>
      {label && (
        <label htmlFor={selectId} className="input-label">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`input ${error ? "input-error" : ""}`}
        disabled={disabled}
        required={required}
        {...props}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="input-error-message">{error}</span>}
      {!error && helperText && <span className="input-helper-text">{helperText}</span>}
    </div>
  );
}