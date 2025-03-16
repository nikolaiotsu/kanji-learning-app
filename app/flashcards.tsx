import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { processWithClaude } from './services/claudeApi';
import { cleanJapaneseText } from './utils/textFormatting';
import { saveFlashcard, initializeDecks } from './services/flashcardStorage';
import { Flashcard } from './types/Flashcard';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import DeckSelector from './components/flashcards/DeckSelector';

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
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  
  // State for deck selection
  const [showDeckSelector, setShowDeckSelector] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState('deck1'); // Default to Deck 1

  useEffect(() => {
    // Initialize decks when the component mounts
    initializeDecks();
    
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
      
      // Check if we got valid results back
      if (result.furiganaText && result.translatedText) {
        setFuriganaText(result.furiganaText);
        setTranslatedText(result.translatedText);
      } else {
        // If we didn't get valid results, show the error message from the API
        setError(result.translatedText || 'Failed to process text with Claude API. Please try again later.');
      }
    } catch (err) {
      console.error('Error processing with Claude:', err);
      setError('Failed to process text with Claude API. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Retry processing with Claude API
  const handleRetry = () => {
    if (cleanedText) {
      processTextWithClaude(cleanedText);
    }
  };

  // Function to show deck selector
  const handleShowDeckSelector = () => {
    if (!cleanedText || !furiganaText || !translatedText) {
      Alert.alert('Cannot Save', 'Missing content for the flashcard. Please make sure the text was processed correctly.');
      return;
    }
    
    setShowDeckSelector(true);
  };

  // Function to save flashcard to the selected deck
  const handleSaveFlashcard = async (deckId: string) => {
    setIsSaving(true);

    try {
      // Generate a unique ID for the flashcard
      const id = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        cleanedText + Date.now()
      );

      // Create flashcard object
      const flashcard: Flashcard = {
        id,
        originalText: cleanedText,
        furiganaText,
        translatedText,
        createdAt: Date.now(),
        deckId: deckId, // Set the deck ID from the selected deck
      };

      // Save flashcard
      await saveFlashcard(flashcard, deckId);
      setIsSaved(true);
      
      // Show success message
      Alert.alert(
        'Flashcard Saved',
        `Your flashcard has been saved to ${deckId === 'deck1' ? 'Deck 1' : 'a new deck'}!`,
        [
          { 
            text: 'View Saved Flashcards', 
            onPress: () => router.push('/saved-flashcards') 
          },
          { text: 'OK' }
        ]
      );
    } catch (err) {
      console.error('Error saving flashcard:', err);
      Alert.alert('Save Error', 'Failed to save flashcard. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Function to view saved flashcards
  const handleViewSavedFlashcards = () => {
    router.push('/saved-flashcards');
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
                <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                  <Ionicons name="refresh" size={18} color="#ffffff" style={styles.buttonIcon} />
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.viewButton}
                  onPress={handleViewSavedFlashcards}
                  >
                  <Ionicons name="albums-outline" size={20} color="#ffffff" style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>View Saved Flashcards</Text>
                </TouchableOpacity>
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

                {/* Save Flashcard Button */}
                {furiganaText && translatedText && (
                  <View style={styles.buttonContainer}>
                    <TouchableOpacity 
                      style={[
                        styles.saveButton, 
                        isSaved ? styles.savedButton : null,
                        isSaving ? styles.disabledButton : null
                      ]}
                      onPress={handleShowDeckSelector}
                      disabled={isSaving || isSaved}
                    >
                      {isSaving ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Ionicons 
                            name={isSaved ? "checkmark-circle" : "bookmark-outline"} 
                            size={20} 
                            color="#ffffff" 
                            style={styles.buttonIcon} 
                          />
                          <Text style={styles.buttonText}>
                            {isSaved ? "Saved as Flashcard" : "Save as Flashcard"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Deck Selector Modal */}
                    <DeckSelector
                      visible={showDeckSelector}
                      onClose={() => setShowDeckSelector(false)}
                      onSelectDeck={(deckId) => {
                        setSelectedDeckId(deckId);
                        handleSaveFlashcard(deckId);
                      }}
                    />
                    
                    <TouchableOpacity 
                      style={styles.viewButton}
                      onPress={handleViewSavedFlashcards}
                      >
                      <Ionicons name="albums-outline" size={20} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>View Saved Flashcards</Text>
                    </TouchableOpacity>
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
    marginBottom: 20,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
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
  buttonContainer: {
    marginTop: 24,
    marginBottom: 16,
    width: '100%',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    marginBottom: 12,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonIcon: {
    marginRight: 8,
  },
  savedButton: {
    backgroundColor: '#388E3C',
  },
  disabledButton: {
    backgroundColor: '#A5D6A7',
    opacity: 0.8,
  },
});