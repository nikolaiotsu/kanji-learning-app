import React, { useState, useEffect } from 'react';
import Constants from 'expo-constants';
import { View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView, TouchableOpacity, Alert, TextInput, Modal, Image, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { processWithClaude, processWithClaudeAndScope, fetchSingleScopeAnalysis, validateLanguageWithClaude, LanguageMismatchInfo, ClaudeResponse } from './services/claudeApi';
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
  containsThaiText,
  containsVietnameseText,
  containsKanji
} from './utils/textFormatting';
import { saveFlashcard, uploadImageToStorage } from './services/supabaseStorage';
import { Flashcard } from './types/Flashcard';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import DeckSelector from './components/flashcards/DeckSelector';
import { useAuth } from './context/AuthContext';
import { useSettings, AVAILABLE_LANGUAGES } from './context/SettingsContext';

const LANGUAGE_NAME_TO_CODE: Record<string, string> = Object.entries(AVAILABLE_LANGUAGES).reduce<Record<string, string>>(
  (acc, [code, name]) => {
    acc[name] = code;
    return acc;
  },
  {}
);
import { COLORS } from './constants/colors';
import { FontAwesome6 } from '@expo/vector-icons';
import PokedexLayout from './components/shared/PokedexLayout';
import FuriganaText from './components/shared/FuriganaText';
import { useFlashcardCounter } from './context/FlashcardCounterContext';
import { useSubscription } from './context/SubscriptionContext';
import { PRODUCT_IDS } from './constants/config';
import MemoryManager from './services/memoryManager';
import * as Haptics from 'expo-haptics';
import { useNetworkState } from './services/networkManager';
import { incrementLifetimeCount, shouldShowReviewPrompt } from './services/reviewPromptService';
import ReviewPromptModal from './components/shared/ReviewPromptModal';

