import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { Asset } from 'expo-asset';
import { BADGE_IMAGES } from '../../constants/badgeAssets';
import type { Badge } from '../../services/badgeService';

const FLOAT_DURATION = 1200;
const FLOAT_DISTANCE = 8;

interface FloatingBadgeImageProps {
  badge: Badge;
  size?: 'small' | 'large';
  withBackground?: boolean;
}

const SIZE_MAP = {
  small: { image: 80, padding: 16, borderRadius: 14 },
  large: { image: 120, padding: 20, borderRadius: 16 },
};

/**
 * Normalize badge image path for lookup. Handles camelCase (imagePath) and
 * snake_case (image_path) from API/AsyncStorage, plus case/whitespace variations.
 */
function getBadgeImageSource(badge: Badge): number | null {
  const rawPath =
    (badge as Badge & { image_path?: string }).imagePath ??
    (badge as Badge & { image_path?: string }).image_path ??
    'fc1.png';
  const normalizedPath = String(rawPath).trim().toLowerCase();
  const source =
    BADGE_IMAGES[normalizedPath] ??
    BADGE_IMAGES[badge.imagePath] ??
    BADGE_IMAGES['fc1.png'];
  return source ?? null;
}

export default function FloatingBadgeImage({
  badge,
  size = 'large',
  withBackground = true,
}: FloatingBadgeImageProps) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const badgeImageSource = getBadgeImageSource(badge);
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Preload badge asset so it renders reliably in modals (fixes loading issues)
  useEffect(() => {
    if (!badgeImageSource) return;
    let isMounted = true;
    (async () => {
      try {
        const asset = Asset.fromModule(badgeImageSource);
        await asset.downloadAsync();
        if (isMounted && (asset.localUri || asset.uri)) {
          setImageUri(asset.localUri ?? asset.uri ?? null);
        } else if (isMounted) {
          setImageUri(null); // Fall back to require source
        }
      } catch {
        if (isMounted) setImageUri(null);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [badgeImageSource]);

  useEffect(() => {
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: FLOAT_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: FLOAT_DURATION,
          useNativeDriver: true,
        }),
      ])
    );
    float.start();
    return () => float.stop();
  }, [floatAnim]);

  const scale = size === 'small' ? 0.5 : 1;
  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -FLOAT_DISTANCE * scale],
  });

  const { image: imageSize, padding, borderRadius } = SIZE_MAP[size];

  // Use preloaded URI when available, otherwise fall back to require result
  const imageSource =
    imageUri != null
      ? { uri: imageUri }
      : badgeImageSource != null
        ? badgeImageSource
        : null;

  if (!imageSource) return null;

  const content = (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY }] }]}>
      <Image
        source={imageSource}
        style={[styles.image, { width: imageSize, height: imageSize }]}
        resizeMode="contain"
      />
    </Animated.View>
  );

  if (withBackground) {
    return (
      <View style={[styles.background, { padding }]}>
        {content}
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    // width/height set inline
  },
});
