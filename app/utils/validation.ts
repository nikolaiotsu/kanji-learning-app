/**
 * Simple email format check (RFC-style) to avoid server round-trip for invalid format.
 * Used by login and signup flows.
 */
export const isValidEmailFormat = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
