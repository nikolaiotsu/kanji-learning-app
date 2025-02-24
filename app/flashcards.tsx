import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function FlashcardsScreen() {
  const { text } = useLocalSearchParams();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text>Detected Text: {text}</Text>
      {/* Add your flashcard creation UI here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  japaneseText: {
    fontSize: 24,
    marginBottom: 20,
  },
}); 