/**
 * Premium typography for the app (DM Sans).
 * - Use ThemedText for new UI text, or add fontFamily: FONTS.sans (or .sansBold etc.) to your StyleSheet.
 * - Japanese/Kanji: keep system fonts (e.g. Hiragino on iOS) for CJK; use sans for Latin/UI.
 */
export const FONTS = {
  /** Primary UI font - DM Sans Regular */
  sans: 'DMSans_400Regular',
  /** Medium weight for emphasis */
  sansMedium: 'DMSans_500Medium',
  /** SemiBold for subheadings */
  sansSemiBold: 'DMSans_600SemiBold',
  /** Bold for headings and buttons */
  sansBold: 'DMSans_700Bold',
  /** Japanese/Kanji: use platform default (e.g. Hiragino on iOS) - set per-platform in components */
  japanese: undefined as string | undefined,
} as const;

export type FontFamily = keyof typeof FONTS;