import { logger } from './utils/logger';
export default function LanguageFlashcardsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
const { targetLanguage, forcedDetectionLanguage, setForcedDetectionLanguage, setBothLanguages } = useSettings();
  const { incrementFlashcardCount, canCreateFlashcard, remainingFlashcards } = useFlashcardCounter();
  const { purchaseSubscription } = useSubscription();
  const { isConnected } = useNetworkState();
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
  const [scopeAnalysis, setScopeAnalysis] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  
  // Track the actual target language used for the current translation
  // This preserves the original target language even if settings get swapped during retries
  const [actualTargetLanguage, setActualTargetLanguage] = useState<string>(targetLanguage);
  
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
  
  // State for progressive loading
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingFailed, setProcessingFailed] = useState(false);
  
  // State for appending alternate analysis
  const [isAppendingAnalysis, setIsAppendingAnalysis] = useState(false);
  
  // State for the image display
  const [showImagePreview, setShowImagePreview] = useState(false);
  
  // Flag to prevent main useEffect from running during manual operations
  const [isManualOperation, setIsManualOperation] = useState(false);
  
  // State for review prompt modal
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);

  // Debug: Log state changes
  useEffect(() => {
    logger.log('🔍 [DEBUG] showEditModal changed to:', showEditModal);
  }, [showEditModal]);
  
  useEffect(() => {
    logger.log('🔍 [DEBUG] showEditTranslationModal changed to:', showEditTranslationModal);
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

  const progressCallback = (checkpoint: number) => {
    logger.log('🚀 [Flashcards] Progress callback triggered:', checkpoint);
    setProcessingProgress(checkpoint);
    logger.log('📊 [Flashcards] Processing progress set to:', checkpoint);
  };

  // Lazy AI validation helper - returns detected language regardless of expectation
  const performLazyAIValidation = async (text: string, expectedLanguage: string): Promise<string | null> => {
    try {
      logger.log(`🔍 [Flashcards] Performing lazy AI validation for expected language: ${expectedLanguage}`);
      const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY;
      if (!apiKey) {
        logger.warn(`🔍 [Flashcards] No API key available for lazy validation`);
        return null;
      }

      const aiValidation = await validateLanguageWithClaude(text, expectedLanguage, apiKey);
      if (aiValidation.detectedLanguage) {
        const result = aiValidation.detectedLanguage;
        const isMatch = aiValidation.isValid;

        logger.log(`🔍 [Flashcards] AI validation result: detected ${result}, matches expected ${expectedLanguage}: ${isMatch}`);
        return result; // Always return detected language, regardless of whether it matches expectation
      }
      logger.log(`❌ [Flashcards] Lazy AI validation failed: no language detected`);
      return null;
    } catch (error) {
      logger.warn(`🔍 [Flashcards] Lazy AI validation error:`, error);
      return null;
    }
  };

  // Result type for language mismatch retry - includes successful languages used
  type RetryResult = {
    response: ClaudeResponse;
    usedSourceLang: string;
    usedTargetLang: string;
  };

  const handleLanguageMismatchRetry = async (
    mismatch: LanguageMismatchInfo,
    includeScope: boolean,
    attempt: (sourceLang: string, targetLang: string) => Promise<ClaudeResponse>,
    originalTargetLanguage: string
  ): Promise<RetryResult | null> => {
    let detectedCode = mismatch.detectedLanguageCode || LANGUAGE_NAME_TO_CODE[mismatch.detectedLanguageName];
    const originalSourceLanguage = forcedDetectionLanguage;
    
    // Helper to make attempt and return with language info
    const tryAttempt = async (sourceLang: string, targetLang: string): Promise<RetryResult> => {
      const response = await attempt(sourceLang, targetLang);
      return { response, usedSourceLang: sourceLang, usedTargetLang: targetLang };
    };

    
    // RULE: Always preserve the user's original target language unless the detected
    // language IS the target language (meaning user scanned text in their learning language)
    
    // Case 1: Detected language matches the target language
    // This means user scanned text in their learning language - swap source and target
    // e.g., Settings: JA→EN, user scans English text → swap to EN→JA
    if (detectedCode === originalTargetLanguage) {
      logger.log(`🔄 [Flashcards] Smart swap: Detected ${detectedCode} matches target, swapping to ${detectedCode} → ${originalSourceLanguage}`);
      const detectedLabel = AVAILABLE_LANGUAGES[detectedCode as keyof typeof AVAILABLE_LANGUAGES] || mismatch.detectedLanguageName || 'unknown';
      setDetectedLanguage(detectedLabel);
      return tryAttempt(detectedCode, originalSourceLanguage);
    }
    
    // Case 2: Standard case - detected language differs from both source and target
    // Keep the original target, try to find the correct source language
    // e.g., Settings: JA→FR, user scans English text → translate EN→FR (keep FR as target!)
    
    // First, try the pattern-detected language as source (if available and different)
    if (detectedCode && detectedCode !== originalSourceLanguage && detectedCode !== originalTargetLanguage) {
      logger.log(`🔄 [Flashcards] Trying detected language ${detectedCode} → ${originalTargetLanguage} (keeping original target)`);
      const detectedLabel = AVAILABLE_LANGUAGES[detectedCode as keyof typeof AVAILABLE_LANGUAGES] || mismatch.detectedLanguageName || 'unknown';
      setDetectedLanguage(detectedLabel);
      const detectedResult = await tryAttempt(detectedCode, originalTargetLanguage);
      
      // If it worked, return it
      if (detectedResult.response.translatedText && !detectedResult.response.languageMismatch) {
        logger.log(`✅ [Flashcards] Detected language ${detectedCode} was correct`);
        return detectedResult;
      }
      
      // If it failed with AI-detected language, try that
      if (detectedResult.response.languageMismatch && detectedResult.response.languageMismatch.detectedLanguageCode) {
        const aiDetectedCode = detectedResult.response.languageMismatch.detectedLanguageCode;
        if (aiDetectedCode !== detectedCode && aiDetectedCode !== originalTargetLanguage) {
          logger.log(`🔄 [Flashcards] Using AI-detected language: ${aiDetectedCode} → ${originalTargetLanguage}`);
          const aiDetectedLabel = AVAILABLE_LANGUAGES[aiDetectedCode as keyof typeof AVAILABLE_LANGUAGES] || detectedResult.response.languageMismatch.detectedLanguageName || 'unknown';
          setDetectedLanguage(aiDetectedLabel);
          return tryAttempt(aiDetectedCode, originalTargetLanguage);
        }
      }
      
      return detectedResult;
    }
    
    // Case 3: Pattern detection failed or gave same as source
    // Try the target language as source (user may have scanned text in target language)
    // BUT keep original target - only swap if this specific attempt fails
    logger.log(`🔄 [Flashcards] Detection unclear, trying ${originalTargetLanguage} as source → ${originalSourceLanguage}`);
    const targetLabel = AVAILABLE_LANGUAGES[originalTargetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'unknown';
    setDetectedLanguage(targetLabel);
    const swapResult = await tryAttempt(originalTargetLanguage, originalSourceLanguage);
    
    // If swap worked, return it
    if (swapResult.response.translatedText && !swapResult.response.languageMismatch) {
      logger.log(`✅ [Flashcards] Swap worked: ${originalTargetLanguage} → ${originalSourceLanguage}`);
      return swapResult;
    }
    
    // If swap failed with AI-detected language, try that with ORIGINAL target
    if (swapResult.response.languageMismatch && swapResult.response.languageMismatch.detectedLanguageCode) {
      const aiDetectedCode = swapResult.response.languageMismatch.detectedLanguageCode;
      if (aiDetectedCode !== originalTargetLanguage && aiDetectedCode !== originalSourceLanguage) {
        logger.log(`🔄 [Flashcards] Using AI-detected language: ${aiDetectedCode} → ${originalTargetLanguage} (restoring original target)`);
        const aiDetectedLabel = AVAILABLE_LANGUAGES[aiDetectedCode as keyof typeof AVAILABLE_LANGUAGES] || swapResult.response.languageMismatch.detectedLanguageName || 'unknown';
        setDetectedLanguage(aiDetectedLabel);
        return tryAttempt(aiDetectedCode, originalTargetLanguage);
      }
    }

    // Final fallback: Use lazy AI validation for better language detection
    // This only triggers when all pattern-based approaches have failed
    logger.log(`🔍 [Flashcards] All pattern-based retries failed, attempting lazy AI validation`);
    try {
      // Get the original text that was being processed
      const originalText = editedText || displayText;

      // Try AI validation with the original source language
      const aiDetectedLanguage = await performLazyAIValidation(originalText, originalSourceLanguage);
      if (aiDetectedLanguage && aiDetectedLanguage !== originalSourceLanguage) {
        // Convert detected language name back to code
        const detectedCode = Object.keys(AVAILABLE_LANGUAGES).find(
          key => AVAILABLE_LANGUAGES[key as keyof typeof AVAILABLE_LANGUAGES] === aiDetectedLanguage
        );

        if (detectedCode && detectedCode !== originalTargetLanguage) {
          logger.log(`🎯 [Flashcards] Lazy AI validation found better language: ${detectedCode} → ${originalTargetLanguage}`);
          const aiLabel = aiDetectedLanguage;
          setDetectedLanguage(aiLabel);
          return tryAttempt(detectedCode, originalTargetLanguage);
        }
      }
    } catch (error) {
      logger.warn(`🔍 [Flashcards] Lazy AI validation failed:`, error);
    }

    return swapResult;
  };

  const runTranslationWithAutoSwitch = async (includeScope: boolean): Promise<ClaudeResponse> => {
    // Preserve the original target language to prevent accidental swaps during retries
    const originalTargetLanguage = targetLanguage;
    const originalSourceLanguage = forcedDetectionLanguage;
    
    // Track what source/target were actually used for successful translation
    let usedSourceLang = originalSourceLanguage;
    let usedTargetLang = originalTargetLanguage;
    
    const attempt = async (sourceLang: string, targetLang: string) => {
      if (includeScope) {
        return processWithClaudeAndScope(editedText, targetLang, sourceLang, progressCallback);
      }
      return processWithClaude(editedText, targetLang, sourceLang, progressCallback);
    };

    let result = await attempt(originalSourceLanguage, originalTargetLanguage);

    // SMART RETRY: Use detected language code from mismatch
    if (result.languageMismatch) {
      const detectedCode = result.languageMismatch.detectedLanguageCode;
      logger.log(`🔄 [Flashcards] Language mismatch detected: expected ${originalSourceLanguage}, got ${result.languageMismatch.detectedLanguageName} (code: ${detectedCode})`);

      // Case 1: Detected language is a THIRD language (not source, not target)
      // This means the user scanned text in a completely different language
      // Try: detected → originalTarget (preserve user's target language)
      if (detectedCode && detectedCode !== originalSourceLanguage && detectedCode !== originalTargetLanguage) {
        logger.log(`🔄 [Flashcards] Detected third language, trying: ${detectedCode} → ${originalTargetLanguage}`);
        setDetectedLanguage(AVAILABLE_LANGUAGES[detectedCode as keyof typeof AVAILABLE_LANGUAGES] || result.languageMismatch.detectedLanguageName || 'unknown');
        result = await attempt(detectedCode, originalTargetLanguage);
        usedSourceLang = detectedCode;
        usedTargetLang = originalTargetLanguage;
        
        // If this retry also failed, apply smart retry logic to the second detection
        // This handles cases like: KR→FR setting, scan French, initial detect says "Italian", retry fails, AI says "French"
        if (result.languageMismatch) {
          const secondDetectedCode = result.languageMismatch.detectedLanguageCode;
          logger.log(`🔄 [Flashcards] Second mismatch detected: ${secondDetectedCode}`);
          
          // Case 2a: Second detection matches target → swap (text is in target language)
          if (secondDetectedCode === originalTargetLanguage) {
            logger.log(`🔄 [Flashcards] Text is actually in target language (${originalTargetLanguage}), swapping: ${originalTargetLanguage} → ${originalSourceLanguage}`);
            setDetectedLanguage(AVAILABLE_LANGUAGES[originalTargetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'unknown');
            result = await attempt(originalTargetLanguage, originalSourceLanguage);
            usedSourceLang = originalTargetLanguage;
            usedTargetLang = originalSourceLanguage;
          }
          // Case 1a: Second detection matches source → retry original (detection was wrong, text is actually in source)
          else if (secondDetectedCode === originalSourceLanguage) {
            logger.log(`🔄 [Flashcards] Text is actually in source language (${originalSourceLanguage}), retrying with original settings: ${originalSourceLanguage} → ${originalTargetLanguage}`);
            setDetectedLanguage(AVAILABLE_LANGUAGES[originalSourceLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'unknown');
            result = await attempt(originalSourceLanguage, originalTargetLanguage);
            usedSourceLang = originalSourceLanguage;
            usedTargetLang = originalTargetLanguage;
          }
          // Otherwise: second detection is unreliable, fail gracefully (don't go deeper)
        }
      }
      // Case 2: Detected language matches target (user scanned text in their learning language)
      // Simple swap: target → source
      else if (detectedCode === originalTargetLanguage) {
        logger.log(`🔄 [Flashcards] Text is in target language, swapping: ${originalTargetLanguage} → ${originalSourceLanguage}`);
        setDetectedLanguage(AVAILABLE_LANGUAGES[originalTargetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'unknown');
        result = await attempt(originalTargetLanguage, originalSourceLanguage);
        usedSourceLang = originalTargetLanguage;
        usedTargetLang = originalSourceLanguage;
      }
      // Case 3: No detected code available - fall back to simple swap
      else {
        logger.log(`🔄 [Flashcards] No detected code, trying simple swap: ${originalTargetLanguage} → ${originalSourceLanguage}`);
        setDetectedLanguage(AVAILABLE_LANGUAGES[originalTargetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'unknown');
        result = await attempt(originalTargetLanguage, originalSourceLanguage);
        usedSourceLang = originalTargetLanguage;
        usedTargetLang = originalSourceLanguage;
      }

      // If retry still failed, stop to save costs
      if (result.languageMismatch) {
        logger.log(`💰 [Flashcards] Retry failed, stopping to save API costs`);
        // Keep the result as-is, user will see the error
      }
    }

    // After successful translation, update settings and UI
    if (result.translatedText && !result.languageMismatch) {
      // Update actualTargetLanguage for UI display
      setActualTargetLanguage(usedTargetLang);
      
      // If we used different languages than original (from retry), update settings
      // Auto-switch is handled by languageMismatch detection in the translation call itself
      if (usedSourceLang !== originalSourceLanguage || usedTargetLang !== originalTargetLanguage) {
        logger.log(`✅ [Flashcards] Translation successful with auto-switch, updating settings: ${usedSourceLang} → ${usedTargetLang}`);
        await setBothLanguages(usedSourceLang, usedTargetLang);
      }
      // Post-translation validation removed - Claude's successful translation IS the validation
      // The languageMismatch detection already handles auto-switch before we get here
    }

    return result;
  };

  // Function to process text with Claude API
  const processTextWithClaude = async (text: string) => {
    logger.log('🌟 [Flashcards] Starting text processing with Claude API');
    setIsLoading(true);
    setError('');
    setTextProcessed(false);
    setProcessingProgress(0);
    setProcessingFailed(false);
    logger.log('🔄 [Flashcards] State set - isLoading: true, processingProgress: 0, processingFailed: false');

    try {
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
      const hasThai = containsThaiText(text);
      const hasVietnamese = containsVietnameseText(text);

      const needsRomanization = (
        hasJapanese ||
        hasChinese ||
        hasKorean ||
        hasRussian ||
        hasArabic ||
        hasHindi ||
        hasThai
      );
      setNeedsRomanization(needsRomanization);

      let language = 'unknown';
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
        case 'th': language = 'Thai'; break;
        default: language = 'unknown';
      }
      if (hasVietnamese) {
        language = 'Vietnamese';
      }
      logger.log(`Using forced language detection: ${language}`);
      setDetectedLanguage(language);

      // Store the original target language before processing (in case it gets swapped)
      setActualTargetLanguage(targetLanguage);
      
      const result = await runTranslationWithAutoSwitch(false);
      
      // Check if we got valid results back
      if (result.translatedText) {
        // Set translated text for all languages
        setTranslatedText(result.translatedText);
        
        // Set romanization text if provided for languages that need it
        if (needsRomanization) {
          setFuriganaText(result.furiganaText);
          // Show error if romanization is missing for languages that should have it
          // BUT skip this check if we're translating TO Japanese/Chinese (where furigana/pinyin is not needed)
          if (!result.furiganaText && targetLanguage !== 'ja' && targetLanguage !== 'zh') {
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
        
        // Add a delay to show the 4th (green) light prominently before fade-out
        logger.log('✅ [Flashcards] Processing successful - showing final light for adequate time');
        setTimeout(() => {
          logger.log('✅ [Flashcards] Delay complete - setting isLoading to false');
          setIsLoading(false);
          setIsManualOperation(false); // Reset manual operation flag when process completes
        }, 1500); // 1500ms delay to give green light proper visibility time
        
      } else {
        // If we didn't get valid results, show the error message from the API
        setError(result.translatedText || 'Failed to process text with Claude API. Please try again later.');
        setProcessingFailed(true);
        
        // For errors, complete immediately
        logger.log('❌ [Flashcards] Processing failed - setting isLoading to false immediately');
        setIsLoading(false);
        setIsManualOperation(false);
      }
    } catch (err) {
      logger.log('Error processing with Claude:', err);
      // Show specific error message if available (e.g., text too long, language mismatch)
      const errorMessage = err instanceof Error ? err.message : 'Failed to process text with Claude API. Please try again later.';
      setError(errorMessage);
      setProcessingFailed(true);
      
      // For errors, complete immediately
      logger.log('❌ [Flashcards] Processing error - setting isLoading to false immediately');
      setIsLoading(false);
      setIsManualOperation(false);
    }
  };

  // Retry processing with Claude API
  const handleRetry = () => {
    if (error.includes("Language mismatch") || error.includes("Forced language not detected")) {
      // If the error is about language validation/forced language detection, navigate home
      router.push('/');
    } else if (editedText) {
      // For other errors, try processing the text again
      processTextWithClaude(editedText);
    }
  };

  // Function to show deck selector
  const handleShowDeckSelector = () => {
    // Check network connectivity first
    if (!isConnected) {
      Alert.alert(
        t('common.error'),
        t('offline.createCardError')
      );
      return;
    }
    
    // Check flashcard limit
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
      Alert.alert(t('flashcard.save.cannotSaveTitle'), t('flashcard.save.cannotSaveTranslation'));
      return;
    }
    
    // For texts that need furigana (Japanese), we need both furigana and translation
    // EXCEPT when translating TO Japanese/Chinese (where furigana/pinyin is not generated)
    if (needsRomanization && (!editedText || !translatedText)) {
      Alert.alert(t('flashcard.save.cannotSaveTitle'), t('flashcard.save.cannotSaveContent'));
      return;
    }
    
    // Additional validation: if source needs romanization AND we're not translating TO ja/zh, require furigana
    if (needsRomanization && !furiganaText && targetLanguage !== 'ja' && targetLanguage !== 'zh') {
      Alert.alert(t('flashcard.save.cannotSaveTitle'), t('flashcard.save.cannotSaveContent'));
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
        // Give UI a frame to show the spinner before uploading
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
        try {
          const uploadedUrl = await uploadImageToStorage(imageUri);
          if (uploadedUrl) {
            storedImageUrl = uploadedUrl;
          }
        } catch (imageError) {
          // Image upload failed (validation or upload error)
          const errorMsg = imageError instanceof Error ? imageError.message : 'Unable to upload image.';
          Alert.alert(
            t('flashcard.save.imageUploadFailedTitle'),
            t('flashcard.save.imageUploadFailedMessage', { error: errorMsg })
          );
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
        scopeAnalysis: scopeAnalysis || undefined, // Include scope analysis if available
      };

      // Save flashcard
      await saveFlashcard(flashcard as Flashcard, deckId);
      
      // Increment flashcard counter after successful save
      await incrementFlashcardCount();
      
      // Increment lifetime count and check if we should show review prompt
      await incrementLifetimeCount();
      const shouldShowReview = await shouldShowReviewPrompt();
      if (shouldShowReview) {
        // Delay showing the review prompt slightly so the success alert shows first
        setTimeout(() => {
          setShowReviewPrompt(true);
        }, 500);
      }
      
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
          logger.log('[FlashcardSave] Keeping local image file for navigation:', imageUri);
        }
        logger.log('[FlashcardSave] Flashcard save completed');
      } catch (error) {
        logger.warn('[FlashcardSave] Error during flashcard save cleanup:', error);
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
              router.push({ pathname: '/saved-flashcards', params: { deckId } });
            }
          },
          { text: t('common.ok') }
        ]
      );
    } catch (err) {
      logger.error('Error saving flashcard:', err);
      // Show specific error message if available
      const errorMessage = err instanceof Error ? err.message : t('flashcard.save.saveFailed');
      Alert.alert(t('flashcard.save.saveError'), errorMessage);
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
    
    // Walkthrough will automatically advance to save-button step after translation completes
    // via the useEffect that monitors textProcessed state
  };

  // Function to handle scope and translate button
  const handleScopeAndTranslate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!editedText) {
      Alert.alert(t('common.error'), t('flashcard.edit.enterText'));
      return;
    }
    
    logger.log('🌟 [Flashcards] Starting Scope and Translate with Claude API');
    setIsLoading(true);
    setError('');
    setTextProcessed(false);
    setProcessingProgress(0);
    setProcessingFailed(false);
    
    try {
      // Check if the text contains Japanese, Chinese, Korean, Russian, Arabic, Hindi, Esperanto, Thai characters
      const hasJapanese = containsJapanese(editedText);
      const hasChinese = containsChinese(editedText);
      const hasKorean = containsKoreanText(editedText);
      const hasRussian = containsRussianText(editedText);
      const hasArabic = containsArabicText(editedText);
      const hasHindi = containsHindiText(editedText);
      const hasEsperanto = containsEsperantoText(editedText);
      const hasThai = containsThaiText(editedText);
      const hasVietnamese = containsVietnameseText(editedText);
      
      const needsRomanization = (
        hasJapanese || 
        hasChinese || 
        hasKorean || 
        hasRussian || 
        hasArabic ||
        hasHindi ||
        hasThai
      );
      setNeedsRomanization(needsRomanization);
      
      // Determine language label
      let language = 'unknown';
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
        case 'th': language = 'Thai'; break;
        default: language = 'unknown';
      }
      if (hasVietnamese) {
        language = 'Vietnamese';
      }
      setDetectedLanguage(language);
      
      // Store the original target language before processing (in case it gets swapped)
      setActualTargetLanguage(targetLanguage);
      
      // Progress callback
      const result = await runTranslationWithAutoSwitch(true);
      
      // Check if we got valid results back
      if (result.translatedText) {
        setTranslatedText(result.translatedText);
        setScopeAnalysis(result.scopeAnalysis || '');
        
        // WordScope Combined now returns furigana for reading languages in a single call
        if (needsRomanization && result.furiganaText) {
          setFuriganaText(result.furiganaText);
          logger.log(`🔤 [Flashcards] Furigana from combined call: "${result.furiganaText.substring(0, 50)}..."`);
        }
        
        setTextProcessed(true);
        
        // Delay before hiding loading
        setTimeout(() => {
          setIsLoading(false);
          setIsManualOperation(false);
        }, 1500);
        
      } else {
        setError(result.translatedText || 'Failed to process text with Claude API. Please try again later.');
        setProcessingFailed(true);
        setIsLoading(false);
        setIsManualOperation(false);
      }
    } catch (err) {
      logger.error('Error processing with Claude Scope:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to process text with Claude API. Please try again later.';
      setError(errorMessage);
      setProcessingFailed(true);
      setIsLoading(false);
      setIsManualOperation(false);
    }
  };

  // Function to handle retry with validation for forced language settings
  const handleRetryWithValidation = () => {
    if (!editedText) {
      Alert.alert(t('common.error'), t('flashcard.edit.enterText'));
      return;
    }

    // Language validation now handled by hybrid AI/pattern validation in processWithClaude
    // Proceed directly to translation - validation errors will be caught there
    processTextWithClaude(editedText);
  };

  // Function to save edited text
  const handleSaveEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEditModal(false);
    // Text is already updated via setEditedText in the TextInput onChange
    // User can now choose to translate manually with one of the buttons
  };

  // Function to handle editing input and retranslating
  const handleEditInputAndRetranslate = () => {
    logger.log('🔍 [DEBUG] Edit Input & Retranslate button pressed!');
    
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
    
    // Don't process automatically - only process when user saves
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
  // Use actualTargetLanguage instead of targetLanguage to preserve the original target
  // even if languages get swapped during retry attempts
  const translatedLanguageName = React.useMemo(() => {
    const langName = AVAILABLE_LANGUAGES[actualTargetLanguage as keyof typeof AVAILABLE_LANGUAGES];
    logger.log(`🏷️ [Flashcards] Translation title - actualTargetLanguage: ${actualTargetLanguage}, translatedLanguageName: ${langName}`);
    return langName || 'English';
  }, [actualTargetLanguage]);
  
  // Update actualTargetLanguage when targetLanguage changes (but preserve it during processing)
  React.useEffect(() => {
    if (!isLoading && !textProcessed) {
      // Only update if we're not currently processing, to preserve the language used for translation
      setActualTargetLanguage(targetLanguage);
    }
  }, [targetLanguage, isLoading, textProcessed]);

  // Function to handle editing translation
  const handleEditTranslation = () => {
    logger.log('🔍 [DEBUG] Edit Translation button pressed!');
    
    // Set manual operation flag to prevent main useEffect interference
    setIsManualOperation(true);
    
    // Show the translation edit modal
    setShowEditTranslationModal(true);
  };

  // Function to handle appending alternate analysis (etymology or grammar)
  const handleAppendAlternateAnalysis = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (!editedText || !scopeAnalysis) {
      return;
    }
    
    logger.log('🔬 [Scope] Appending alternate analysis');
    setIsAppendingAnalysis(true);
    
    try {
      // Determine current analysis type based on text
      const isWord = !(/[.!?。！？]/.test(editedText)) && editedText.trim().length < 50;
      const currentType = isWord ? 'etymology' : 'grammar';
      const alternateType = currentType === 'etymology' ? 'grammar' : 'etymology';
      
      // Fetch the alternate analysis
      const alternateAnalysis = await fetchSingleScopeAnalysis(
        editedText,
        alternateType,
        targetLanguage,
        forcedDetectionLanguage
      );
      
      if (alternateAnalysis) {
        // Append with clear separator
        const separator = `\n\n--- ${alternateType === 'etymology' ? 'Etymology & Context' : 'Grammar Analysis'} ---\n\n`;
        const updatedAnalysis = scopeAnalysis + separator + alternateAnalysis;
        setScopeAnalysis(updatedAnalysis);
        logger.log('🔬 [Scope] Successfully appended alternate analysis');
      }
    } catch (error) {
      logger.error('🔬 [Scope] Failed to append alternate analysis:', error);
      Alert.alert(
        t('common.error'),
        'Failed to fetch additional analysis. Please try again.'
      );
    } finally {
      setIsAppendingAnalysis(false);
    }
  };

  return (
    <PokedexLayout 
      variant="flashcards"
      loadingProgress={processingProgress}
      isProcessing={isLoading}
      processingFailed={processingFailed}
    >
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
                    color="black" 
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

          {/* Edit, Scope and Translate, and Translate buttons */}
          {!isLoading && !textProcessed && (
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEditText}
              >
                <Ionicons 
                  name="pencil" 
                  size={20} 
                  color="#ffffff" 
                  style={styles.buttonIcon} 
                />
                <Text style={styles.buttonText}>
                  Edit Text
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.scopeAndTranslateButton}
                onPress={handleScopeAndTranslate}
              >
                <View style={styles.dualIconContainer}>
                  <FontAwesome5 
                    name="microscope" 
                    size={16} 
                    color="#ffffff" 
                  />
                  <Ionicons 
                    name="language" 
                    size={16} 
                    color="#ffffff" 
                  />
                </View>
                <Text style={styles.buttonText}>
                  Scope & Translate
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.translateButton}
                onPress={handleTranslate}
              >
                <Ionicons 
                  name="language" 
                  size={20} 
                  color="#ffffff" 
                  style={styles.buttonIcon} 
                />
                <Text style={styles.buttonText}>
                  Translate
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>
                {processingProgress === 0 ? t('flashcard.processing.analyzing') :
                 processingProgress === 1 ? t('flashcard.processing.analyzing') :
                 processingProgress === 2 ? t('flashcard.processing.detecting') :
                 processingProgress === 3 ? t('flashcard.processing.cultural') :
                 processingProgress === 4 ? t('flashcard.processing.translating') :
                 t('flashcard.processing.analyzing')}
              </Text>
            </View>
          ) : (
            <>
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                    <Ionicons name={(error.includes("Language mismatch") || error.includes("Forced language not detected")) ? "arrow-back" : "refresh"} size={18} color="#ffffff" style={styles.buttonIcon} />
                    <Text style={styles.retryButtonText}>
                      {(error.includes("Language mismatch") || error.includes("Forced language not detected")) ? t('flashcard.forcedLanguage.goBack') : t('flashcard.forcedLanguage.tryAgain')}
                    </Text>
                  </TouchableOpacity>
                  
                  {(error.includes("Language mismatch") || error.includes("Forced language not detected")) && (
                    <TouchableOpacity 
                      style={styles.settingsButton}
                      onPress={() => router.push('/settings')}
                    >
                      <Ionicons name="settings-outline" size={20} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>{t('flashcard.forcedLanguage.goToSettings')}</Text>
                    </TouchableOpacity>
                  )}
                  
                  {(error.includes("Language mismatch") || error.includes("Forced language not detected")) && (
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
                         detectedLanguage === 'Thai' ? t('flashcard.sectionTitles.withThaiRomanization') :
                         detectedLanguage === 'Italian' ? t('flashcard.sectionTitles.originalText') :
                         detectedLanguage === 'Tagalog' ? t('flashcard.sectionTitles.originalText') :
                         t('flashcard.sectionTitles.withPronunciationGuide')}
                      </Text>
                      {(detectedLanguage === 'Japanese' || detectedLanguage === 'Chinese' || detectedLanguage === 'Korean' || detectedLanguage === 'Russian' || detectedLanguage === 'Arabic' || detectedLanguage === 'Hindi' || detectedLanguage === 'Thai') ? (
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
                  
                  {scopeAnalysis && (() => {
                    // Match the same logic used by the API to determine word vs sentence
                    const isWordInput = editedText && !(/[.!?。！？]/.test(editedText)) && editedText.trim().length < 50;
                    return (
                    <View style={styles.resultContainer}>
                      <Text style={styles.sectionTitle}>
                        {isWordInput ? 'Etymology & Context' : 'Grammar Analysis'}
                      </Text>
                      <Text style={styles.scopeAnalysisText} numberOfLines={0}>{scopeAnalysis}</Text>
                      
                      {/* Append Alternate Analysis Button */}
                      {!scopeAnalysis.includes('--- Etymology & Context ---') && 
                       !scopeAnalysis.includes('--- Grammar Analysis ---') && (
                        <TouchableOpacity
                          style={styles.appendAnalysisButton}
                          onPress={handleAppendAlternateAnalysis}
                          disabled={isAppendingAnalysis}
                        >
                          {isAppendingAnalysis ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <>
                              <View style={styles.dualIconContainer}>
                                <FontAwesome5 name="microscope" size={16} color="#ffffff" />
                                <Ionicons name="add-circle-outline" size={16} color="#ffffff" />
                              </View>
                              <Text style={styles.appendAnalysisButtonText}>
                                {isWordInput 
                                  ? 'Add Grammar' 
                                  : 'Add Etymology & Context'}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                    );
                  })()}

                  {/* 2x2 Button Grid */}
                  {textProcessed && translatedText && (
                    <View style={styles.buttonContainer}>
                      {/* Top Row */}
                      <View style={styles.gridRow}>
                        <TouchableOpacity
                          style={[styles.gridButton, { flex: 1 }]}
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

        {/* Review Prompt Modal */}
        <ReviewPromptModal
          visible={showReviewPrompt}
          onClose={() => setShowReviewPrompt(false)}
        />

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
    paddingVertical: 6, // Reduced for tighter layout
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
    padding: 12, // Reduced for tighter layout
    paddingTop: 4, // Reduced for tighter layout
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
  scopeAndTranslateButton: {
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
  dualIconContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
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
    borderColor: 'rgba(59, 130, 246, 0.5)', // More transparent blue
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
  scopeAnalysisText: {
    fontSize: 16,
    lineHeight: 22,
    flexWrap: 'wrap',
    color: COLORS.text,
    fontStyle: 'italic',
  },
  appendAnalysisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.royalBlue,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  appendAnalysisButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
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
    backgroundColor: 'rgba(128, 128, 128, 0.5)', // Translucent grey background
    padding: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 10,
    justifyContent: 'center',
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
  highlightedButtonWrapper: {
    borderRadius: 8,
    padding: 0.5,
    backgroundColor: '#FFFF00', // Bright yellow glow
    shadowColor: '#FFFF00',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
  highlightedButtonText: {
    color: '#FFFF00', // Bright yellow text
  },
});