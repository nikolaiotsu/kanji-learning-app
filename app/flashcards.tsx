import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView, TouchableOpacity, Alert, TextInput, Modal, Image, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { processWithClaude, validateTextMatchesLanguage } from './services/claudeApi';
import { 
  cleanText, 
  containsJapanese, 
  containsChinese, 
  containsKoreanText, 
  containsRussianText, 
  containsArabicText,
  containsItalianText,
  containsTagalogText,
  containsFrenchText,
  containsSpanishText,
  containsPortugueseText,
  containsGermanText,
  containsKanji 
} from './utils/textFormatting';
import { saveFlashcard, uploadImageToStorage } from './services/supabaseStorage';
import { Flashcard } from './types/Flashcard';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import DeckSelector from './components/flashcards/DeckSelector';
import { useAuth } from './context/AuthContext';
import { useSettings, AVAILABLE_LANGUAGES } from './context/SettingsContext';
import { COLORS } from './constants/colors';
import { FontAwesome6 } from '@expo/vector-icons';
import PokedexLayout from './components/shared/PokedexLayout';

export default function LanguageFlashcardsScreen() {
  const { user } = useAuth();
  const { targetLanguage, forcedDetectionLanguage } = useSettings();
  const params = useLocalSearchParams();
  const textParam = params.text;
  const imageUriParam = params.imageUri;
  
  const displayText = typeof textParam === 'string' 
    ? textParam 
    : Array.isArray(textParam) 
      ? textParam.join('') 
      : '';
  
  const imageUri = typeof imageUriParam === 'string' ? imageUriParam : undefined;
  
  // Clean the detected text, preserving spaces for languages that need them
  const cleanedText = cleanText(displayText);

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
  const [showEditTranslationModal, setShowEditTranslationModal] = useState(false);
  
  // Temporary state to store previous translation results when editing
  const [previousTranslatedText, setPreviousTranslatedText] = useState('');
  const [previousFuriganaText, setPreviousFuriganaText] = useState('');
  const [previousTextProcessed, setPreviousTextProcessed] = useState(false);

  // State for language detection
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [needsRomanization, setNeedsRomanization] = useState(true);
  
  // State for the image display
  const [showImagePreview, setShowImagePreview] = useState(false);

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
      // Check if the text contains Japanese, Chinese, Korean, Russian, Arabic characters
      // These are the languages that need romanization
      const hasJapanese = containsJapanese(text);
      const hasChinese = containsChinese(text);
      const hasKorean = containsKoreanText(text);
      const hasRussian = containsRussianText(text);
      const hasArabic = containsArabicText(text);
      const hasItalian = containsItalianText(text);
      const hasTagalog = containsTagalogText(text);
      const hasFrench = containsFrenchText(text);
      const hasSpanish = containsSpanishText(text);
      const hasPortuguese = containsPortugueseText(text);
      const hasGerman = containsGermanText(text);
      
      // All these languages need some form of romanization/furigana
      const needsRomanization = (
        hasJapanese || 
        hasChinese || 
        hasKorean || 
        hasRussian || 
        hasArabic
      );
      setNeedsRomanization(needsRomanization);
      
      // Determine language label for display purposes only
      let language = 'unknown';
      if (forcedDetectionLanguage !== 'auto') {
        // Use the forced language setting if enabled
        switch (forcedDetectionLanguage) {
          case 'en': language = 'English'; break;
          case 'zh': language = 'Chinese'; break;
          case 'ja': language = 'Japanese'; break;
          case 'ko': language = 'Korean'; break;
          case 'ru': language = 'Russian'; break;
          case 'ar': language = 'Arabic'; break;
          case 'it': language = 'Italian'; break;
          case 'es': language = 'Spanish'; break;
          case 'fr': language = 'French'; break;
          case 'tl': language = 'Tagalog'; break;
          case 'pt': language = 'Portuguese'; break;
          case 'de': language = 'German'; break;
          default: language = 'unknown';
        }
        console.log(`Using forced language detection: ${language}`);
        
        // Validate that text matches the forced language
        const isValidLanguage = validateTextMatchesLanguage(text, forcedDetectionLanguage);
        if (!isValidLanguage) {
          // Show error notification if text doesn't match forced language
          setIsLoading(false);
          setError(`Forced language not detected: The text doesn't appear to be in ${language}. When forced language mode is active, please only enter text in the selected language. You can change your language preferences in Settings.`);
          return;
        }
      } else if (hasJapanese && !hasChinese && !hasKorean) {
        language = 'Japanese';
      } else if (hasChinese) {
        language = 'Chinese';
      } else if (hasKorean) {
        language = 'Korean';
      } else if (hasRussian) {
        language = 'Russian';
      } else if (hasArabic) {
        language = 'Arabic';
      } else if (hasItalian) {
        language = 'Italian';
      } else if (hasTagalog) {
        language = 'Tagalog';
      } else if (hasFrench) {
        language = 'French';
      } else if (hasSpanish) {
        language = 'Spanish';
      } else if (hasPortuguese) {
        language = 'Portuguese';
      } else if (hasGerman) {
        language = 'German';
      }
      
      setDetectedLanguage(language);
      
      const result = await processWithClaude(text, targetLanguage, forcedDetectionLanguage);
      
      // Check if we got valid results back
      if (result.translatedText) {
        // Set translated text for all languages
        setTranslatedText(result.translatedText);
        
        // Set romanization text if provided for languages that need it
        if (needsRomanization) {
          setFuriganaText(result.furiganaText);
          // Show error if romanization is missing for languages that should have it
          if (!result.furiganaText) {
            // For Japanese text, provide more specific error message if kanji is present
            if (hasJapanese && containsKanji(text)) {
              setError('Failed to generate furigana for kanji characters. This may affect readability. The translation is still available.');
            } else {
              setError('Failed to get proper romanization for this text. The translation is still available.');
            }
          }
        }
        
        // Mark as processed if we have what we need
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
    if (error.includes("Forced language not detected")) {
      // If the error is about forced language detection, navigate home
      router.push('/');
    } else if (editedText) {
      // For other errors, try processing the text again
      processTextWithClaude(editedText);
    }
  };

  // Function to show deck selector
  const handleShowDeckSelector = () => {
    // For texts that don't need furigana, we only need the translation to be present
    if (!needsRomanization && !translatedText) {
      Alert.alert('Cannot Save', 'Missing translation for the flashcard. Please make sure the text was processed correctly.');
      return;
    }
    
    // For texts that need furigana (Japanese), we need both furigana and translation
    if (needsRomanization && (!editedText || !furiganaText || !translatedText)) {
      Alert.alert('Cannot Save', 'Missing content for the flashcard. Please make sure the text was processed correctly.');
      return;
    }
    
    setShowDeckSelector(true);
  };

  // Function to save flashcard to the selected deck
  const handleSaveFlashcard = async (deckId: string) => {
    setIsSaving(true);

    try {
      // Upload image to storage if available
      let storedImageUrl: string | undefined = undefined;
      if (imageUri) {
        const uploadedUrl = await uploadImageToStorage(imageUri);
        if (uploadedUrl) {
          storedImageUrl = uploadedUrl;
        }
      }

      // Create flashcard object
      const flashcard: Omit<Flashcard, 'id'> = {
        originalText: editedText,
        furiganaText: needsRomanization ? furiganaText : "", // Store romanization in furiganaText field
        translatedText,
        createdAt: Date.now(),
        deckId: deckId,
        imageUrl: storedImageUrl, // Include the image URL if available
      };

      // Save flashcard
      await saveFlashcard(flashcard as Flashcard, deckId);
      setIsSaved(true);
      
      // Show success message with language-specific wording
      const cardType = detectedLanguage ? `${detectedLanguage} flashcard` : 'language flashcard';
      Alert.alert(
        'Flashcard Saved',
        `Your ${cardType} has been saved to ${deckId === 'deck1' ? 'Deck 1' : 'a new deck'}!`,
        [
          { 
            text: 'View Saved Flashcards', 
            onPress: () => {
              if (router.canDismiss()) {
                router.dismissAll();
              }
              router.replace('/saved-flashcards');
            }
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
    // Clear navigation stack completely, then navigate to saved flashcards
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/saved-flashcards');
  };

  // Function to handle edit text button
  const handleEditText = () => {
    setShowEditModal(true);
  };

  // Function to handle translate button
  const handleTranslate = () => {
    if (!editedText) {
      Alert.alert('Error', 'Please enter text to translate.');
      return;
    }
    processTextWithClaude(editedText);
  };

  // Function to handle retry with validation for forced language settings
  const handleRetryWithValidation = () => {
    if (!editedText) {
      Alert.alert('Error', 'Please enter text to translate.');
      return;
    }

    // Check if text matches the forced language before proceeding
    if (forcedDetectionLanguage !== 'auto') {
      const isValidLanguage = validateTextMatchesLanguage(editedText, forcedDetectionLanguage);
      
      if (!isValidLanguage) {
        // Map language code to name for display
        let languageName;
        switch (forcedDetectionLanguage) {
          case 'en': languageName = 'English'; break;
          case 'zh': languageName = 'Chinese'; break;
          case 'ja': languageName = 'Japanese'; break;
          case 'ko': languageName = 'Korean'; break;
          case 'ru': languageName = 'Russian'; break;
          case 'ar': languageName = 'Arabic'; break;
          case 'it': languageName = 'Italian'; break;
          case 'es': languageName = 'Spanish'; break;
          case 'fr': languageName = 'French'; break;
          case 'tl': languageName = 'Tagalog'; break;
          case 'pt': languageName = 'Portuguese'; break;
          case 'de': languageName = 'German'; break;
          default: languageName = forcedDetectionLanguage;
        }
        
        // Show popup when text still doesn't match the forced language
        Alert.alert(
          'Language Mismatch',
          `The text still doesn't appear to be in ${languageName}. Please try with a different text or change your forced language settings.`,
          [
            { text: 'OK' }
          ]
        );
        return;
      }
    }
    
    // If validation passes or auto-detect is enabled, proceed with translation
    processTextWithClaude(editedText);
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
    
    // Clear the temporary state since user is committing to the new text
    setPreviousTranslatedText('');
    setPreviousFuriganaText('');
    setPreviousTextProcessed(false);
  };

  // Function to handle editing input and retranslating
  const handleEditInputAndRetranslate = () => {
    // Store current translation state before clearing it
    setPreviousTranslatedText(translatedText);
    setPreviousFuriganaText(furiganaText);
    setPreviousTextProcessed(textProcessed);
    
    // Reset the translation state and show the edit modal
    setTextProcessed(false);
    setFuriganaText('');
    setTranslatedText('');
    setError('');
    setShowEditModal(true);
  };

  // Function to handle canceling edit modal
  const handleCancelEdit = () => {
    setShowEditModal(false);
    // Restore previous translation results if they existed
    if (previousTextProcessed) {
      setTranslatedText(previousTranslatedText);
      setFuriganaText(previousFuriganaText);
      setTextProcessed(previousTextProcessed);
      
      // Clear the temporary state
      setPreviousTranslatedText('');
      setPreviousFuriganaText('');
      setPreviousTextProcessed(false);
    }
  };

  // Function to handle going back to home
  const handleGoHome = () => {
    // Clear navigation stack completely, then navigate to home
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/');
  };

  // Function to toggle image preview
  const toggleImagePreview = () => {
    setShowImagePreview(!showImagePreview);
  };

  // Get translated language name for display
  const translatedLanguageName = AVAILABLE_LANGUAGES[targetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'English';

  return (
    <PokedexLayout variant="flashcards">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Flashcard Input</Text>
          <TouchableOpacity 
            style={styles.homeButton}
            onPress={handleGoHome}
          >
            <Ionicons name="home-outline" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.textContainer}>
            <Text style={styles.originalText} numberOfLines={0}>{editedText}</Text>
            
            {/* Show image thumbnail and preview button if image is available */}
            {imageUri && (
              <View style={styles.imagePreviewContainer}>
                <TouchableOpacity 
                  style={styles.previewButton}
                  onPress={toggleImagePreview}
                >
                  <FontAwesome6 
                    name="image" 
                    size={24} 
                    color="#ffffff" 
                  />
                </TouchableOpacity>
              
                {showImagePreview && (
                  <View style={styles.imagePreviewWrap}>
                    <Image 
                      source={{ uri: imageUri }} 
                      style={styles.previewImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
              </View>
            )}
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
              <Text style={styles.loadingText}>Processing...</Text>
            </View>
          ) : (
            <>
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                    <Ionicons name={error.includes("Forced language not detected") ? "arrow-back" : "refresh"} size={18} color="#ffffff" style={styles.buttonIcon} />
                    <Text style={styles.retryButtonText}>
                      {error.includes("Forced language not detected") ? "Go Back" : "Try Again"}
                    </Text>
                  </TouchableOpacity>
                  
                  {error.includes("Forced language not detected") && (
                    <TouchableOpacity 
                      style={styles.settingsButton}
                      onPress={() => router.push('/settings')}
                    >
                      <Ionicons name="settings-outline" size={20} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>Go to Settings</Text>
                    </TouchableOpacity>
                  )}
                  
                  {error.includes("Forced language not detected") && (
                    <TouchableOpacity 
                      style={styles.translateAgainButton}
                      onPress={handleRetryWithValidation}
                    >
                      <Ionicons name="language" size={20} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>Try Again</Text>
                    </TouchableOpacity>
                  )}
                  
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
                  {furiganaText && needsRomanization && (
                    <View style={styles.resultContainer}>
                      <Text style={styles.sectionTitle}>
                        {detectedLanguage === 'Japanese' ? 'With Furigana' :
                         detectedLanguage === 'Chinese' ? 'With Pinyin' :
                         detectedLanguage === 'Korean' ? 'With Revised Romanization' :
                         detectedLanguage === 'Russian' ? 'With Practical Romanization' :
                         detectedLanguage === 'Arabic' ? 'With Arabic Chat Alphabet' :
                         detectedLanguage === 'Italian' ? 'Original Text' :
                         detectedLanguage === 'Tagalog' ? 'Original Text' :
                         'With Pronunciation Guide'}
                      </Text>
                      <Text style={styles.furiganaText} numberOfLines={0}>{furiganaText}</Text>
                    </View>
                  )}
                  
                  {translatedText && (
                    <View style={styles.resultContainer}>
                      <Text style={styles.sectionTitle}>{translatedLanguageName} Translation</Text>
                      <Text style={styles.translatedText} numberOfLines={0}>{translatedText}</Text>
                    </View>
                  )}

                  {/* Save Flashcard Button */}
                  {textProcessed && translatedText && (
                    <View style={styles.buttonContainer}>
                      {/* Edit buttons for post-translation editing */}
                      <View style={styles.editButtonsContainer}>
                        <TouchableOpacity 
                          style={styles.editTranslationButton} 
                          onPress={() => setShowEditTranslationModal(true)}
                        >
                          <Ionicons name="pencil" size={18} color="#ffffff" style={styles.buttonIcon} />
                          <Text style={styles.editButtonText}>Edit Translation</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          style={styles.editInputButton} 
                          onPress={handleEditInputAndRetranslate}
                        >
                          <Ionicons name="refresh" size={18} color="#ffffff" style={styles.buttonIcon} />
                          <Text style={styles.editButtonText}>Edit Input & Retranslate</Text>
                        </TouchableOpacity>
                      </View>

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
          onRequestClose={handleCancelEdit}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.modalContainer}
              keyboardVerticalOffset={Platform.OS === "ios" ? -20 : 20}
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Edit Text</Text>
                <ScrollView style={styles.modalScrollContent}>
                  <TextInput
                    style={styles.textInput}
                    value={editedText}
                    onChangeText={setEditedText}
                    multiline
                    placeholder="Edit text here..."
                    placeholderTextColor="#aaa"
                    textAlignVertical="top"
                  />
                </ScrollView>
                <View style={styles.modalButtonsContainer}>
                  <TouchableOpacity 
                    style={styles.modalCancelButton} 
                    onPress={handleCancelEdit}
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
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Edit Translation Modal */}
        <Modal
          visible={showEditTranslationModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowEditTranslationModal(false)}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.modalContainer}
              keyboardVerticalOffset={Platform.OS === "ios" ? -20 : 20}
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalSubtitle}>Edit Translation</Text>
                <ScrollView style={styles.modalScrollContent}>
                  <TextInput
                    style={styles.textInput}
                    value={translatedText}
                    onChangeText={setTranslatedText}
                    multiline
                    placeholder="Edit translation here..."
                    placeholderTextColor="#aaa"
                    textAlignVertical="top"
                  />
                  {needsRomanization && (
                    <>
                      <Text style={styles.modalSubtitle}>
                        {detectedLanguage === 'Japanese' ? 'Edit Furigana' :
                         detectedLanguage === 'Chinese' ? 'Edit Pinyin' :
                         detectedLanguage === 'Korean' ? 'Edit Romanization' :
                         detectedLanguage === 'Russian' ? 'Edit Romanization' :
                         detectedLanguage === 'Arabic' ? 'Edit Transliteration' :
                         'Edit Romanization'}
                      </Text>
                      <TextInput
                        style={styles.textInput}
                        value={furiganaText}
                        onChangeText={setFuriganaText}
                        multiline
                        placeholder="Edit romanization here..."
                        placeholderTextColor="#aaa"
                        textAlignVertical="top"
                      />
                    </>
                  )}
                </ScrollView>
                <View style={styles.modalButtonsContainer}>
                  <TouchableOpacity 
                    style={styles.modalCancelButton} 
                    onPress={() => setShowEditTranslationModal(false)}
                  >
                    <Text style={styles.modalButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.modalSaveButton} 
                    onPress={() => setShowEditTranslationModal(false)}
                  >
                    <Text style={styles.modalButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </Modal>
      </SafeAreaView>
    </PokedexLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Removed backgroundColor: COLORS.screenBackground to allow PokedexLayout to control it
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.darkGray,
    backgroundColor: COLORS.pokedexBlack,
  },
  homeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: COLORS.darkSurface,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 8, // Reduced padding at top since we have the header
    paddingBottom: 60, // Add extra padding at the bottom for better scrolling experience
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  textContainer: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: COLORS.darkSurface,
    marginBottom: 20,
  },
  originalText: {
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
    justifyContent: 'space-around',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  editButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mediumSurface,
    borderRadius: 8,
    width: 90,
    height: 90,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  translateButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mediumSurface,
    borderRadius: 8,
    width: 90,
    height: 90,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: COLORS.darkGray,
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
    borderColor: COLORS.royalBlue,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: COLORS.darkGray,
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
    alignItems: 'center',
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mediumSurface,
    borderRadius: 8,
    paddingVertical: 20,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    marginBottom: 12,
    width: '90%',
  },
  viewButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mediumSurface,
    borderRadius: 8,
    paddingVertical: 20,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    width: '90%',
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  buttonIcon: {
    marginBottom: 4,
  },
  savedButton: {
    backgroundColor: COLORS.secondary,
  },
  disabledButton: {
    backgroundColor: COLORS.darkSurface,
    opacity: 0.8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
    paddingBottom: 0,
  },
  modalContent: {
    backgroundColor: COLORS.darkSurface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 20,
    paddingBottom: 30,
    marginBottom: 10,
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalScrollContent: {
    maxHeight: '70%',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'left',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 16,
    color: COLORS.darkGray,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    minHeight: 120,
    maxHeight: 200,
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
    color: 'white',
    backgroundColor: COLORS.mediumSurface,
    marginBottom: 16,
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalCancelButton: {
    backgroundColor: COLORS.mediumSurface,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  modalSaveButton: {
    backgroundColor: COLORS.mediumSurface,
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
  imagePreviewContainer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.darkGray,
    backgroundColor: COLORS.darkSurface,
  },
  imagePreviewWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD166',
    padding: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  previewImage: {
    width: '100%',
    height: 500,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  translateAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2CB67D',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  editButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  editTranslationButton: {
    backgroundColor: '#2CB67D',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  editInputButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  editButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
  },
});