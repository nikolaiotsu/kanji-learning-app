import React from 'react';
import { 
  Text, 
  StyleSheet, 
  ViewStyle, 
  TextStyle,
  Pressable,
  View
} from 'react-native';
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

  // Minimal frost glass backgrounds (Option A) - brightened
  const getBackgroundColor = (): string => {
    if (darkDisabled) return 'rgba(51, 65, 85, 0.5)';
    if (disabled) return 'rgba(255, 255, 255, 0.08)';
    if (color && (color.includes('grey') || color.includes('gray') || color.includes('128'))) {
      return 'rgba(255, 255, 255, 0.12)';  // Subtler frost for secondary
    }
    return 'rgba(255, 255, 255, 0.15)';  // Primary frost
  };

  const showTopHighlight = !darkDisabled;
  
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
          darkDisabled && [styles.darkDisabled, { borderColor: 'rgba(255, 255, 255, 0.08)' }],
        ]}
      >
        {/* Frost glass background */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: currentSize.borderRadius,
              backgroundColor: getBackgroundColor(),
            },
          ]}
        />
        
        {/* Single top edge highlight */}
        {showTopHighlight && (
          <View
            style={[
              styles.topHighlight,
              {
                borderTopLeftRadius: currentSize.borderRadius,
                borderTopRightRadius: currentSize.borderRadius,
              },
            ]}
          />
        )}
        
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
    // Minimal frost glass (Option A)
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
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
