import React, { useState, useEffect, useRef, useMemo } from 'react';
import Constants from 'expo-constants';
import { View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView, TouchableOpacity, Alert, TextInput, Modal, Image, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import WalkthroughTarget from './components/shared/WalkthroughTarget';
import WalkthroughOverlay from './components/shared/WalkthroughOverlay';
import { useWalkthrough, WalkthroughStep } from './hooks/useWalkthrough';
import { useLocalSearchParams, router } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import i18next from './i18n';
import { processWithClaude, processWithClaudeAndScope, validateLanguageWithClaude, LanguageMismatchInfo, ClaudeResponse } from './services/claudeApi';
import { localizeScopeAnalysisHeadings } from './utils/textFormatting';
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
import { LinearGradient } from 'expo-linear-gradient';
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
import { apiLogger } from './services/apiUsageLogger';
import { getCurrentSubscriptionPlan } from './services/receiptValidationService';

import { logger } from './utils/logger';
export default function LanguageFlashcardsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user } = useAuth();
const { targetLanguage, forcedDetectionLanguage, setForcedDetectionLanguage, setBothLanguages } = useSettings();
  const { incrementFlashcardCount, canCreateFlashcard, remainingFlashcards } = useFlashcardCounter();
  const { purchaseSubscription, subscription } = useSubscription();
  const { isConnected } = useNetworkState();
  
  // State for unified API limit (applies to both translate and wordscope)
  const [apiCallsRemaining, setApiCallsRemaining] = useState<number>(Number.MAX_SAFE_INTEGER);
  const [isLoadingLimits, setIsLoadingLimits] = useState(false);
  const params = useLocalSearchParams();
  const textParam = params.text;
  const imageUriParam = params.imageUri;
  const useScopeParam = params.useScope;
  const walkthroughParam = params.walkthroughActive;
  
  const displayText = typeof textParam === 'string' 
    ? textParam 
    : Array.isArray(textParam) 
      ? textParam.join('') 
      : '';
  
  const imageUri = typeof imageUriParam === 'string' ? imageUriParam : undefined;
  const useScope = useScopeParam === 'true' || (typeof useScopeParam === 'object' && useScopeParam?.[0] === 'true');
  const shouldStartWalkthrough = walkthroughParam === 'true' || (typeof walkthroughParam === 'object' && walkthroughParam?.[0] === 'true');

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
  
  
  // State for the image display
  const [showImagePreview, setShowImagePreview] = useState(false);
  
  // Flag to prevent main useEffect from running during manual operations
  const [isManualOperation, setIsManualOperation] = useState(false);
  
  // State for review prompt modal
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);

  // State to hide walkthrough overlay (for choose-translation step)
  const [hideWalkthroughOverlay, setHideWalkthroughOverlay] = useState(false);

  // Walkthrough refs
  const translateButtonRef = useRef<View>(null);
  const wordscopeButtonRef = useRef<View>(null);
  const editTextButtonRef = useRef<View>(null);
  const saveButtonRef = useRef<View>(null);
  const viewSavedButtonRef = useRef<View>(null);
  const editTranslationButtonRef = useRef<View>(null);
  const editInputRetranslateButtonRef = useRef<View>(null);
  
  // ScrollView ref for auto-scrolling during walkthrough
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Ref to track if we've already initiated the scroll-and-advance transition (prevents multiple executions)
  const walkthroughTransitionInProgressRef = useRef(false);

  // Define walkthrough steps for the flashcard input page
  const flashcardWalkthroughSteps: WalkthroughStep[] = [
    {
      id: 'translate-button',
      title: t('walkthrough.translateButton.title'),
      description: t('walkthrough.translateButton.description'),
    },
    {
      id: 'wordscope-button',
      title: t('walkthrough.wordscopeButton.title'),
      description: t('walkthrough.wordscopeButton.description'),
    },
    {
      id: 'edit-text-button',
      title: t('walkthrough.editTextButton.title'),
      description: t('walkthrough.editTextButton.description'),
    },
    {
      id: 'choose-translation',
      title: t('walkthrough.chooseTranslation.title'),
      description: t('walkthrough.chooseTranslation.description'),
    },
    {
      id: 'save-button',
      title: t('walkthrough.saveButton.title'),
      description: t('walkthrough.saveButton.description'),
    },
    {
      id: 'view-saved-button',
      title: t('walkthrough.viewSavedButton.title'),
      description: t('walkthrough.viewSavedButton.description'),
    },
    {
      id: 'edit-translation-button',
      title: t('walkthrough.editTranslationButton.title'),
      description: t('walkthrough.editTranslationButton.description'),
    },
    {
      id: 'edit-input-retranslate-button',
      title: t('walkthrough.editInputRetranslateButton.title'),
      description: t('walkthrough.editInputRetranslateButton.description'),
    },
    {
      id: 'final-save-prompt',
      title: t('walkthrough.finalSavePrompt.title'),
      description: t('walkthrough.finalSavePrompt.description'),
    },
    {
      id: 'congratulations',
      title: t('walkthrough.congratulations.title'),
      description: t('walkthrough.congratulations.description'),
    },
  ];

  // Initialize walkthrough hook for flashcard page
  const {
    isActive: isWalkthroughActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    startWalkthrough,
    nextStep,
    previousStep,
    skipWalkthrough,
    completeWalkthrough,
    registerStep,
    updateStepLayout,
  } = useWalkthrough(flashcardWalkthroughSteps);

  // Track if walkthrough has been started from params
  const walkthroughStartedRef = useRef(false);

  // Start walkthrough if param is set
  useEffect(() => {
    if (shouldStartWalkthrough && !walkthroughStartedRef.current && !isWalkthroughActive) {
      walkthroughStartedRef.current = true;
      // Small delay to ensure UI is rendered and refs are measured
      setTimeout(() => {
        startWalkthrough();
      }, 500);
    }
  }, [shouldStartWalkthrough, isWalkthroughActive]);

  // Register walkthrough steps with refs
  useEffect(() => {
    flashcardWalkthroughSteps.forEach(step => {
      registerStep({
        ...step,
        targetRef:
          step.id === 'translate-button' ? translateButtonRef :
          step.id === 'wordscope-button' ? wordscopeButtonRef :
          step.id === 'edit-text-button' ? editTextButtonRef :
          step.id === 'choose-translation' ? translateButtonRef :
          step.id === 'save-button' ? saveButtonRef :
          step.id === 'view-saved-button' ? viewSavedButtonRef :
          step.id === 'edit-translation-button' ? editTranslationButtonRef :
          step.id === 'edit-input-retranslate-button' ? editInputRetranslateButtonRef :
          step.id === 'final-save-prompt' ? saveButtonRef :
          step.id === 'congratulations' ? saveButtonRef :
          undefined,
      });
    });
  }, [registerStep]);

  // Measure button positions when walkthrough is active
  useEffect(() => {
    if (!isWalkthroughActive) return;

    const measureButton = (ref: React.RefObject<View>, stepId: string) => {
      if (ref.current) {
        ref.current.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            updateStepLayout(stepId, { x, y, width, height });
          }
        });
      }
    };

    // Small delay to ensure layout is complete
    setTimeout(() => {
      measureButton(translateButtonRef, 'translate-button');
      measureButton(wordscopeButtonRef, 'wordscope-button');
      measureButton(editTextButtonRef, 'edit-text-button');
      measureButton(translateButtonRef, 'choose-translation');
      measureButton(saveButtonRef, 'save-button');
      measureButton(viewSavedButtonRef, 'view-saved-button');
      measureButton(editTranslationButtonRef, 'edit-translation-button');
      measureButton(editInputRetranslateButtonRef, 'edit-input-retranslate-button');
      measureButton(saveButtonRef, 'final-save-prompt');
      measureButton(saveButtonRef, 'congratulations');
    }, 100);
  }, [isWalkthroughActive, updateStepLayout]);

  // Disable swipe-down gesture during final-save-prompt walkthrough step
  useEffect(() => {
    const shouldDisableGesture = isWalkthroughActive && currentStep?.id === 'final-save-prompt';
    navigation.setOptions({
      gestureEnabled: !shouldDisableGesture,
    });
  }, [isWalkthroughActive, currentStep?.id, navigation]);

  // Auto-scroll to save button when walkthrough reaches final-save-prompt step
  // (The initial save-button step scroll is handled in the translation completion effect for proper sequencing)
  useEffect(() => {
    if (isWalkthroughActive && textProcessed && currentStep?.id === 'final-save-prompt') {
      // For final-save-prompt, scroll to make the save button visible
      setHideWalkthroughOverlay(true);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
        setTimeout(() => {
          setHideWalkthroughOverlay(false);
        }, 400);
      }, 100);
    }
  }, [isWalkthroughActive, currentStep?.id, textProcessed]);

  // Show overlay and measure buttons when post-translation steps become active
  const postTranslationSteps = ['save-button', 'view-saved-button', 'edit-translation-button', 'edit-input-retranslate-button', 'final-save-prompt', 'congratulations'];
  
  // Helper function to measure all post-translation buttons
  const measureAllPostTranslationButtons = (retryCount = 0) => {
    const measureButton = (ref: React.RefObject<View>, stepId: string, needsRetry = false) => {
      if (ref.current) {
        ref.current.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            updateStepLayout(stepId, { x, y, width, height });
          } else if (needsRetry && retryCount < 5 && textProcessed) {
            // Retry measurement if button exists but not measured yet
            setTimeout(() => measureAllPostTranslationButtons(retryCount + 1), 200);
          }
        });
      } else if (needsRetry && retryCount < 5 && textProcessed) {
        // Retry measurement if button doesn't exist yet
        setTimeout(() => measureAllPostTranslationButtons(retryCount + 1), 200);
      }
    };

    // Save button needs special retry handling since it only appears after translation
    measureButton(saveButtonRef, 'save-button', true);
    measureButton(saveButtonRef, 'final-save-prompt', true);
    measureButton(saveButtonRef, 'congratulations', true);
    measureButton(viewSavedButtonRef, 'view-saved-button', false);
    measureButton(editTranslationButtonRef, 'edit-translation-button', false);
    measureButton(editInputRetranslateButtonRef, 'edit-input-retranslate-button', false);
  };

  // Measure buttons when post-translation step becomes active
  // Note: We DON'T show the overlay here for save-button step - that's handled by the translation completion effect
  // to ensure proper scroll-then-show sequencing
  useEffect(() => {
    if (isWalkthroughActive && currentStep?.id && postTranslationSteps.includes(currentStep.id)) {
      // Only show overlay for non-save-button steps here
      // save-button overlay visibility is controlled by the translation completion effect for proper sequencing
      if (currentStep.id !== 'save-button') {
        setHideWalkthroughOverlay(false);
      }

      // Small delay to ensure buttons are rendered (especially after translation completes)
      setTimeout(() => measureAllPostTranslationButtons(), textProcessed ? 100 : 300);
    }
  }, [isWalkthroughActive, currentStep?.id, updateStepLayout]);

  // Advance to save-button step when translation completes AND results are ACTUALLY DISPLAYED (if we're on a translation step)
  // IMPORTANT: We must wait for isLoading to be false, otherwise the results/buttons aren't rendered yet
  useEffect(() => {
    if (isWalkthroughActive && textProcessed && !isLoading && currentStep?.id) {
      const translationSteps = ['translate-button', 'wordscope-button', 'choose-translation'];
      if (translationSteps.includes(currentStep.id)) {
        // Check if results are actually displayed (translatedText for translate, scopeAnalysis for wordscope)
        const hasResults = translatedText || scopeAnalysis;
        
        if (hasResults && !walkthroughTransitionInProgressRef.current) {
          // Mark transition as in progress to prevent multiple executions
          walkthroughTransitionInProgressRef.current = true;
          
          // Results are now rendered (isLoading is false) - sequence the transition properly:
          // 1. Keep overlay hidden
          setHideWalkthroughOverlay(true);
          
          // 2. Wait a moment for layout to settle, then scroll to bottom
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
            
            // 3. After scroll animation completes, show overlay and advance step
            setTimeout(() => {
              setHideWalkthroughOverlay(false);
              nextStep();
              // Reset the flag after transition completes
              walkthroughTransitionInProgressRef.current = false;
            }, 600); // Wait for scroll animation to complete
          }, 200); // Wait for layout to settle
        }
      }
    }
  }, [textProcessed, translatedText, scopeAnalysis, isWalkthroughActive, currentStep?.id, isLoading]);

  // Re-measure buttons when textProcessed becomes true (translation completes) and we're on a post-translation step
  useEffect(() => {
    if (isWalkthroughActive && textProcessed && currentStep?.id && postTranslationSteps.includes(currentStep.id)) {
      // Re-measure when translation completes and we're on a post-translation step
      setTimeout(() => measureAllPostTranslationButtons(), 100);
    }
  }, [textProcessed, isWalkthroughActive, currentStep?.id]);

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

  // Load API limits on mount and when subscription changes
  useEffect(() => {
    const loadAPILimits = async () => {
      setIsLoadingLimits(true);
      try {
        // Get subscription plan with proper source of truth handling
        const subscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
        logger.log(`[Flashcards] Loading API limits with plan: ${subscriptionPlan}`);
        const rateLimitStatus = await apiLogger.checkRateLimitStatus(subscriptionPlan);
        setApiCallsRemaining(rateLimitStatus.apiCallsRemaining);
        logger.log(`[Flashcards] API calls remaining: ${rateLimitStatus.apiCallsRemaining}, daily limit: ${rateLimitStatus.dailyLimit}`);
      } catch (error) {
        logger.error('Error loading API limits:', error);
        // Default to allowing if check fails
        setApiCallsRemaining(Number.MAX_SAFE_INTEGER);
      } finally {
        setIsLoadingLimits(false);
      }
    };

    loadAPILimits();
  }, [subscription]);

  // Helper to check if API limit is exhausted (unified limit for translate & wordscope)
  const isAPILimitExhausted = apiCallsRemaining <= 0;
  const canUseTranslate = apiCallsRemaining > 0;
  const canUseWordscope = apiCallsRemaining > 0;

  // Main useEffect to process the initial text when component loads
  // Only auto-process if text didn't come from OCR (no imageUri)
  useEffect(() => {
    if (cleanedText && !textProcessed && !isLoading && !isManualOperation && !imageUri) {
      // Check if useScope param is set to trigger scope analysis
      if (useScope) {
        handleScopeAndTranslate(cleanedText);
      } else {
        processTextWithClaude(cleanedText);
      }
    }
  }, [cleanedText, textProcessed, isLoading, isManualOperation, imageUri, useScope]);

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

  const runTranslationWithAutoSwitch = async (includeScope: boolean, textToTranslate: string): Promise<ClaudeResponse> => {
    // Preserve the original target language to prevent accidental swaps during retries
    const originalTargetLanguage = targetLanguage;
    const originalSourceLanguage = forcedDetectionLanguage;
    
    // Track what source/target were actually used for successful translation
    let usedSourceLang = originalSourceLanguage;
    let usedTargetLang = originalTargetLanguage;
    
    // Get the subscription plan from context to pass to API functions
    // This avoids the issue where fetchSubscriptionStatus() returns null inside API functions
    const currentSubscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
    logger.log(`📊 [API Retry Tracker] Using subscription plan: ${currentSubscriptionPlan}`);
    
    // RETRY COUNTER LOGGING: Track API calls per user action
    let apiCallCount = 0;
    let retryCount = 0;
    const retryReasons: string[] = [];
    
    const attempt = async (sourceLang: string, targetLang: string, attemptNumber: number, reason?: string) => {
      apiCallCount++;
      if (attemptNumber > 1) {
        retryCount++;
        retryReasons.push(reason || `Attempt ${attemptNumber}`);
        logger.log(`🔄 [API Retry Tracker] Retry #${retryCount} (Total API calls: ${apiCallCount}) - Reason: ${reason || 'Unknown'}`);
      } else {
        logger.log(`📊 [API Retry Tracker] Initial translation attempt (Total API calls: ${apiCallCount})`);
      }
      
      if (includeScope) {
        return processWithClaudeAndScope(textToTranslate, targetLang, sourceLang, progressCallback, currentSubscriptionPlan);
      }
      return processWithClaude(textToTranslate, targetLang, sourceLang, progressCallback, false, currentSubscriptionPlan);
    };

    let result = await attempt(originalSourceLanguage, originalTargetLanguage, 1);

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
        result = await attempt(detectedCode, originalTargetLanguage, 2, `Third language detected: ${detectedCode} → ${originalTargetLanguage}`);
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
            result = await attempt(originalTargetLanguage, originalSourceLanguage, 3, `Second detection: target language swap ${originalTargetLanguage} → ${originalSourceLanguage}`);
            usedSourceLang = originalTargetLanguage;
            usedTargetLang = originalSourceLanguage;
          }
          // Case 1a: Second detection matches source → retry original (detection was wrong, text is actually in source)
          else if (secondDetectedCode === originalSourceLanguage) {
            logger.log(`🔄 [Flashcards] Text is actually in source language (${originalSourceLanguage}), retrying with original settings: ${originalSourceLanguage} → ${originalTargetLanguage}`);
            setDetectedLanguage(AVAILABLE_LANGUAGES[originalSourceLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'unknown');
            result = await attempt(originalSourceLanguage, originalTargetLanguage, 3, `Second detection: source language confirmed ${originalSourceLanguage} → ${originalTargetLanguage}`);
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
        result = await attempt(originalTargetLanguage, originalSourceLanguage, 2, `Target language swap: ${originalTargetLanguage} → ${originalSourceLanguage}`);
        usedSourceLang = originalTargetLanguage;
        usedTargetLang = originalSourceLanguage;
      }
      // Case 3: No detected code available - fall back to simple swap
      else {
        logger.log(`🔄 [Flashcards] No detected code, trying simple swap: ${originalTargetLanguage} → ${originalSourceLanguage}`);
        setDetectedLanguage(AVAILABLE_LANGUAGES[originalTargetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'unknown');
        result = await attempt(originalTargetLanguage, originalSourceLanguage, 2, `Fallback swap: ${originalTargetLanguage} → ${originalSourceLanguage}`);
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

    // RETRY COUNTER LOGGING: Final summary
    if (apiCallCount > 1) {
      logger.warn(`⚠️ [API Retry Tracker] FINAL SUMMARY - Total API calls for this translation: ${apiCallCount} (${retryCount} retries)`);
      logger.warn(`⚠️ [API Retry Tracker] Retry reasons: ${retryReasons.join(', ')}`);
      logger.warn(`⚠️ [API Retry Tracker] This single user action consumed ${apiCallCount}x the expected API usage!`);
    } else {
      logger.log(`✅ [API Retry Tracker] Translation completed with 1 API call (no retries needed)`);
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
      
      const result = await runTranslationWithAutoSwitch(false, text);
      
      // Update API limit after successful call
      if (result.translatedText) {
        try {
          const subscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
          const rateLimitStatus = await apiLogger.checkRateLimitStatus(subscriptionPlan);
          setApiCallsRemaining(rateLimitStatus.apiCallsRemaining);
        } catch (error) {
          logger.error('Error updating API limit:', error);
        }
      }
      
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
        setError(result.translatedText || 'Failed to process text. Please try changing your language settings.');
        setProcessingFailed(true);
        
        // For errors, complete immediately
        logger.log('❌ [Flashcards] Processing failed - setting isLoading to false immediately');
        setIsLoading(false);
        setIsManualOperation(false);
      }
    } catch (err) {
      logger.log('Error processing with Claude:', err);
      // Show specific error message if available (e.g., text too long, language mismatch)
      const errorMessage = err instanceof Error ? err.message : 'Failed to process text. Please try changing your language settings.';
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
    
    // If walkthrough is active on save-button step, complete the walkthrough
    if (isWalkthroughActive && currentStep?.id === 'save-button') {
      completeWalkthrough();
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

      // If walkthrough is active and we just saved (from final-save-prompt or save-button step), show congratulations
      if (isWalkthroughActive && (currentStep?.id === 'final-save-prompt' || currentStep?.id === 'save-button')) {
        // Advance to congratulations step
        setHideWalkthroughOverlay(false);
        nextStep();
        // Don't show the regular alert during walkthrough - let the congratulations overlay handle it
        return;
      }

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
    // Note: Edit text button doesn't advance the walkthrough - user should press Next or use translate/wordscope
  };

  // Function to show upgrade alert for API limits
  const showAPILimitUpgradeAlert = (limitType: 'translate' | 'wordscope') => {
    const limitName = limitType === 'translate' ? 'translate' : 'WordScope';
    Alert.alert(
      t('subscription.limit.title'),
      `You've reached your daily ${limitName} API limit. Upgrade to Premium for unlimited ${limitName} calls.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('subscription.limit.upgradeToPremium'), 
          style: 'default',
          onPress: async () => {
            const success = await purchaseSubscription(PRODUCT_IDS.PREMIUM_MONTHLY);
            if (success) {
              Alert.alert(t('common.success'), t('subscription.test.premiumActivated'));
              // Limits will refresh automatically via subscription useEffect
              // since purchaseSubscription updates the subscription context
            }
          }
        }
      ]
    );
  };

  // Function to handle translate button
  const handleTranslate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!editedText) {
      Alert.alert(t('common.error'), t('flashcard.edit.enterText'));
      return;
    }
    
    // Check translate limit before processing
    if (!canUseTranslate) {
      showAPILimitUpgradeAlert('translate');
      return;
    }
    
    processTextWithClaude(editedText);
    
    // If walkthrough is active, hide overlay while processing (will advance to save-button when textProcessed becomes true)
    if (isWalkthroughActive && (currentStep?.id === 'translate-button' || currentStep?.id === 'choose-translation')) {
      setHideWalkthroughOverlay(true); // Hide overlay while processing
      walkthroughTransitionInProgressRef.current = false; // Reset to allow fresh transition
    }
  };

  // Function to handle scope and translate button
  const handleScopeAndTranslate = async (textToProcess?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = textToProcess || editedText;
    if (!text) {
      Alert.alert(t('common.error'), t('flashcard.edit.enterText'));
      return;
    }
    
    // Check wordscope limit before processing
    if (!canUseWordscope) {
      showAPILimitUpgradeAlert('wordscope');
      return;
    }
    
    // If walkthrough is active, hide overlay while processing (will advance to save-button when textProcessed becomes true)
    if (isWalkthroughActive && (currentStep?.id === 'wordscope-button' || currentStep?.id === 'choose-translation')) {
      setHideWalkthroughOverlay(true); // Hide overlay while processing
      walkthroughTransitionInProgressRef.current = false; // Reset to allow fresh transition
    }
    
    logger.log('🌟 [Flashcards] Starting Scope and Translate with Claude API');
    setIsLoading(true);
    setError('');
    setTextProcessed(false);
    setProcessingProgress(0);
    setProcessingFailed(false);
    
    try {
      // Check if the text contains Japanese, Chinese, Korean, Russian, Arabic, Hindi, Esperanto, Thai characters
      const hasJapanese = containsJapanese(text);
      const hasChinese = containsChinese(text);
      const hasKorean = containsKoreanText(text);
      const hasRussian = containsRussianText(text);
      const hasArabic = containsArabicText(text);
      const hasHindi = containsHindiText(text);
      const hasEsperanto = containsEsperantoText(text);
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
      const result = await runTranslationWithAutoSwitch(true, text);
      
      // Update API limit after successful call
      if (result.translatedText) {
        try {
          const subscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
          const rateLimitStatus = await apiLogger.checkRateLimitStatus(subscriptionPlan);
          setApiCallsRemaining(rateLimitStatus.apiCallsRemaining);
        } catch (error) {
          logger.error('Error updating API limit:', error);
        }
      }
      
      // Check if we got valid results back
      if (result.translatedText) {
        // Validate scopeAnalysis if it exists (for WordScope calls)
        if (result.scopeAnalysis) {
          // Check if scopeAnalysis looks like raw code/JSON (malformed output)
          const scopeAnalysis = result.scopeAnalysis;
          const looksLikeCode = scopeAnalysis.includes('{') && scopeAnalysis.includes('"') && 
                               (scopeAnalysis.match(/\{[^}]*\}/g)?.length || 0) > 3;
          const isTruncated = scopeAnalysis.length > 0 && scopeAnalysis.length < 50 && 
                             !scopeAnalysis.includes(' ') && scopeAnalysis.includes('{');
          
          if (looksLikeCode || isTruncated) {
            logger.error('[Flashcards] Scope analysis appears to be malformed/code, throwing error');
            throw new Error('Scope analysis output is malformed. Please try again or check your language settings.');
          }
          
          setScopeAnalysis(scopeAnalysis);
        } else {
          setScopeAnalysis('');
        }
        
        setTranslatedText(result.translatedText);
        
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
        setError(result.translatedText || 'Failed to process text. Please try changing your language settings.');
        setProcessingFailed(true);
        setIsLoading(false);
        setIsManualOperation(false);
      }
    } catch (err) {
      logger.error('Error processing with Claude Scope:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to process text. Please try changing your language settings.';
      
      // Show user-friendly error message
      const userFriendlyMessage = errorMessage.includes('Scope analysis') || errorMessage.includes('malformed')
        ? 'The analysis could not be completed properly. Please check your language settings and try again.'
        : errorMessage;
      
      setError(userFriendlyMessage);
      setProcessingFailed(true);
      setIsLoading(false);
      setIsManualOperation(false);
      
      // Clear any partial results to prevent showing broken output
      setTranslatedText('');
      setScopeAnalysis('');
      setFuriganaText('');
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
          ref={scrollViewRef}
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
              <WalkthroughTarget
                targetRef={editTextButtonRef}
                stepId="edit-text-button"
                currentStepId={currentStep?.id}
                activeIds={['choose-translation']}
                isWalkthroughActive={isWalkthroughActive}
                style={isWalkthroughActive && currentStep?.id === 'edit-text-button' ? styles.highlightedButtonWrapper : undefined}
              >
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={handleEditText}
                  disabled={isWalkthroughActive && currentStep?.id !== 'edit-text-button' && currentStep?.id !== 'choose-translation'}
                >
                  {/* Main gradient background */}
                  <LinearGradient
                    colors={isWalkthroughActive && currentStep?.id === 'edit-text-button'
                      ? ['rgba(255, 255, 0, 0.4)', 'rgba(255, 200, 0, 0.5)']
                      : ['rgba(140, 140, 140, 0.35)', 'rgba(100, 100, 100, 0.45)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  
                  {/* Glass highlight overlay (top shine) */}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 0.6 }}
                    style={styles.glassOverlay}
                  />
                  
                  {/* Inner glow border */}
                  <View style={styles.innerBorder} />
                  
                  {/* Button content */}
                  <View style={styles.buttonContent}>
                    <Ionicons 
                      name="pencil" 
                      size={20} 
                      color={isWalkthroughActive && currentStep?.id === 'edit-text-button' ? '#000' : '#ffffff'} 
                      style={styles.buttonIcon} 
                    />
                    <Text style={[
                      styles.buttonText,
                      isWalkthroughActive && currentStep?.id === 'edit-text-button' ? { color: '#000' } : null
                    ]}>
                      Edit Text
                    </Text>
                  </View>
                </TouchableOpacity>
              </WalkthroughTarget>
              
              <WalkthroughTarget
                targetRef={wordscopeButtonRef}
                stepId="wordscope-button"
                currentStepId={currentStep?.id}
                activeIds={['choose-translation']}
                isWalkthroughActive={isWalkthroughActive}
                style={isWalkthroughActive && (currentStep?.id === 'wordscope-button' || currentStep?.id === 'choose-translation') ? styles.highlightedButtonWrapper : undefined}
              >
                <TouchableOpacity
                  style={[
                    styles.scopeAndTranslateButton,
                    !canUseWordscope ? styles.disabledButton : null,
                    isAPILimitExhausted ? styles.darkDisabledButton : null
                  ]}
                  onPress={() => !canUseWordscope ? showAPILimitUpgradeAlert('wordscope') : handleScopeAndTranslate()}
                  disabled={isLoadingLimits || (isWalkthroughActive && currentStep?.id !== 'wordscope-button' && currentStep?.id !== 'choose-translation')}
                >
                  {/* Main gradient background */}
                  <LinearGradient
                    colors={isWalkthroughActive && (currentStep?.id === 'wordscope-button' || currentStep?.id === 'choose-translation')
                      ? ['rgba(255, 255, 0, 0.4)', 'rgba(255, 200, 0, 0.5)']
                      : ['rgba(140, 140, 140, 0.35)', 'rgba(100, 100, 100, 0.45)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  
                  {/* Glass highlight overlay (top shine) */}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 0.6 }}
                    style={styles.glassOverlay}
                  />
                  
                  {/* Inner glow border */}
                  <View style={styles.innerBorder} />
                  
                  {/* Button content */}
                  <View style={styles.buttonContent}>
                    <View style={styles.dualIconContainer}>
                      {!canUseWordscope ? (
                        <Ionicons name="lock-closed" size={18} color={COLORS.darkGray} />
                      ) : (
                        <>
                          <FontAwesome5 
                            name="microscope" 
                            size={16} 
                            color={isWalkthroughActive && (currentStep?.id === 'wordscope-button' || currentStep?.id === 'choose-translation') ? '#000' : '#ffffff'} 
                          />
                          <Ionicons 
                            name="language" 
                            size={16} 
                            color={isWalkthroughActive && (currentStep?.id === 'wordscope-button' || currentStep?.id === 'choose-translation') ? '#000' : '#ffffff'} 
                          />
                        </>
                      )}
                    </View>
                    <Text style={[
                      styles.buttonText, 
                      !canUseWordscope ? { color: COLORS.darkGray } : null,
                      isWalkthroughActive && (currentStep?.id === 'wordscope-button' || currentStep?.id === 'choose-translation') ? { color: '#000' } : null
                    ]}>
                      {!canUseWordscope ? 'Locked' : 'Wordscope'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </WalkthroughTarget>
              
              <WalkthroughTarget
                targetRef={translateButtonRef}
                stepId="translate-button"
                currentStepId={currentStep?.id}
                activeIds={['choose-translation']}
                isWalkthroughActive={isWalkthroughActive}
                style={isWalkthroughActive && (currentStep?.id === 'translate-button' || currentStep?.id === 'choose-translation') ? styles.highlightedButtonWrapper : undefined}
              >
                <TouchableOpacity
                  style={[
                    styles.translateButton,
                    !canUseTranslate ? styles.disabledButton : null,
                    isAPILimitExhausted ? styles.darkDisabledButton : null
                  ]}
                  onPress={() => !canUseTranslate ? showAPILimitUpgradeAlert('translate') : handleTranslate()}
                  disabled={isLoadingLimits || (isWalkthroughActive && currentStep?.id !== 'translate-button' && currentStep?.id !== 'choose-translation')}
                >
                  {/* Main gradient background */}
                  <LinearGradient
                    colors={isWalkthroughActive && (currentStep?.id === 'translate-button' || currentStep?.id === 'choose-translation')
                      ? ['rgba(255, 255, 0, 0.4)', 'rgba(255, 200, 0, 0.5)']
                      : ['rgba(140, 140, 140, 0.35)', 'rgba(100, 100, 100, 0.45)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  
                  {/* Glass highlight overlay (top shine) */}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 0.6 }}
                    style={styles.glassOverlay}
                  />
                  
                  {/* Inner glow border */}
                  <View style={styles.innerBorder} />
                  
                  {/* Button content */}
                  <View style={styles.buttonContent}>
                    <Ionicons 
                      name={!canUseTranslate ? "lock-closed" : "language"} 
                      size={20} 
                      color={!canUseTranslate ? COLORS.darkGray : (isWalkthroughActive && (currentStep?.id === 'translate-button' || currentStep?.id === 'choose-translation') ? '#000' : '#ffffff')} 
                      style={styles.buttonIcon} 
                    />
                    <Text style={[
                      styles.buttonText, 
                      !canUseTranslate ? { color: COLORS.darkGray } : null,
                      isWalkthroughActive && (currentStep?.id === 'translate-button' || currentStep?.id === 'choose-translation') ? { color: '#000' } : null
                    ]}>
                      {!canUseTranslate ? 'Locked' : 'Translate'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </WalkthroughTarget>
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
                    // Get translations for target language
                    const targetT = i18next.getFixedT(actualTargetLanguage || targetLanguage, 'translation');
                    const localizedScopeAnalysis = localizeScopeAnalysisHeadings(scopeAnalysis, {
                      grammar: targetT('flashcard.wordscope.grammar'),
                      examples: targetT('flashcard.wordscope.examples'),
                      commonMistake: targetT('flashcard.wordscope.commonMistake'),
                      commonContext: targetT('flashcard.wordscope.commonContext'),
                      alternativeExpressions: targetT('flashcard.wordscope.alternativeExpressions'),
                    });
                    return (
                      <View style={styles.resultContainer} key="wordscope">
                        <Text style={styles.sectionTitle}>Wordscope</Text>
                        <Text style={styles.scopeAnalysisText} numberOfLines={0}>{localizedScopeAnalysis}</Text>
                      </View>
                    );
                  })()}

                  {/* 2x2 Button Grid */}
                  {textProcessed && translatedText && (
                    <View style={styles.buttonContainer}>
                      {/* Top Row */}
                      <View style={styles.gridRow}>
                        <WalkthroughTarget
                          targetRef={viewSavedButtonRef}
                          stepId="view-saved-button"
                          currentStepId={currentStep?.id}
                          isWalkthroughActive={isWalkthroughActive}
                          style={StyleSheet.flatten([
                            { flex: 1 },
                            isWalkthroughActive && currentStep?.id === 'view-saved-button' && styles.highlightedButtonWrapper
                          ])}
                        >
                          <TouchableOpacity
                            style={[styles.gridButton]}
                            onPress={handleViewSavedFlashcards}
                            disabled={isWalkthroughActive && currentStep?.id !== 'view-saved-button'}
                          >
                            {/* Main gradient background */}
                            <LinearGradient
                              colors={isWalkthroughActive && currentStep?.id === 'view-saved-button'
                                ? ['rgba(255, 255, 0, 0.4)', 'rgba(255, 200, 0, 0.5)']
                                : ['rgba(100, 116, 139, 0.35)', 'rgba(71, 85, 105, 0.45)']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                            
                            {/* Glass highlight overlay (top shine) */}
                            <LinearGradient
                              colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 0.6 }}
                              style={styles.glassOverlay}
                            />
                            
                            {/* Inner glow border */}
                            <View style={styles.innerBorder} />
                            
                            {/* Button content */}
                            <View style={styles.gridButtonContent}>
                              <Ionicons 
                                name="albums-outline" 
                                size={18} 
                                color={isWalkthroughActive && currentStep?.id === 'view-saved-button' ? '#000' : '#ffffff'} 
                                style={styles.buttonIcon} 
                              />
                              <Text style={[
                                styles.gridButtonText,
                                isWalkthroughActive && currentStep?.id === 'view-saved-button' ? { color: '#000' } : null
                              ]}>{t('flashcard.save.viewSaved')}</Text>
                            </View>
                          </TouchableOpacity>
                        </WalkthroughTarget>

                        <WalkthroughTarget
                          targetRef={saveButtonRef}
                          stepId="save-button"
                          currentStepId={currentStep?.id}
                          activeIds={['final-save-prompt']}
                          isWalkthroughActive={isWalkthroughActive}
                          style={StyleSheet.flatten([
                            { flex: 1 },
                            isWalkthroughActive && (currentStep?.id === 'save-button' || currentStep?.id === 'final-save-prompt') && styles.highlightedButtonWrapper
                          ])}
                        >
                          <TouchableOpacity
                            style={[
                              styles.gridButton,
                              styles.saveGridButton,
                              isSaved ? styles.savedButton : null,
                              (isSaving || !canCreateFlashcard) ? styles.disabledButton : null,
                              !canCreateFlashcard ? styles.darkDisabledButton : null,
                            ]}
                            onPress={handleShowDeckSelector}
                            disabled={isSaving || isSaved || (isWalkthroughActive && currentStep?.id !== 'save-button' && currentStep?.id !== 'final-save-prompt')}
                          >
                            {/* Main gradient background */}
                            {isSaved ? (
                              <LinearGradient
                                colors={['rgba(255, 149, 0, 0.4)', 'rgba(255, 149, 0, 0.5)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFill}
                              />
                            ) : isWalkthroughActive && (currentStep?.id === 'save-button' || currentStep?.id === 'final-save-prompt') ? (
                              <LinearGradient
                                colors={['rgba(255, 255, 0, 0.4)', 'rgba(255, 200, 0, 0.5)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFill}
                              />
                            ) : (isSaving || !canCreateFlashcard) ? (
                              <LinearGradient
                                colors={['rgba(51, 65, 85, 0.5)', 'rgba(30, 41, 59, 0.6)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFill}
                              />
                            ) : (
                              <LinearGradient
                                colors={['rgba(100, 116, 139, 0.35)', 'rgba(71, 85, 105, 0.45)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFill}
                              />
                            )}
                            
                            {/* Glass highlight overlay (top shine) - only if not disabled */}
                            {(!isSaving && canCreateFlashcard) && (
                              <LinearGradient
                                colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 0.6 }}
                                style={styles.glassOverlay}
                              />
                            )}
                            
                            {/* Inner glow border */}
                            <View style={styles.innerBorder} />
                            
                            {/* Button content */}
                            <View style={styles.gridButtonContent}>
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
                                    size={18} 
                                    color={!canCreateFlashcard ? COLORS.darkGray : (isWalkthroughActive && (currentStep?.id === 'save-button' || currentStep?.id === 'final-save-prompt') ? '#000' : '#ffffff')}
                                    style={styles.buttonIcon} 
                                  />
                                  <Text style={[
                                    styles.gridButtonText,
                                    !canCreateFlashcard ? { color: COLORS.darkGray } : null,
                                    isWalkthroughActive && (currentStep?.id === 'save-button' || currentStep?.id === 'final-save-prompt') ? { color: '#000' } : null
                                  ]}>
                                    {isSaved ? t('flashcard.save.savedAsFlashcard') : 
                                     !canCreateFlashcard ? `Limit reached (${remainingFlashcards} left)` :
                                     t('flashcard.save.saveAsFlashcard')}
                                  </Text>
                                </>
                              )}
                            </View>
                          </TouchableOpacity>
                        </WalkthroughTarget>
                      </View>

                      {/* Bottom Row */}
                      <View style={styles.gridRow}>
                        <WalkthroughTarget
                          targetRef={editTranslationButtonRef}
                          stepId="edit-translation-button"
                          currentStepId={currentStep?.id}
                          isWalkthroughActive={isWalkthroughActive}
                          style={StyleSheet.flatten([
                            { flex: 1 },
                            isWalkthroughActive && currentStep?.id === 'edit-translation-button' && styles.highlightedButtonWrapper
                          ])}
                        >
                          <TouchableOpacity 
                            style={[styles.gridButton, styles.editTranslationGridButton]} 
                            onPress={handleEditTranslation}
                            disabled={isWalkthroughActive && currentStep?.id !== 'edit-translation-button'}
                          >
                            {/* Main gradient background - green or yellow if highlighted */}
                            <LinearGradient
                              colors={isWalkthroughActive && currentStep?.id === 'edit-translation-button'
                                ? ['rgba(255, 255, 0, 0.4)', 'rgba(255, 200, 0, 0.5)']
                                : ['rgba(44, 182, 125, 0.4)', 'rgba(34, 151, 103, 0.5)']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                            
                            {/* Glass highlight overlay (top shine) */}
                            <LinearGradient
                              colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 0.6 }}
                              style={styles.glassOverlay}
                            />
                            
                            {/* Inner glow border */}
                            <View style={styles.innerBorder} />
                            
                            {/* Button content */}
                            <View style={styles.gridButtonContent}>
                              <Ionicons 
                                name="pencil" 
                                size={18} 
                                color={isWalkthroughActive && currentStep?.id === 'edit-translation-button' ? '#000' : '#ffffff'} 
                                style={styles.buttonIcon} 
                              />
                              <Text style={[
                                styles.gridButtonText,
                                isWalkthroughActive && currentStep?.id === 'edit-translation-button' ? { color: '#000' } : null
                              ]}>{t('flashcard.edit.editTranslation')}</Text>
                            </View>
                          </TouchableOpacity>
                        </WalkthroughTarget>
                        
                        <WalkthroughTarget
                          targetRef={editInputRetranslateButtonRef}
                          stepId="edit-input-retranslate-button"
                          currentStepId={currentStep?.id}
                          isWalkthroughActive={isWalkthroughActive}
                          style={StyleSheet.flatten([
                            { flex: 1 },
                            isWalkthroughActive && currentStep?.id === 'edit-input-retranslate-button' && styles.highlightedButtonWrapper
                          ])}
                        >
                          <TouchableOpacity 
                            style={[styles.gridButton, styles.editInputGridButton]} 
                            onPress={handleEditInputAndRetranslate}
                            disabled={isWalkthroughActive && currentStep?.id !== 'edit-input-retranslate-button'}
                          >
                            {/* Main gradient background - red or yellow if highlighted */}
                            <LinearGradient
                              colors={isWalkthroughActive && currentStep?.id === 'edit-input-retranslate-button'
                                ? ['rgba(255, 255, 0, 0.4)', 'rgba(255, 200, 0, 0.5)']
                                : ['rgba(255, 107, 107, 0.4)', 'rgba(220, 38, 38, 0.5)']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                            
                            {/* Glass highlight overlay (top shine) */}
                            <LinearGradient
                              colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 0.6 }}
                              style={styles.glassOverlay}
                            />
                            
                            {/* Inner glow border */}
                            <View style={styles.innerBorder} />
                            
                            {/* Button content */}
                            <View style={styles.gridButtonContent}>
                              <Ionicons 
                                name="refresh" 
                                size={18} 
                                color={isWalkthroughActive && currentStep?.id === 'edit-input-retranslate-button' ? '#000' : '#ffffff'} 
                                style={styles.buttonIcon} 
                              />
                              <Text style={[
                                styles.gridButtonText,
                                isWalkthroughActive && currentStep?.id === 'edit-input-retranslate-button' ? { color: '#000' } : null
                              ]}>{t('flashcard.edit.editInputRetranslate')}</Text>
                            </View>
                          </TouchableOpacity>
                        </WalkthroughTarget>
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

        {/* Walkthrough Overlay */}
        <WalkthroughOverlay
          visible={isWalkthroughActive && !hideWalkthroughOverlay}
          currentStep={currentStep}
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
          onNext={() => {
            // If on choose-translation step, just hide the overlay instead of advancing
            if (currentStep?.id === 'choose-translation') {
              setHideWalkthroughOverlay(true);
            } else if (currentStep?.id === 'final-save-prompt') {
              // Hide overlay so user can press the save button
              setHideWalkthroughOverlay(true);
            } else if (currentStep?.id === 'congratulations') {
              // Complete the walkthrough when they press Done on congratulations
              completeWalkthrough();
            } else {
              nextStep();
            }
          }}
          onPrevious={previousStep}
          onSkip={skipWalkthrough}
          onDone={completeWalkthrough}
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
    borderRadius: 8,
    width: 90,
    height: 90,
    overflow: 'hidden',
    // Glassmorphism border
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    // Soft shadow for depth
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Background blur simulation (via semi-transparent background)
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  scopeAndTranslateButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    width: 90,
    height: 90,
    overflow: 'hidden',
    // Glassmorphism border
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    // Soft shadow for depth
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Background blur simulation (via semi-transparent background)
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  dualIconContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  translateButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    width: 90,
    height: 90,
    overflow: 'hidden',
    // Glassmorphism border
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    // Soft shadow for depth
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Background blur simulation (via semi-transparent background)
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  glassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    borderRadius: 8,
  },
  innerBorder: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 7,
    pointerEvents: 'none',
  },
  buttonContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
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
    // Gradient handled in component
  },
  disabledButton: {
    opacity: 0.8,
    // Gradient handled in component
  },
  darkDisabledButton: {
    opacity: 0.8,
    // Gradient handled in component
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
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
    overflow: 'hidden',
    // Glassmorphism border
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    // Soft shadow for depth
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Background blur simulation (via semi-transparent background)
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
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
    // Gradient handled in component
  },
  editTranslationGridButton: {
    // Gradient handled in component
  },
  editInputGridButton: {
    // Gradient handled in component
  },
  gridButtonContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
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