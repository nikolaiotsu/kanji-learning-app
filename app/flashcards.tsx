import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function FlashcardsScreen() {
  const { text } = useLocalSearchParams();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Detected Japanese Text</Text>
        <Text style={styles.japaneseText}>{text}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  japaneseText: {
    fontSize: 24,
    lineHeight: 36,
    marginBottom: 20,
  },
}); 