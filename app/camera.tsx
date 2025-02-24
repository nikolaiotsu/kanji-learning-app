import React from 'react';
import { View } from 'react-native';
import KanjiScanner from './components/KanjiScanner';

export default function CameraScreen() {
  return (
    <View style={{ flex: 1 }}>
      <KanjiScanner />
    </View>
  );
} 