import React from 'react';
import { 
  Text, 
  StyleSheet, 
  ViewStyle, 
  TextStyle,
  Pressable,
  View
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/colors';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createPokedexTextStyle } from '../../utils/styleUtils';
import * as Haptics from 'expo-haptics';

interface PokedexButtonProps {
  onPress: () => void;
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  materialCommunityIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  style?: ViewStyle;
  textStyle?: TextStyle;
  color?: string;
  iconColor?: string;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  darkDisabled?: boolean;
  shape?: 'default' | 'square';
}

export default function PokedexButton({
  onPress,
  title,
  icon,
  materialCommunityIcon,
  style,
  textStyle,
  color,
  iconColor: customIconColor,
  size = 'medium',
  disabled = false,
  darkDisabled = false,
  shape = 'default',
}: PokedexButtonProps) {

  // Handle press with haptic feedback
  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  // Define size dimensions
  const isSquare = shape === 'square';
  
  const sizeStyles = {
    small: {
      height: 45,
      width: isSquare ? 45 : undefined,
      paddingHorizontal: isSquare ? 0 : 15,
      borderRadius: isSquare ? 12 : 22.5,
      iconSize: isSquare ? 22 : 20,
      fontSize: 14,
    },
    medium: {
      height: 65,
      width: isSquare ? 65 : undefined,
      paddingHorizontal: isSquare ? 0 : 20,
      borderRadius: isSquare ? 16 : 32.5,
      iconSize: isSquare ? 28 : 20,
      fontSize: 16,
    },
    large: {
      height: 75,
      width: isSquare ? 75 : undefined,
      paddingHorizontal: isSquare ? 0 : 25,
      borderRadius: isSquare ? 18 : 37.5,
      iconSize: isSquare ? 34 : 30,
      fontSize: 18,
    },
  };

  const currentSize = sizeStyles[size];
  
  // Determine icon color based on state
  const iconColor = customIconColor || (darkDisabled ? COLORS.darkGray : COLORS.text);

  // Gradient colors based on state
  const getGradientColors = (): readonly [string, string, ...string[]] => {
    if (darkDisabled) {
      return ['rgba(51, 65, 85, 0.7)', 'rgba(30, 41, 59, 0.8)'] as const;
    }
    if (disabled) {
      return ['rgba(100, 116, 139, 0.5)', 'rgba(71, 85, 105, 0.6)'] as const;
    }
    // Use grey gradient if color prop is provided (matching flip/image buttons)
    if (color && (color.includes('grey') || color.includes('gray') || color.includes('128'))) {
      return [
        'rgba(140, 140, 140, 0.35)',  // Lighter grey top
        'rgba(100, 100, 100, 0.45)',   // Darker grey bottom
      ] as const;
    }
    // Default glassmorphism gradient (blue)
    return [
      'rgba(59, 130, 246, 0.25)',  // Blue tint top
      'rgba(30, 64, 175, 0.35)',   // Deeper blue bottom
    ] as const;
  };

  // Glass overlay gradient for shine effect
  const glassOverlayColors: readonly [string, string, ...string[]] = [
    'rgba(255, 255, 255, 0.2)',
    'rgba(255, 255, 255, 0.05)',
    'rgba(255, 255, 255, 0.0)',
  ] as const;
  
  return (
    <View style={[styles.buttonContainer, style, { width: currentSize.width }]}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={({pressed}) => [
          styles.buttonBase,
          { 
            borderRadius: currentSize.borderRadius, 
            width: currentSize.width || 'auto', 
            height: currentSize.height,
            paddingHorizontal: currentSize.paddingHorizontal,
            transform: [{ scale: pressed ? 0.96 : 1 }],
            opacity: pressed ? 0.9 : 1,
          },
          disabled && styles.disabled,
          darkDisabled && styles.darkDisabled,
        ]}
      >
        {/* Main gradient background */}
        <LinearGradient
          colors={getGradientColors()}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: currentSize.borderRadius }
          ]}
        />
        
        {/* Glass highlight overlay (top shine) */}
        {!darkDisabled && (
          <LinearGradient
            colors={glassOverlayColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.6 }}
            style={[
              styles.glassOverlay,
              { 
                borderRadius: currentSize.borderRadius,
                height: '60%',
              }
            ]}
          />
        )}
        
        {/* Inner glow border */}
        <View 
          style={[
            styles.innerBorder,
            { borderRadius: currentSize.borderRadius - 1 }
          ]} 
        />
        
        {/* Button content */}
        <View style={[styles.buttonContent, !title && styles.iconOnlyContent]}>
          {icon && !materialCommunityIcon && (
            <Ionicons 
              name={icon} 
              size={currentSize.iconSize} 
              color={iconColor}
              style={[styles.icon, !title && { marginRight: 0 }]} 
            />
          )}
          {materialCommunityIcon && (
            <MaterialCommunityIcons
              name={materialCommunityIcon}
              size={currentSize.iconSize}
              color={iconColor}
              style={[styles.icon, !title && { marginRight: 0 }]}
            />
          )}
          {title && (
            <Text 
              style={[
                createPokedexTextStyle(iconColor, size, 'bold'),
                textStyle
              ]}
            >
              {title}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    position: 'relative',
    marginVertical: 8,
  },
  buttonBase: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    // Glassmorphism border
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    // Soft shadow for depth
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Background blur simulation (via semi-transparent background)
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  glassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  innerBorder: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    pointerEvents: 'none',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  icon: {
    marginRight: 8,
  },
  disabled: {
    opacity: 0.6,
  },
  darkDisabled: {
    opacity: 0.7,
  },
  iconOnlyContent: {
    justifyContent: 'center',
  },
});
