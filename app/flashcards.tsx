import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FlashcardsScreen() {
  const params = useLocalSearchParams();
  const textParam = params.text;
  const displayText = typeof textParam === 'string' 
    ? textParam 
    : Array.isArray(textParam) 
      ? textParam.join('') 
      : '';
  
  // Add this line to remove any newline characters
  const cleanedText = displayText.replace(/\n/g, ' ');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Detected Japanese Text</Text>
        
        <View style={styles.textContainer}>
          <Text style={styles.japaneseText}>{cleanedText}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  textContainer: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  japaneseText: {
    fontSize: 24,
    writingDirection: 'ltr',
    textAlign: 'left',
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
    letterSpacing: 0.5,
    lineHeight: 28,
  },
});