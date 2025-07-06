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
import { createPokedexButtonStyles, createPokedexTextStyle } from '../../utils/styleUtils';
import * as Haptics from 'expo-haptics';

interface PokedexButtonProps {
  onPress: () => void;
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  materialCommunityIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  style?: ViewStyle;
  textStyle?: TextStyle;
  color?: string;
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
  // If shape is square, force grey background. Otherwise, use provided color or default blue.
  // const buttonBackgroundColor = isSquare ? COLORS.mediumSurface : (color || COLORS.pokedexBlue);
  // Prioritize explicitly passed color. If no color, then square gets mediumSurface, otherwise pokedexBlue.
  let buttonBackgroundColor = color || COLORS.rubberGrey; // Default to rubberGrey if no color prop is passed
  
  // Override background color if darkDisabled is true
  if (darkDisabled) {
    buttonBackgroundColor = COLORS.disabledDark;
  }
  
  // The icon color for square grey buttons might need to be dark for better contrast if the grey is very light.
  // Assuming COLORS.text (white) is still okay for mediumSurface.
  const iconColor = darkDisabled ? COLORS.darkGray : COLORS.text;

  const sizeStyles = {
    small: {
      height: 45,
      width: isSquare ? 45 : undefined,
      paddingHorizontal: isSquare ? 0 : 15,
      borderRadius: isSquare ? 8 : 22.5,
      iconSize: isSquare ? 22 : 20,
      fontSize: 14,
    },
    medium: {
      height: 65,
      width: isSquare ? 65 : undefined,
      paddingHorizontal: isSquare ? 0 : 20,
      borderRadius: isSquare ? 8 : 32.5,
      iconSize: isSquare ? 30 : 20,
      fontSize: 16,
    },
    large: {
      height: 75,
      width: isSquare ? 75 : undefined,
      paddingHorizontal: isSquare ? 0 : 25,
      borderRadius: isSquare ? 8 : 37.5,
      iconSize: isSquare ? 36 : 30,
      fontSize: 18,
    },
  };

  const currentSize = sizeStyles[size];
  // Shadow and base button styles are determined by the effective background color.
  const buttonStyles = createPokedexButtonStyles(buttonBackgroundColor, size);
  
  return (
    <View style={[styles.buttonContainer, style, { width: currentSize.width }]}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={({pressed}) => [
          buttonStyles.button, // Base styles from util (includes border, default padding/height based on size)
          { 
            // Override with shape-specific and final background color
            backgroundColor: buttonBackgroundColor, // THIS IS THE KEY CHANGE FOR BACKGROUND
            borderRadius: currentSize.borderRadius, 
            paddingHorizontal: currentSize.paddingHorizontal, 
            width: currentSize.width || 'auto', 
            height: currentSize.height, 
            transform: [{ translateY: pressed ? 3 : 0 }],
          },
          disabled && styles.disabled,
          darkDisabled && styles.darkDisabled,
        ]}
      >
        <View style={[styles.buttonContent, !title && styles.iconOnlyContent]}>
          {icon && !materialCommunityIcon && (
            <Ionicons 
              name={icon} 
              size={currentSize.iconSize} 
              color={iconColor} // Use determined icon color
              style={[styles.icon, !title && { marginRight: 0 }]} 
            />
          )}
          {materialCommunityIcon && (
            <MaterialCommunityIcons
              name={materialCommunityIcon}
              size={currentSize.iconSize}
              color={iconColor} // Use determined icon color
              style={[styles.icon, !title && { marginRight: 0 }]}
            />
          )}
          {title && (
            <Text 
              style={[
                createPokedexTextStyle(iconColor, size, 'bold'), // Use iconColor for text too for consistency
                textStyle
              ]}
            >
              {title}
            </Text>
          )}
        </View>
      </Pressable>
      {/* Removed 3D shadow effect to eliminate circular shadow underneath square buttons
      {!disabled && (
        <View style={[
          buttonStyles.shadow,
        ]} />
      )}
      */}
    </View>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    position: 'relative',
    marginVertical: 8,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: 8,
  },
  disabled: {
    backgroundColor: COLORS.lightGray,
    opacity: 0.7,
  },
  darkDisabled: {
    backgroundColor: COLORS.disabledDark,
    opacity: 0.8,
  },
  iconOnlyContent: {
    justifyContent: 'center',
  },
}); 