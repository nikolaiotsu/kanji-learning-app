import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import KanjiScanner from './components/camera/KanjiScanner';
import { COLORS } from './constants/colors';
import PokedexLayout from './components/shared/PokedexLayout';

// 1. Import the logo image
const worddexLogo = require('../assets/images/worddexlogo.png'); // Adjusted path

export default function App() {
  const [triggerLightAnimation, setTriggerLightAnimation] = useState(false);

  // Callback to trigger the light animation
  const handleCardSwipe = useCallback(() => {
    // Just set the trigger to true and let the useEffect handle the reset
    setTriggerLightAnimation(true);
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
    // 2. Pass it to the logoSource prop and add logoStyle
    <PokedexLayout 
      logoSource={worddexLogo}
      logoStyle={{ 
        width: 80, // Increased width from 100
        height: 65, // Increased height from 30
        right: 10,  // Moved further to the right (closer to edge, default was 20)
        top: 0 // top position remains the same as default, can be adjusted if needed
      }}
      triggerLightAnimation={triggerLightAnimation}
    >
      <View style={styles.container}>
        <KanjiScanner onCardSwipe={handleCardSwipe} />
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
