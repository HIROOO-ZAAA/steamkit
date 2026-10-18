/** A selected clone is an explicit voice choice; do not mask its failure. */
export function canUseBrowserVoiceFallback(cloneSelected: boolean): boolean {
  return !cloneSelected;
}
