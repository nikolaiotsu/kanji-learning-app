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
 * Creates styles for a 3D Pokedex-style button
 * @param color Base color of the button
 * @param size Size of the button (small, medium, large)
 * @returns Object with button and shadow styles
 */
export function createPokedexButtonStyles(
  color: string = COLORS.pokedexBlue,
  size: "small" | "medium" | "large" = "medium"
): { button: ViewStyle; shadow: ViewStyle } {
  // Define size dimensions
  const sizeStyles = {
    small: {
      height: 45,
      paddingHorizontal: 15,
      borderRadius: 22.5,
    },
    medium: {
      height: 65,
      paddingHorizontal: 20,
      borderRadius: 32.5,
    },
    large: {
      height: 75,
      paddingHorizontal: 25,
      borderRadius: 37.5,
    },
  };

  const currentSize = sizeStyles[size];

  return {
    button: {
      backgroundColor: color,
      height: currentSize.height,
      paddingHorizontal: currentSize.paddingHorizontal,
      borderRadius: currentSize.borderRadius,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: COLORS.pokedexBlack,
      zIndex: 2,
    },
    shadow: {
      backgroundColor: darkenColor(color, 30),
      height: currentSize.height,
      paddingHorizontal: currentSize.paddingHorizontal,
      borderRadius: currentSize.borderRadius,
      borderWidth: 2,
      borderColor: COLORS.pokedexBlack,
      position: "absolute",
      top: 3,
      left: 0,
      right: 0,
      zIndex: 1,
    },
  };
}

/**
 * Creates styles for a 3D Pokedex-style card or panel
 * @param backgroundColor Background color of the card
 * @param depth Depth of the 3D effect (in pixels)
 * @returns Object with card and shadow styles
 */
export function createPokedexCardStyles(
  backgroundColor: string = COLORS.screenBackground,
  depth: number = 5
): { card: ViewStyle; shadow: ViewStyle } {
  return {
    card: {
      backgroundColor,
      borderRadius: 8,
      borderWidth: 3,
      borderColor: COLORS.pokedexBlack,
      padding: 15,
      zIndex: 2,
    },
    shadow: {
      backgroundColor: darkenColor(backgroundColor, 50),
      borderRadius: 8,
      borderWidth: 3,
      borderColor: COLORS.pokedexBlack,
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
 * Creates text styles consistent with the Pokedex theme
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
  };
} 