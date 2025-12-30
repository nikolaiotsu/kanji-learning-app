import { COLORS } from "../constants/colors";
import { ViewStyle, TextStyle } from "react-native";

/**
 * Darkens a color by a specified percentage
 * @param color Hex color string (e.g. '#FF0000')
 * @param percent Percentage to darken (0-100)
 * @returns Darkened hex color string
 */
export function darkenColor(color: string, percent: number): string {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
  const B = Math.max(0, (num & 0x0000ff) - amt);
  return "#" + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1);
}

/**
 * Lightens a color by a specified percentage
 * @param color Hex color string (e.g. '#FF0000')
 * @param percent Percentage to lighten (0-100)
 * @returns Lightened hex color string
 */
export function lightenColor(color: string, percent: number): string {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return "#" + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1);
}

/**
 * Creates styles for a modern glassmorphism button
 * @param color Base color of the button (used for glow effect)
 * @param size Size of the button (small, medium, large)
 * @returns Object with button and shadow styles
 */
export function createPokedexButtonStyles(
  color: string = COLORS.pokedexBlue,
  size: "small" | "medium" | "large" = "medium"
): { button: ViewStyle; shadow: ViewStyle } {
  // Define size dimensions with modern rounded corners
  const sizeStyles = {
    small: {
      height: 45,
      paddingHorizontal: 15,
      borderRadius: 12,
    },
    medium: {
      height: 65,
      paddingHorizontal: 20,
      borderRadius: 16,
    },
    large: {
      height: 75,
      paddingHorizontal: 25,
      borderRadius: 18,
    },
  };

  const currentSize = sizeStyles[size];

  return {
    button: {
      backgroundColor: 'rgba(15, 23, 42, 0.4)',
      height: currentSize.height,
      paddingHorizontal: currentSize.paddingHorizontal,
      borderRadius: currentSize.borderRadius,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
      zIndex: 2,
      // Modern shadow with color tint
      shadowColor: color,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    },
    shadow: {
      // Subtle ambient shadow
      backgroundColor: 'transparent',
      height: currentSize.height,
      paddingHorizontal: currentSize.paddingHorizontal,
      borderRadius: currentSize.borderRadius,
      position: "absolute",
      top: 4,
      left: 2,
      right: 2,
      zIndex: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
    },
  };
}

/**
 * Creates styles for a modern glass-style card or panel
 * @param backgroundColor Background color of the card
 * @param depth Depth of the shadow effect (in pixels)
 * @returns Object with card and shadow styles
 */
export function createPokedexCardStyles(
  backgroundColor: string = COLORS.screenBackground,
  depth: number = 5
): { card: ViewStyle; shadow: ViewStyle } {
  return {
    card: {
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      padding: 15,
      zIndex: 2,
      // Soft shadow
      shadowColor: '#000',
      shadowOffset: { width: 0, height: depth },
      shadowOpacity: 0.25,
      shadowRadius: depth * 2,
    },
    shadow: {
      backgroundColor: 'transparent',
      borderRadius: 16,
      position: "absolute",
      top: depth,
      left: 0,
      right: 0,
      bottom: -depth,
      zIndex: 1,
    },
  };
}

/**
 * Creates text styles consistent with the modern theme
 * @param color Text color
 * @param size Font size
 * @param weight Font weight
 * @returns TextStyle object
 */
export function createPokedexTextStyle(
  color: string = COLORS.text,
  size: "small" | "medium" | "large" = "medium",
  weight: "normal" | "bold" = "normal"
): TextStyle {
  const fontSizes = {
    small: 14,
    medium: 16,
    large: 18,
  };

  return {
    color,
    fontSize: fontSizes[size],
    fontWeight: weight,
    textAlign: "center",
    // Add subtle text shadow for better readability on glass surfaces
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  };
}

/**
 * Returns gradient color arrays for different button states
 * @param variant The style variant
 * @returns Array of gradient colors
 */
export function getGradientColors(
  variant: "primary" | "secondary" | "disabled" | "glass" = "glass"
): string[] {
  switch (variant) {
    case "primary":
      return [
        COLORS.gradient.blueStart,
        COLORS.gradient.blueMid,
        COLORS.gradient.blueEnd,
      ];
    case "secondary":
      return [
        COLORS.gradient.purpleStart,
        COLORS.gradient.purpleEnd,
      ];
    case "disabled":
      return [
        'rgba(51, 65, 85, 0.7)',
        'rgba(30, 41, 59, 0.8)',
      ];
    case "glass":
    default:
      return [
        'rgba(59, 130, 246, 0.25)',
        'rgba(30, 64, 175, 0.35)',
      ];
  }
}
