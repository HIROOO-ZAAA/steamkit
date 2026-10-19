export type WidgetValidationInput = {
  title: string;
  rows: number;
  rowGap: number;
  maxName: number;
  fontSize: number;
  strokeW: number;
  colors: Record<string, string>;
};

/** Validate numeric layout bounds and color values before persisting widget JSON. */
export function validateWidgetSettings(input: WidgetValidationInput): string | null {
  if (!input.title.trim() || input.title.length > 60) return "Widget title must be 1–60 characters.";
  if (!Number.isInteger(input.rows) || input.rows < 1 || input.rows > 20) return "Rows must be between 1 and 20.";
  if (!Number.isInteger(input.rowGap) || input.rowGap < 0 || input.rowGap > 40) return "Row gap must be between 0 and 40 pixels.";
  if (!Number.isInteger(input.maxName) || input.maxName < 1 || input.maxName > 60) return "Maximum name length must be between 1 and 60.";
  if (!Number.isInteger(input.fontSize) || input.fontSize < 8 || input.fontSize > 96) return "Font size must be between 8 and 96 pixels.";
  if (!Number.isInteger(input.strokeW) || input.strokeW < 0 || input.strokeW > 8) return "Stroke width must be between 0 and 8 pixels.";
  if (Object.values(input.colors).some((color) => !/^#[0-9a-fA-F]{6}$/.test(color))) return "Choose a valid six-digit color for every color setting.";
  return null;
}
