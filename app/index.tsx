import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import KanjiScanner from './components/camera/KanjiScanner';
import { COLORS } from './constants/colors';
import PokedexLayout from './components/shared/PokedexLayout';

import { logger } from './utils/logger';
// 1. Import the logo image
const worddexLogo = require('../assets/images/worddexlogo.png'); // Adjusted path

export default function App() {
  const [triggerLightAnimation, setTriggerLightAnimation] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);
  // Remove logoLoaded state - local assets don't need preloading

  // Callback to trigger the light animation
  const handleCardSwipe = useCallback(() => {
    // Just set the trigger to true and let the useEffect handle the reset
    setTriggerLightAnimation(true);
  }, []);

  // Callback to control logo visibility based on content readiness
  const handleContentReady = useCallback((isReady: boolean) => {
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

  return (
    // 2. Pass it to the logoSource prop and add logoStyle - synchronized with content readiness
    <PokedexLayout 
      logoSource={worddexLogo}
      logoVisible={logoVisible}
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
