import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { processWithClaude } from './services/claudeApi';
import { cleanJapaneseText } from './utils/textFormatting';
import { saveFlashcard } from './services/supabaseStorage';
import { Flashcard } from './types/Flashcard';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import DeckSelector from './components/flashcards/DeckSelector';
import { useAuth } from './context/AuthContext';
import { COLORS } from './constants/colors';

export default function FlashcardsScreen() {
  const { user } = useAuth();
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

  // State for text editing
  const [editedText, setEditedText] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [textProcessed, setTextProcessed] = useState(false);

  useEffect(() => {
    // Initialize the edited text with the cleaned text
    setEditedText(cleanedText);
  }, [cleanedText]);

  // Function to process text with Claude API
  const processTextWithClaude = async (text: string) => {
    setIsLoading(true);
    setError('');
    setTextProcessed(false);
    
    try {
      const result = await processWithClaude(text);
      
      // Check if we got valid results back
      if (result.furiganaText && result.translatedText) {
        setFuriganaText(result.furiganaText);
        setTranslatedText(result.translatedText);
        setTextProcessed(true);
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
    if (editedText) {
      processTextWithClaude(editedText);
    }
  };

  // Function to show deck selector
  const handleShowDeckSelector = () => {
    if (!editedText || !furiganaText || !translatedText) {
      Alert.alert('Cannot Save', 'Missing content for the flashcard. Please make sure the text was processed correctly.');
      return;
    }
    
    setShowDeckSelector(true);
  };

  // Function to save flashcard to the selected deck
  const handleSaveFlashcard = async (deckId: string) => {
    setIsSaving(true);

    try {
      // Remove client-side ID generation
      // const id = await Crypto.digestStringAsync(
      //   Crypto.CryptoDigestAlgorithm.SHA256,
      //   editedText + Date.now()
      // );

      // Create flashcard object without the 'id' property
      // The database will generate the UUID automatically
      const flashcard: Omit<Flashcard, 'id'> = { // Use Omit to exclude 'id' temporarily
        originalText: editedText,
        furiganaText,
        translatedText,
        createdAt: Date.now(), // Keep createdAt for potential local sorting/display
        deckId: deckId,
      };

      // Save flashcard - saveFlashcard function now expects an object potentially without an id
      // We might need to adjust the saveFlashcard function signature or logic if it strictly expects 'id'
      // However, based on the previous fix in supabaseStorage.ts, it should handle this correctly.
      await saveFlashcard(flashcard as Flashcard, deckId); // Type assertion might be needed depending on saveFlashcard signature
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
    // Use router.push to maintain navigation history
    router.push('/saved-flashcards');
  };

  // Function to handle edit text button
  const handleEditText = () => {
    setShowEditModal(true);
  };

  // Function to handle translate button
  const handleTranslate = () => {
    if (editedText) {
      processTextWithClaude(editedText);
    }
  };

  // Function to save edited text
  const handleSaveEdit = () => {
    setShowEditModal(false);
    // Reset any previous results since the text has changed
    if (textProcessed) {
      setFuriganaText('');
      setTranslatedText('');
      setTextProcessed(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Detected Japanese Text</Text>
        
        <View style={styles.textContainer}>
          <Text style={styles.japaneseText} numberOfLines={0}>{editedText}</Text>
        </View>

        {/* Edit and Translate buttons */}
        {!isLoading && !textProcessed && (
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity 
              style={styles.editButton} 
              onPress={handleEditText}
            >
              <Ionicons name="pencil" size={20} color="#ffffff" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Edit Text</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.translateButton} 
              onPress={handleTranslate}
            >
              <Ionicons name="language" size={20} color="#ffffff" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Translate</Text>
            </TouchableOpacity>
          </View>
        )}

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

      {/* Edit Text Modal */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Japanese Text</Text>
            <TextInput
              style={styles.textInput}
              value={editedText}
              onChangeText={setEditedText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => {
                  setEditedText(cleanedText); // Reset to original text
                  setShowEditModal(false);
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSaveButton} 
                onPress={handleSaveEdit}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    color: COLORS.text,
  },
  textContainer: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: COLORS.darkSurface,
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
    color: COLORS.text,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    marginRight: 10,
  },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.pastelPurple,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    marginLeft: 10,
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: COLORS.pastelPurple,
  },
  errorContainer: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: COLORS.darkSurface,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  retryButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  resultContainer: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: COLORS.darkSurface,
    width: '100%',
    minHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.pastelBlue,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: COLORS.pastelBlue,
  },
  furiganaText: {
    fontSize: 20,
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
    lineHeight: 28,
    flexWrap: 'wrap',
    color: COLORS.text,
  },
  translatedText: {
    fontSize: 18,
    lineHeight: 24,
    flexWrap: 'wrap',
    color: COLORS.text,
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
    backgroundColor: COLORS.secondary,
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
    backgroundColor: COLORS.primary,
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
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonIcon: {
    marginRight: 8,
  },
  savedButton: {
    backgroundColor: COLORS.pastelGreen,
  },
  disabledButton: {
    backgroundColor: COLORS.darkSurface,
    opacity: 0.8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    minHeight: 120,
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalCancelButton: {
    backgroundColor: '#F44336',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  modalSaveButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});