import { useWindowDimensions } from 'react-native';

/**
 * Returns responsive horizontal padding for content areas.
 * Ensures consistent margins on all device sizes and orientations,
 * preventing content (e.g. loading animation, illustrations) from appearing
 * squished against screen edges.
 *
 * Uses ~8% of screen width, clamped between 32–56px:
 * - Small phones (320pt): 32px (min)
 * - Standard phones (390pt): ~31px → 32px
 * - Large phones (430pt): ~34px
 * - Tablets (768pt+): 56px (max)
 */
export function useContentPadding(): { paddingHorizontal: number } {
  const { width } = useWindowDimensions();
  const paddingHorizontal = Math.max(32, Math.min(56, Math.round(width * 0.08)));
  return { paddingHorizontal };
}
