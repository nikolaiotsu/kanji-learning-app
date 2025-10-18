import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import KanjiScanner from './components/camera/KanjiScanner';
import { COLORS } from './constants/colors';
import PokedexLayout from './components/shared/PokedexLayout';
import { useFocusEffect } from 'expo-router';

import { logger } from './utils/logger';
// 1. Import the logo image
const worddexLogo = require('../assets/images/worddexlogo.png'); // Adjusted path

export default function App() {
  const [triggerLightAnimation, setTriggerLightAnimation] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);
  // Counter to restart logo animation when returning from navigation
  const [logoAnimationKey, setLogoAnimationKey] = useState(0);

  // Callback to trigger the light animation
  const handleCardSwipe = useCallback(() => {
    // Just set the trigger to true and let the useEffect handle the reset
    setTriggerLightAnimation(true);
  }, []);

  // Callback to control logo visibility based on content readiness
  const handleContentReady = useCallback((isReady: boolean) => {
    logger.log('🖼️ [AppIndex] handleContentReady called with isReady:', isReady);
    setLogoVisible(isReady);
  }, []);

  // Reset animation trigger after it's been activated
  useEffect(() => {
    if (triggerLightAnimation) {
      const timer = setTimeout(() => {
        setTriggerLightAnimation(false);
      }, 1500); // Allow more time for the animation sequence
      
      return () => clearTimeout(timer);
    }
  }, [triggerLightAnimation]);

  // Increment logo animation key when returning from navigation
  // This restarts just the logo animation without remounting everything
  useFocusEffect(
    useCallback(() => {
      logger.log('🏠 [AppIndex] Home screen focused, logoVisible:', logoVisible);
      
      // On return from navigation, increment key to restart logo animation
      // Only do this if logo should be visible (not on initial mount)
      if (logoVisible) {
        logger.log('🏠 [AppIndex] Restarting logo animation');
        setLogoAnimationKey(prev => prev + 1);
      }
      
      return () => {
        logger.log('🏠 [AppIndex] Home screen unfocused');
      };
    }, [logoVisible])
  );

  return (
    // 2. Pass it to the logoSource prop and add logoStyle - synchronized with content readiness
    // logoAnimationKey increments to restart logo animation when returning from navigation
    <PokedexLayout 
      logoSource={worddexLogo}
      logoVisible={logoVisible}
      logoAnimationKey={logoAnimationKey}
      logoStyle={{ 
        width: 80, // Increased width from 100
        height: 65, // Increased height from 30
        right: 20,  // Restore balanced positioning (same as left padding of topSection)
        top: 0 // top position remains the same as default, can be adjusted if needed
      }}
      triggerLightAnimation={triggerLightAnimation}
    >
      <View
        style={styles.container}
        onLayout={(event) => {
          // const { x, y, width, height } = event.nativeEvent.layout;
          // logger.log(`[AppIndexRootView] onLayout: x:${x}, y:${y}, width:${width}, height:${height}`);
        }}
      >
        <KanjiScanner onCardSwipe={handleCardSwipe} onContentReady={handleContentReady} />
      </View>
    </PokedexLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Remove all shading effects
  },
});
