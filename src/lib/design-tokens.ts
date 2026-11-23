/**
 * StreamKit Design Tokens
 *
 * Single source of truth for colors, spacing, typography, shadows,
 * radii, transitions, and breakpoints. Mirrors globals.css :root variables.
 */

// ============================================================
// Colors
// ============================================================
export const colors = {
  // Base
  neutral: '#0F172A',
  surface: '#111C32',
  surfaceRaised: '#13203A',

  // Brand
  primary: '#10B981',
  primaryHover: '#34D399',
  secondary: '#0E5844',
  tertiary: '#94A3B8',

  // Text
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#0F172A',

  // Status
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  info: '#0EA5E9',
  violet: '#8B5CF6',

  // Borders
  borderSubtle: 'rgba(30, 51, 80, 0.65)',
  borderDefault: '#1E3350',
  borderStrong: '#294466',
  borderAccent: '#10B981',

  // Backgrounds
  bgBase: '#0F172A',
  bgSurface: '#111C32',
  bgElevated: '#13203A',
  bgHover: '#192944',
  bgCard: '#111C32',
  bgInput: '#13203A',

  // Shadows
  shadowGlow: 'rgba(16, 185, 129, 0.15)',
  shadowGlowStrong: 'rgba(16, 185, 129, 0.45)',
  shadowGlowRed: 'rgba(239, 68, 68, 0.55)',
} as const;

// ============================================================
// Spacing (in px)
// ============================================================
export const spacing = {
  xs: 4,
  sm: 12,
  md: 20,
  lg: 32,
  xl: 80,
  // Button padding
  btnPaddingX: { sm: 10, md: 20, lg: 28 },
  btnPaddingY: { sm: 6, md: 10, lg: 14 },
} as const;

// ============================================================
// Border Radius
// ============================================================
export const radius = {
  xs: 6,
  sm: 8,
  md: 8,
  lg: 12,
  xl: 12,
  full: 9999,
  button: 6,
} as const;

// ============================================================
// Typography
// ============================================================
export const typography = {
  fontFamilies: {
    heading: '"Rajdhani", sans-serif',
    body: '"Inter", sans-serif',
    mono: '"JetBrains Mono", monospace',
  },
  fontWeights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  fontSizes: {
    xs: '0.75rem',
    sm: '0.85rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.625rem',
    '5xl': '3.75rem',
  },
  lineHeights: {
    tight: 1,
    normal: 1.55,
    relaxed: 1.6,
  },
  letterSpacing: {
    tight: '0.01em',
    normal: 0,
    wide: '0.08em',
  },
} as const;

// ============================================================
// Shadows
// ============================================================
export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 12px rgba(0, 0, 0, 0.14)',
  lg: '0 10px 24px rgba(0, 0, 0, 0.18)',
  xl: '0 18px 40px rgba(0, 0, 0, 0.2)',
  glow: '0 0 24px rgba(16, 185, 129, 0.15)',
  glowStrong: '0 0 24px rgba(16, 185, 129, 0.45)',
  glowRed: '0 0 16px rgba(239, 68, 68, 0.55)',
} as const;

// ============================================================
// Transitions
// ============================================================
export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '400ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// ============================================================
// Breakpoints
// ============================================================
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ============================================================
// Z-Index
// ============================================================
export const zIndex = {
  dropdown: 100,
  modal: 200,
  popover: 300,
  tooltip: 400,
  toast: 500,
} as const;

// ============================================================
// Component-specific tokens
// ============================================================
export const components = {
  button: {
    heights: { sm: 32, md: 40, lg: 48 },
    minWidths: { sm: 80, md: 100, lg: 120 },
  },
  input: {
    heights: { sm: 32, md: 40, lg: 48 },
  },
  card: {
    padding: { sm: 12, md: 20, lg: 24 },
  },
  modal: {
    maxWidth: { sm: 400, md: 560, lg: 720, xl: 960 },
  },
} as const;

// ============================================================
// CSS Variable Names (for reference)
// ============================================================
export const cssVars = {
  colors: {
    neutral: '--color-neutral',
    surface: '--color-surface',
    surfaceRaised: '--color-surface-raised',
    primary: '--color-primary',
    secondary: '--color-secondary',
    tertiary: '--color-tertiary',
    text: '--color-text',
    border: '--color-border',
    grid: '--color-grid',
    shadowGlow: '--shadow-glow',
  },
  backgrounds: {
    base: '--bg-base',
    surface: '--bg-surface',
    elevated: '--bg-elevated',
    hover: '--bg-hover',
    card: '--bg-card',
    input: '--bg-input',
  },
  text: {
    primary: '--text-primary',
    secondary: '--text-secondary',
    muted: '--text-muted',
    inverse: '--text-inverse',
  },
  borders: {
    subtle: '--border-subtle',
    default: '--border-default',
    strong: '--border-strong',
    accent: '--border-accent',
  },
  shadows: {
    sm: '--shadow-sm',
    md: '--shadow-md',
    lg: '--shadow-lg',
    xl: '--shadow-xl',
    glow: '--shadow-glow',
  },
  spacing: {
    xs: '--space-xs',
    sm: '--space-sm',
    md: '--space-md',
    lg: '--space-lg',
    xl: '--space-xl',
  },
  radius: {
    button: '--radius-button',
    xs: '--radius-xs',
    sm: '--radius-sm',
    md: '--radius-md',
    lg: '--radius-lg',
    xl: '--radius-xl',
    full: '--radius-full',
  },
  transitions: {
    fast: '--transition-fast',
    base: '--transition-base',
    slow: '--transition-slow',
  },
} as const;

// ============================================================
// Type exports
// ============================================================
export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
export type FontSizeToken = keyof typeof typography.fontSizes;
export type ShadowToken = keyof typeof shadows;
export type TransitionToken = keyof typeof transitions;
export type BreakpointToken = keyof typeof breakpoints;
export type ZIndexToken = keyof typeof zIndex;

// ============================================================
// Utility: Get CSS variable string
// ============================================================
export function cssVar<T extends Record<string, string>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, `var(${value})`])
  ) as T;
}