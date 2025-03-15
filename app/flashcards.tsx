import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { processWithClaude } from './services/claudeApi';
import { cleanJapaneseText } from './utils/textFormatting';

export default function FlashcardsScreen() {
  const params = useLocalSearchParams();
  const textParam = params.text;
  const displayText = typeof textParam === 'string' 
    ? textParam 
    : Array.isArray(textParam) 
      ? textParam.join('') 
      : '';
  
  // Clean the detected Japanese text
  const cleanedText = cleanJapaneseText(displayText);

  // State for Claude API response
  const [isLoading, setIsLoading] = useState(false);
  const [furiganaText, setFuriganaText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Process text with Claude API if we have Japanese text
    if (cleanedText) {
      processTextWithClaude(cleanedText);
    }
  }, [cleanedText]);

  // Function to process text with Claude API
  const processTextWithClaude = async (text: string) => {
    setIsLoading(true);
    setError('');
    
    try {
      const result = await processWithClaude(text);
      setFuriganaText(result.furiganaText);
      setTranslatedText(result.translatedText);
    } catch (err) {
      console.error('Error processing with Claude:', err);
      setError('Failed to process text with Claude API. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Detected Japanese Text</Text>
        
        <View style={styles.textContainer}>
          <Text style={styles.japaneseText} numberOfLines={0}>{cleanedText}</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Processing with Claude AI...</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <>
                {furiganaText && (
                  <View style={styles.resultContainer}>
                    <Text style={styles.sectionTitle}>With Furigana</Text>
                    <Text style={styles.furiganaText} numberOfLines={0}>{furiganaText}</Text>
                  </View>
                )}
                
                {translatedText && (
                  <View style={styles.resultContainer}>
                    <Text style={styles.sectionTitle}>English Translation</Text>
                    <Text style={styles.translatedText} numberOfLines={0}>{translatedText}</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40, // Add extra padding at the bottom for better scrolling experience
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
    marginBottom: 20,
  },
  japaneseText: {
    fontSize: 24,
    writingDirection: 'ltr',
    textAlign: 'left',
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
    letterSpacing: 0.5,
    lineHeight: 28,
    flexWrap: 'wrap',
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#007AFF',
  },
  errorContainer: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 16,
  },
  resultContainer: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
    width: '100%',
    minHeight: 100,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#0D47A1',
  },
  furiganaText: {
    fontSize: 20,
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
    lineHeight: 28,
    flexWrap: 'wrap',
  },
  translatedText: {
    fontSize: 18,
    lineHeight: 24,
    flexWrap: 'wrap',
  },
});