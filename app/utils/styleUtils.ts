import { COLORS } from "../constants/colors";
import { FONTS } from "../constants/typography";
import { ViewStyle, TextStyle, Platform } from "react-native";

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
    fontFamily: weight === "bold" ? FONTS.sansBold : FONTS.sans,
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

/**
 * Helper function to interpolate between two hex colors
 * @param color1 First hex color (e.g. '#FF0000')
 * @param color2 Second hex color (e.g. '#00FF00')
 * @param factor Interpolation factor (0-1, where 0 = color1, 1 = color2)
 * @returns Interpolated hex color string
 */
export function interpolateColor(color1: string, color2: string, factor: number): string {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  
  const r1 = parseInt(hex1.substring(0, 2), 16);
  const g1 = parseInt(hex1.substring(2, 4), 16);
  const b1 = parseInt(hex1.substring(4, 6), 16);
  
  const r2 = parseInt(hex2.substring(0, 2), 16);
  const g2 = parseInt(hex2.substring(2, 4), 16);
  const b2 = parseInt(hex2.substring(4, 6), 16);
  
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Creates an elevated surface style with layered shadows for depth
 * @param elevation 0-4 elevation level
 * @param borderRadius Optional border radius
 * @returns ViewStyle with shadow properties
 */
export function createElevatedSurface(
  elevation: 0 | 1 | 2 | 3 | 4 = 1,
  borderRadius: number = 16
): ViewStyle {
  const elevationConfigs = {
    0: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 1,
    },
    1: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 3,
    },
    2: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 6,
    },
    3: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.24,
      shadowRadius: 12,
      elevation: 9,
    },
    4: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.30,
      shadowRadius: 16,
      elevation: 12,
    },
  };

  return {
    ...elevationConfigs[elevation],
    borderRadius,
    backgroundColor: COLORS.depth.surface1,
  };
}

/**
 * Creates a subtle dark border for depth
 * @param intensity 'subtle' | 'medium' | 'strong'
 * @param borderRadius Border radius of the element
 * @returns ViewStyle for the border effect
 */
export function createDepthBorder(
  intensity: 'subtle' | 'medium' | 'strong' = 'medium',
  borderRadius: number = 16
): ViewStyle {
  const intensityMap = {
    subtle: {
      borderWidth: 1,
      borderColor: COLORS.depth.shadowFaint,
    },
    medium: {
      borderWidth: 1,
      borderColor: COLORS.depth.shadowSubtle,
    },
    strong: {
      borderWidth: 1.5,
      borderColor: COLORS.depth.shadowMedium,
    },
  };

  return {
    ...intensityMap[intensity],
    borderRadius,
  };
}

/**
 * Creates an inset/pressed appearance style
 * @param depth 'shallow' | 'medium' | 'deep'
 * @returns ViewStyle with inset shadow effect
 */
export function createInsetStyle(
  depth: 'shallow' | 'medium' | 'deep' = 'medium'
): ViewStyle {
  const depthMap = {
    shallow: {
      borderWidth: 1,
      borderColor: COLORS.depth.insetLight,
    },
    medium: {
      borderWidth: 1.5,
      borderColor: COLORS.depth.insetMedium,
    },
    deep: {
      borderWidth: 2,
      borderColor: COLORS.depth.insetDeep,
    },
  };

  return depthMap[depth];
}

/**
 * Creates a glowing ambient effect style
 * @param color Base glow color ('blue' | 'purple' | 'amber' | string)
 * @param intensity 'subtle' | 'medium' | 'strong'
 * @returns ViewStyle with glow shadow effect
 */
export function createGlowEffect(
  color: 'blue' | 'purple' | 'amber' | string = 'blue',
  intensity: 'subtle' | 'medium' | 'strong' = 'medium'
): ViewStyle {
  const colorMap: Record<string, string> = {
    blue: COLORS.primary,
    purple: COLORS.accent,
    amber: COLORS.pokedexAmber,
  };

  const glowColor = colorMap[color] || color;

  const intensityMap = {
    subtle: {
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    medium: {
      shadowOpacity: 0.35,
      shadowRadius: 12,
    },
    strong: {
      shadowOpacity: 0.5,
      shadowRadius: 18,
    },
  };

  return {
    shadowColor: glowColor,
    shadowOffset: { width: 0, height: 0 },
    ...intensityMap[intensity],
    elevation: Platform.OS === 'android' ? intensityMap[intensity].shadowRadius / 2 : undefined,
  };
}

/**
 * Creates an edge definition style for visual separation
 * @param position 'top' | 'bottom' | 'all'
 * @param intensity 'subtle' | 'medium' | 'strong'
 * @returns ViewStyle for edge definition
 */
export function createEdgeDefinition(
  position: 'top' | 'bottom' | 'all' = 'all',
  intensity: 'subtle' | 'medium' | 'strong' = 'subtle'
): ViewStyle {
  const intensityColors = {
    subtle: COLORS.depth.shadowFaint,
    medium: COLORS.depth.shadowSubtle,
    strong: COLORS.depth.shadowMedium,
  };

  const color = intensityColors[intensity];

  switch (position) {
    case 'top':
      return {
        borderTopWidth: 1,
        borderTopColor: color,
      };
    case 'bottom':
      return {
        borderBottomWidth: 1,
        borderBottomColor: color,
      };
    case 'all':
    default:
      return {
        borderWidth: 1,
        borderColor: color,
      };
  }
}

/**
 * Creates gradient stops for a modern 3D button appearance
 * @param baseColor Base color for the gradient
 * @param variant 'raised' | 'flat' | 'inset'
 * @returns Array of gradient color strings
 */
export function create3DGradientColors(
  baseColor: string = COLORS.primary,
  variant: 'raised' | 'flat' | 'inset' = 'raised'
): string[] {
  switch (variant) {
    case 'raised':
      return [
        lightenColor(baseColor, 15),  // Top highlight
        lightenColor(baseColor, 5),   // Upper mid
        baseColor,                     // Center
        darkenColor(baseColor, 8),    // Lower mid
        darkenColor(baseColor, 18),   // Bottom shadow
      ];
    case 'flat':
      return [
        lightenColor(baseColor, 5),
        baseColor,
        darkenColor(baseColor, 5),
      ];
    case 'inset':
      return [
        darkenColor(baseColor, 15),   // Top shadow (inverted)
        darkenColor(baseColor, 5),    // Upper mid
        baseColor,                     // Center
        lightenColor(baseColor, 5),   // Lower mid
        lightenColor(baseColor, 10),  // Bottom highlight (inverted)
      ];
    default:
      return [baseColor];
  }
}

/**
 * Creates a comprehensive modern card style with depth effects
 * @param options Configuration options
 * @returns Object with card styles
 */
export function createModernCardStyles(options: {
  elevation?: 0 | 1 | 2 | 3 | 4;
  borderRadius?: number;
  glowColor?: 'blue' | 'purple' | 'amber' | 'none';
  borderIntensity?: 'subtle' | 'medium' | 'strong';
} = {}): {
  container: ViewStyle;
} {
  const {
    elevation = 2,
    borderRadius = 16,
    glowColor = 'none',
    borderIntensity = 'subtle',
  } = options;

  const baseElevation = createElevatedSurface(elevation, borderRadius);
  const border = createDepthBorder(borderIntensity, borderRadius);
  const glow = glowColor !== 'none' ? createGlowEffect(glowColor, 'subtle') : {};

  return {
    container: {
      ...baseElevation,
      ...border,
      ...glow,
      overflow: 'hidden',
    },
  };
}
