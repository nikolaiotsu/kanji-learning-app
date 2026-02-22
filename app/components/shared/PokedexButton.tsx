import React, { useRef, useCallback } from 'react';
import { 
  Text, 
  StyleSheet, 
  ViewStyle, 
  TextStyle,
  Pressable,
  View,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/colors';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { createPokedexTextStyle } from '../../utils/styleUtils';
import * as Haptics from 'expo-haptics';

const LONG_PRESS_BAR_HEIGHT = 3;
const RAINBOW_COLORS = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF', '#FF0000'] as const;

interface PokedexButtonProps {
  onPress: () => void;
  onLongPress?: () => void;
  /** When true and onLongPress exists, shows a tiny hold-icon badge in corner to indicate long-press is available */
  longPressHint?: boolean;
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  materialCommunityIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  materialIcon?: keyof typeof MaterialIcons.glyphMap;
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
  onLongPress,
  longPressHint = false,
  title,
  icon,
  materialCommunityIcon,
  materialIcon,
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

  // Handle long press with heavy haptic feedback
  const handleLongPress = () => {
    if (!disabled && onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      onLongPress();
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
  
  const showLongPressHint = longPressHint && !!onLongPress;

  // Long-press progress animation (fills over delayLongPress ms)
  const longPressProgress = useRef(new Animated.Value(0)).current;
  const longPressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const DELAY_LONG_PRESS = 500;

  const handlePressIn = useCallback(() => {
    if (!onLongPress || disabled) return;
    longPressAnimRef.current?.stop();
    longPressProgress.setValue(0);
    longPressAnimRef.current = Animated.timing(longPressProgress, {
      toValue: 1,
      duration: DELAY_LONG_PRESS,
      useNativeDriver: false,
    });
    longPressAnimRef.current.start(() => {
      longPressAnimRef.current = null;
    });
  }, [onLongPress, disabled, longPressProgress]);

  const handlePressOut = useCallback(() => {
    if (!onLongPress) return;
    longPressAnimRef.current?.stop();
    longPressAnimRef.current = null;
    Animated.timing(longPressProgress, {
      toValue: 0,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [onLongPress, longPressProgress]);

  const barWidth = currentSize.width ?? currentSize.height * 2;
  const fillWidth = longPressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, barWidth],
  });

  return (
    <View style={[styles.buttonContainer, style, { width: currentSize.width }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={onLongPress ? handlePressIn : undefined}
        onPressOut={onLongPress ? handlePressOut : undefined}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={onLongPress ? DELAY_LONG_PRESS : undefined}
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
        
        {/* Long-press progress bar - thin bar at top fills left-to-right (standard hold-to-confirm pattern) */}
        {onLongPress && (
          <View
            style={[
              styles.longPressBarTrack,
              {
                top: 0,
                left: 0,
                right: 0,
                height: LONG_PRESS_BAR_HEIGHT,
                borderTopLeftRadius: currentSize.borderRadius,
                borderTopRightRadius: currentSize.borderRadius,
              },
            ]}
            pointerEvents="none"
          >
            <Animated.View
              style={[
                styles.longPressBarFill,
                {
                  width: fillWidth,
                  height: LONG_PRESS_BAR_HEIGHT,
                  overflow: 'hidden',
                },
              ]}
            >
              <LinearGradient
                colors={[...RAINBOW_COLORS]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[StyleSheet.absoluteFill, { width: barWidth }]}
              />
            </Animated.View>
          </View>
        )}
        {/* Button content */}
        <View style={[styles.buttonContent, !title && styles.iconOnlyContent]}>
          {icon && !materialCommunityIcon && !materialIcon && (
            <Ionicons 
              name={icon} 
              size={currentSize.iconSize} 
              color={iconColor}
              style={[styles.icon, !title && { marginRight: 0 }]} 
            />
          )}
          {materialCommunityIcon && !materialIcon && (
            <MaterialCommunityIcons
              name={materialCommunityIcon}
              size={currentSize.iconSize}
              color={iconColor}
              style={[styles.icon, !title && { marginRight: 0 }]}
            />
          )}
          {materialIcon && (
            <MaterialIcons
              name={materialIcon}
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
      {showLongPressHint && (
        <View
          style={[styles.longPressBadge, { right: 4, bottom: 4 }]}
          pointerEvents="none"
        >
          <Ionicons name="timer-outline" size={10} color="rgba(255,255,255,0.7)" />
        </View>
      )}
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
  longPressBadge: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  longPressBarTrack: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 0,
    justifyContent: 'flex-end',
  },
  longPressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
