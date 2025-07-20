import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView, TouchableOpacity, Alert, TextInput, Modal, Image, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { processWithClaude, validateTextMatchesLanguage } from './services/claudeApi';
import { 
  cleanText, 
  containsJapanese, 
  containsChinese, 
  containsKoreanText, 
  containsRussianText, 
  containsArabicText,
  containsHindiText,
  containsEsperantoText,
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
import * as FileSystem from 'expo-file-system';
import DeckSelector from './components/flashcards/DeckSelector';
import { useAuth } from './context/AuthContext';
import { useSettings, AVAILABLE_LANGUAGES } from './context/SettingsContext';
import { COLORS } from './constants/colors';
import { FontAwesome6 } from '@expo/vector-icons';
import PokedexLayout from './components/shared/PokedexLayout';
import FuriganaText from './components/shared/FuriganaText';
import { useFlashcardCounter } from './context/FlashcardCounterContext';
import { useSubscription } from './context/SubscriptionContext';
import { PRODUCT_IDS } from './constants/config';
import MemoryManager from './services/memoryManager';
import * as Haptics from 'expo-haptics';

export default function LanguageFlashcardsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { targetLanguage, forcedDetectionLanguage } = useSettings();
  const { incrementFlashcardCount, canCreateFlashcard, remainingFlashcards } = useFlashcardCounter();
  const { purchaseSubscription } = useSubscription();
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
  
  // Flag to prevent main useEffect from running during manual operations
  const [isManualOperation, setIsManualOperation] = useState(false);
  
  // Debug: Log state changes
  useEffect(() => {
    console.log('🔍 [DEBUG] showEditModal changed to:', showEditModal);
  }, [showEditModal]);
  
  useEffect(() => {
    console.log('🔍 [DEBUG] showEditTranslationModal changed to:', showEditTranslationModal);
  }, [showEditTranslationModal]);
  


  useEffect(() => {
    // Initialize the edited text with the cleaned text
    setEditedText(cleanedText);
  }, [cleanedText, imageUri]);

  // Main useEffect to process the initial text when component loads
  // Only auto-process if text didn't come from OCR (no imageUri)
  useEffect(() => {
    if (cleanedText && !textProcessed && !isLoading && !isManualOperation && !imageUri) {
      processTextWithClaude(cleanedText);
    }
  }, [cleanedText, textProcessed, isLoading, isManualOperation, imageUri]);

  // Function to process text with Claude API
  const processTextWithClaude = async (text: string) => {
    setIsLoading(true);
    setError('');
    setTextProcessed(false);
    
          try {
        // Check if the text contains Japanese, Chinese, Korean, Russian, Arabic, Hindi, Esperanto characters
        // These are the languages that need romanization
        const hasJapanese = containsJapanese(text);
        const hasChinese = containsChinese(text);
        const hasKorean = containsKoreanText(text);
        const hasRussian = containsRussianText(text);
        const hasArabic = containsArabicText(text);
        const hasHindi = containsHindiText(text);
        const hasEsperanto = containsEsperantoText(text);
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
        hasArabic ||
        hasHindi
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
            case 'hi': language = 'Hindi'; break;
            case 'eo': language = 'Esperanto'; break;
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
          setError(t('flashcard.forcedLanguage.errorMessage', { language }));
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
        } else if (hasHindi) {
          language = 'Hindi';
        } else if (hasEsperanto) {
          language = 'Esperanto';
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
      setIsManualOperation(false); // Reset manual operation flag when process completes
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
    // Check flashcard limit first
    if (!canCreateFlashcard) {
      Alert.alert(
        t('subscription.limit.title'),
        t('subscription.limit.message'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { 
            text: t('subscription.limit.upgradeToPremium'), 
            style: 'default',
            onPress: async () => {
                             const success = await purchaseSubscription(PRODUCT_IDS.PREMIUM_MONTHLY);
              if (success) {
                Alert.alert(t('common.success'), t('subscription.test.premiumActivated'));
              }
            }
          }
        ]
      );
      return;
    }
    
    // For texts that don't need furigana, we only need the translation to be present
    if (!needsRomanization && !translatedText) {
      Alert.alert('Cannot Save', t('flashcard.save.cannotSaveTranslation'));
      return;
    }
    
    // For texts that need furigana (Japanese), we need both furigana and translation
    if (needsRomanization && (!editedText || !furiganaText || !translatedText)) {
      Alert.alert('Cannot Save', t('flashcard.save.cannotSaveContent'));
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
        targetLanguage, // Store the current target language with the flashcard
        createdAt: Date.now(),
        deckId: deckId,
        imageUrl: storedImageUrl, // Include the image URL if available
      };

      // Save flashcard
      await saveFlashcard(flashcard as Flashcard, deckId);
      
      // Increment flashcard counter after successful save
      await incrementFlashcardCount();
      
      // Do NOT delete the local image file after upload
      // This ensures the image is still available for navigation in the KanjiScanner
      // The MemoryManager will handle cleanup when appropriate
      try {
        if (imageUri && storedImageUrl) {
          // Get the original image URI from the params if available
          // This helps preserve the original image for navigation history
          const memoryManager = MemoryManager.getInstance();
          
          // Preserve both the current image and the original image if they're different
          // This ensures we can navigate back to the original uncropped image
          console.log('[FlashcardSave] Keeping local image file for navigation:', imageUri);
        }
        console.log('[FlashcardSave] Flashcard save completed');
      } catch (error) {
        console.warn('[FlashcardSave] Error during flashcard save cleanup:', error);
      }
      
      setIsSaved(true);
      
      // Show success message with language-specific wording
      const cardType = detectedLanguage 
        ? t('flashcard.save.cardType', { language: detectedLanguage }) 
        : t('flashcard.save.languageFlashcard');
      const deckName = deckId === 'deck1' ? t('flashcard.save.deck1') : t('flashcard.save.newDeck');
      
      Alert.alert(
        t('flashcard.save.title'),
        t('flashcard.save.message', { cardType, deckName }),
        [
          { 
            text: t('flashcard.save.viewSaved'), 
            onPress: () => {
              router.push('/saved-flashcards');
            }
          },
          { text: t('common.ok') }
        ]
      );
    } catch (err) {
      console.error('Error saving flashcard:', err);
      Alert.alert(t('flashcard.save.saveError'), t('flashcard.save.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  // Function to view saved flashcards
  const handleViewSavedFlashcards = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Push to saved flashcards to maintain navigation stack for back button
    router.push('/saved-flashcards');
  };

  // Function to handle edit text button
  const handleEditText = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEditModal(true);
  };

  // Function to handle translate button
  const handleTranslate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!editedText) {
      Alert.alert(t('common.error'), t('flashcard.edit.enterText'));
      return;
    }
    processTextWithClaude(editedText);
  };

  // Function to handle retry with validation for forced language settings
  const handleRetryWithValidation = () => {
    if (!editedText) {
      Alert.alert(t('common.error'), t('flashcard.edit.enterText'));
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
            case 'hi': languageName = 'Hindi'; break;
            case 'eo': languageName = 'Esperanto'; break;
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
          t('flashcard.translate.languageMismatch'),
          t('flashcard.translate.languageMismatchMessage', { language: languageName }),
          [
            { text: t('common.ok') }
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEditModal(false);
    setIsManualOperation(false); // Reset manual operation flag
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
    console.log('🔍 [DEBUG] Edit Input & Retranslate button pressed!');
    
    // Set manual operation flag to prevent main useEffect interference
    setIsManualOperation(true);
    
    // Store current translation state before clearing it
    setPreviousTranslatedText(translatedText);
    setPreviousFuriganaText(furiganaText);
    setPreviousTextProcessed(textProcessed);
    
    // Reset the translation state
    setTextProcessed(false);
    setFuriganaText('');
    setTranslatedText('');
    setError('');
    
    // Show the modal
    setShowEditModal(true);
    
    // Process the text after a short delay to ensure states are set
    setTimeout(() => {
      processTextWithClaude(editedText);
    }, 50);
  };

  // Function to cancel editing
  const handleCancelEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEditModal(false);
    setIsManualOperation(false); // Reset manual operation flag
    
    // Restore the previous state if available
    if (previousTextProcessed) {
      setFuriganaText(previousFuriganaText);
      setTranslatedText(previousTranslatedText);
      setTextProcessed(previousTextProcessed);
    }
    
    // Clear the temporary state
    setPreviousTranslatedText('');
    setPreviousFuriganaText('');
    setPreviousTextProcessed(false);
  };

  // Function to handle going back to home
  const handleGoHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Clear navigation stack completely, then navigate to home
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/');
  };

  // Function to toggle image preview
  const toggleImagePreview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowImagePreview(!showImagePreview);
  };

  // Get translated language name for display
  const translatedLanguageName = AVAILABLE_LANGUAGES[targetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'English';

  // Function to handle editing translation
  const handleEditTranslation = () => {
    console.log('🔍 [DEBUG] Edit Translation button pressed!');
    
    // Set manual operation flag to prevent main useEffect interference
    setIsManualOperation(true);
    
    // Show the translation edit modal
    setShowEditTranslationModal(true);
  };

  return (
    <PokedexLayout variant="flashcards">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('flashcard.input.title')}</Text>
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
                      {error.includes("Forced language not detected") ? t('flashcard.forcedLanguage.goBack') : t('flashcard.forcedLanguage.tryAgain')}
                    </Text>
                  </TouchableOpacity>
                  
                  {error.includes("Forced language not detected") && (
                    <TouchableOpacity 
                      style={styles.settingsButton}
                      onPress={() => router.push('/settings')}
                    >
                      <Ionicons name="settings-outline" size={20} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>{t('flashcard.forcedLanguage.goToSettings')}</Text>
                    </TouchableOpacity>
                  )}
                  
                  {error.includes("Forced language not detected") && (
                    <TouchableOpacity 
                      style={styles.translateAgainButton}
                      onPress={handleRetryWithValidation}
                    >
                      <Ionicons name="language" size={20} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>{t('flashcard.forcedLanguage.tryAgain')}</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity 
                    style={styles.viewButton}
                    onPress={handleViewSavedFlashcards}
                    >
                    <Ionicons name="albums-outline" size={20} color="#ffffff" style={styles.buttonIcon} />
                    <Text style={styles.buttonText}>{t('flashcard.save.viewSaved')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {furiganaText && needsRomanization && (
                    <View style={styles.resultContainer}>
                      <Text style={styles.sectionTitle}>
                        {detectedLanguage === 'Japanese' ? t('flashcard.sectionTitles.withFurigana') :
                         detectedLanguage === 'Chinese' ? t('flashcard.sectionTitles.withPinyin') :
                         detectedLanguage === 'Korean' ? t('flashcard.sectionTitles.withRevisedRomanization') :
                         detectedLanguage === 'Russian' ? t('flashcard.sectionTitles.withPracticalRomanization') :
                         detectedLanguage === 'Arabic' ? t('flashcard.sectionTitles.withArabicChatAlphabet') :
                         detectedLanguage === 'Hindi' ? t('flashcard.sectionTitles.withHindiRomanization') :
                         detectedLanguage === 'Italian' ? t('flashcard.sectionTitles.originalText') :
                         detectedLanguage === 'Tagalog' ? t('flashcard.sectionTitles.originalText') :
                         t('flashcard.sectionTitles.withPronunciationGuide')}
                      </Text>
                      {(detectedLanguage === 'Japanese' || detectedLanguage === 'Chinese' || detectedLanguage === 'Korean' || detectedLanguage === 'Russian' || detectedLanguage === 'Arabic' || detectedLanguage === 'Hindi') ? (
                        <FuriganaText
                          text={furiganaText}
                          fontSize={20}
                          furiganaFontSize={12}
                          color={COLORS.text}
                          furiganaColor={COLORS.darkGray}
                          textAlign="left"
                        />
                      ) : (
                        <Text style={styles.furiganaText} numberOfLines={0}>{furiganaText}</Text>
                      )}
                    </View>
                  )}
                  
                  {translatedText && (
                    <View style={styles.resultContainer}>
                      <Text style={styles.sectionTitle}>{t('flashcard.sectionTitles.translation', { language: translatedLanguageName })}</Text>
                      <Text style={styles.translatedText} numberOfLines={0}>{translatedText}</Text>
                    </View>
                  )}

                  {/* 2x2 Button Grid */}
                  {textProcessed && translatedText && (
                    <View style={styles.buttonContainer}>
                      {/* Top Row */}
                      <View style={styles.gridRow}>
                        <TouchableOpacity 
                          style={styles.gridButton}
                          onPress={handleViewSavedFlashcards}
                        >
                          <Ionicons name="albums-outline" size={20} color="#ffffff" style={styles.buttonIcon} />
                          <Text style={styles.gridButtonText}>{t('flashcard.save.viewSaved')}</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          style={[
                            styles.gridButton,
                            styles.saveGridButton,
                            isSaved ? styles.savedButton : null,
                            (isSaving || !canCreateFlashcard) ? styles.disabledButton : null,
                            !canCreateFlashcard ? styles.darkDisabledButton : null,
                          ]}
                          onPress={handleShowDeckSelector}
                          disabled={isSaving || isSaved}
                        >
                          {isSaving ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <>
                              <Ionicons 
                                name={
                                  isSaved ? "checkmark-circle" : 
                                  !canCreateFlashcard ? "lock-closed" : 
                                  "bookmark-outline"
                                } 
                                size={20} 
                                color={!canCreateFlashcard ? COLORS.darkGray : "#ffffff"}
                                style={styles.buttonIcon} 
                              />
                              <Text style={[
                                styles.gridButtonText,
                                !canCreateFlashcard ? { color: COLORS.darkGray } : null
                              ]}>
                                {isSaved ? t('flashcard.save.savedAsFlashcard') : 
                                 !canCreateFlashcard ? `Limit reached (${remainingFlashcards} left)` :
                                 t('flashcard.save.saveAsFlashcard')}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* Bottom Row */}
                      <View style={styles.gridRow}>
                        <TouchableOpacity 
                          style={[styles.gridButton, styles.editTranslationGridButton]} 
                          onPress={handleEditTranslation}
                        >
                          <Ionicons name="pencil" size={18} color="#ffffff" style={styles.buttonIcon} />
                          <Text style={styles.gridButtonText}>{t('flashcard.edit.editTranslation')}</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          style={[styles.gridButton, styles.editInputGridButton]} 
                          onPress={handleEditInputAndRetranslate}
                        >
                          <Ionicons name="refresh" size={18} color="#ffffff" style={styles.buttonIcon} />
                          <Text style={styles.gridButtonText}>{t('flashcard.edit.editInputRetranslate')}</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Deck Selector Modal */}
                      <DeckSelector
                        visible={showDeckSelector}
                        onClose={() => setShowDeckSelector(false)}
                        onSelectDeck={(deckId) => {
                          setSelectedDeckId(deckId);
                          handleSaveFlashcard(deckId);
                        }}
                      />
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
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0} // Changed from 40 to 10 to position closer to keyboard
            key={`edit-modal-${showEditModal}`}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('flashcard.edit.editText')}</Text>
              
              {/* Image display within the modal */}
              {imageUri && (
                <View style={styles.modalImageContainer}>
                  <Text style={styles.modalImageLabel}>Original Image:</Text>
                  <ScrollView 
                    style={styles.modalImageWrapper}
                    contentContainerStyle={styles.modalImageScrollContent}
                    maximumZoomScale={3}
                    minimumZoomScale={1}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    centerContent={true}
                    pinchGestureEnabled={true}
                    scrollEnabled={true}
                    bounces={false}
                  >
                    <Image 
                      source={{ uri: imageUri }} 
                      style={styles.modalImage}
                      resizeMode="contain"
                    />
                  </ScrollView>
                </View>
              )}
              
              <ScrollView 
                key={`edit-text-scroll-${showEditModal}`}
                style={styles.modalScrollContent}
                contentOffset={{ x: 0, y: 0 }}
                scrollsToTop={true}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View>
                    <Text style={styles.modalSubtitle}>{t('flashcard.edit.editText')}</Text>
                    <TextInput
                      style={styles.textInput}
                      value={editedText}
                      onChangeText={setEditedText}
                      multiline
                      placeholder={t('flashcard.edit.editTextPlaceholder')}
                      placeholderTextColor="#aaa"
                      textAlignVertical="top"
                    />
                    
                    <View style={styles.modalButtonsContainer}>
                      <TouchableOpacity 
                        style={styles.modalCancelButton} 
                        onPress={handleCancelEdit}
                      >
                        <Text style={styles.modalButtonText}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.modalSaveButton} 
                        onPress={handleSaveEdit}
                      >
                        <Text style={styles.modalButtonText}>{t('common.save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Edit Translation Modal */}
        <Modal
          visible={showEditTranslationModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setShowEditTranslationModal(false);
            setIsManualOperation(false); // Reset manual operation flag
          }}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0} // Changed from 40 to 10 to position closer to keyboard
            key={`translation-modal-${showEditTranslationModal}`}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('flashcard.edit.editTranslation')}</Text>
              
              {/* Image display within the modal */}
              {imageUri && (
                <View style={styles.modalImageContainer}>
                  <Text style={styles.modalImageLabel}>Original Image:</Text>
                  <ScrollView 
                    style={styles.modalImageWrapper}
                    contentContainerStyle={styles.modalImageScrollContent}
                    maximumZoomScale={3}
                    minimumZoomScale={1}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    centerContent={true}
                    pinchGestureEnabled={true}
                    scrollEnabled={true}
                    bounces={false}
                  >
                    <Image 
                      source={{ uri: imageUri }} 
                      style={styles.modalImage}
                      resizeMode="contain"
                    />
                  </ScrollView>
                </View>
              )}
              
              <ScrollView 
                key={`translation-text-scroll-${showEditTranslationModal}`}
                style={styles.modalScrollContent}
                contentOffset={{ x: 0, y: 0 }}
                scrollsToTop={true}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View>
                    <Text style={styles.modalSubtitle}>{t('flashcard.edit.editTranslation')}</Text>
                    <TextInput
                      style={styles.textInput}
                      value={translatedText}
                      onChangeText={setTranslatedText}
                      multiline
                      placeholder={t('flashcard.edit.editTranslationPlaceholder')}
                      placeholderTextColor="#aaa"
                      textAlignVertical="top"
                    />
                    {needsRomanization && (
                      <>
                        <Text style={styles.modalSubtitle}>
                          {detectedLanguage === 'Japanese' ? t('flashcard.edit.editFurigana') :
                           detectedLanguage === 'Chinese' ? t('flashcard.edit.editPinyin') :
                           detectedLanguage === 'Korean' ? t('flashcard.edit.editRomanization') :
                           detectedLanguage === 'Russian' ? t('flashcard.edit.editRomanization') :
                           detectedLanguage === 'Arabic' ? t('flashcard.edit.editTransliteration') :
                           detectedLanguage === 'Hindi' ? t('flashcard.edit.editRomanization') :
                           t('flashcard.edit.editRomanization')}
                        </Text>
                        <TextInput
                          style={styles.textInput}
                          value={furiganaText}
                          onChangeText={setFuriganaText}
                          multiline
                          placeholder={t('flashcard.edit.editRomanizationPlaceholder')}
                          placeholderTextColor="#aaa"
                          textAlignVertical="top"
                        />
                      </>
                    )}
                    <View style={styles.modalButtonsContainer}>
                      <TouchableOpacity 
                        style={styles.modalCancelButton} 
                        onPress={() => {
                          setShowEditTranslationModal(false);
                          setIsManualOperation(false); // Reset manual operation flag
                        }}
                      >
                        <Text style={styles.modalButtonText}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.modalSaveButton} 
                        onPress={() => {
                          setShowEditTranslationModal(false);
                          setIsManualOperation(false); // Reset manual operation flag
                        }}
                      >
                        <Text style={styles.modalButtonText}>{t('common.save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
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
  darkDisabledButton: {
    backgroundColor: COLORS.disabledDark,
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
    marginBottom: 0, // Changed from 10 to 0 to position closer to keyboard
    width: '100%',
    maxWidth: 500,
    maxHeight: '95%', // Increased from 90% to 95% to allow more space
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalScrollContent: {
    flexGrow: 1,
    marginBottom: 10,
    maxHeight: Platform.OS === 'ios' ? '70%' : '75%', // Added maxHeight to ensure scroll area is large enough
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
    padding: 16,
    fontSize: 18,
    minHeight: 250, // Increased from 200 to 250
    maxHeight: 500, // Increased from 400 to 500
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
    color: 'white',
    backgroundColor: COLORS.mediumSurface,
    marginBottom: 16,
    textAlign: 'left',
    width: '100%',
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingBottom: 20,
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
  // Grid layout styles
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  gridButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.darkGray,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    flex: 1,
    minHeight: 80,
  },
  gridButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  saveGridButton: {
    backgroundColor: COLORS.darkGray,
  },
  editTranslationGridButton: {
    backgroundColor: '#2CB67D',
  },
  editInputGridButton: {
    backgroundColor: '#FF6B6B',
  },
  modalImageContainer: {
    marginBottom: 16,
    backgroundColor: COLORS.mediumSurface,
    borderRadius: 8,
    padding: 12,
    height: 220, // Fixed height for consistent zoom behavior
  },
  modalImageLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: COLORS.text,
  },
  modalImageWrapper: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.darkGray,
    overflow: 'hidden',
  },
  modalImageScrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    minWidth: '100%',
  },
  modalImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
});