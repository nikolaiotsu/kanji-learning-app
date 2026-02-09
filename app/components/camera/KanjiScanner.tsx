import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Dimensions, Animated, ScrollView, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons, FontAwesome5, AntDesign, FontAwesome6, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import CameraButton from './CameraButton';
import ImageHighlighter from '../shared/ImageHighlighter';
import { useKanjiRecognition } from '../../hooks/useKanjiRecognition';
import { useAuth } from '../../context/AuthContext';
import { useOCRCounter } from '../../context/OCRCounterContext';
import { useFlashcardCounter } from '../../context/FlashcardCounterContext';
import { useSwipeCounter } from '../../context/SwipeCounterContext';
import { useSettings, DETECTABLE_LANGUAGES } from '../../context/SettingsContext';
import { useNetworkState } from '../../services/networkManager';
import { apiLogger } from '../../services/apiUsageLogger';
import { getCurrentSubscriptionPlan } from '../../services/receiptValidationService';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { PRODUCT_IDS } from '../../constants/config';
import { CapturedImage, TextAnnotation, VisionApiResponse } from '../../../types';
import { captureRef } from 'react-native-view-shot';
import { detectJapaneseText, convertToOriginalImageCoordinates, cropImageToRegion, resizeImageToRegion } from '../../services/visionApi';
import { imageUriToBase64DataUri, convertStrokesToCropRelative } from '../../services/imageMaskUtils';
import MaskedImageCapture from '../shared/MaskedImageCapture';
import { ImageHighlighterRef, ImageHighlighterRotationState } from '../shared/ImageHighlighter';
import * as ImageManipulator from 'expo-image-manipulator';
import RandomCardReviewer from '../flashcards/RandomCardReviewer';
import { useFocusEffect } from 'expo-router';
import * as ProcessImage from '../../services/ProcessImage';
import PokedexButton from '../shared/PokedexButton';
import WalkthroughTarget from '../shared/WalkthroughTarget';
import { useSubscription } from '../../context/SubscriptionContext';
import MemoryManager from '../../services/memoryManager';
import * as FileSystem from 'expo-file-system';
import WalkthroughOverlay from '../shared/WalkthroughOverlay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWalkthrough, WalkthroughStep } from '../../hooks/useWalkthrough';
import { useOnboardingProgress } from '../../context/OnboardingProgressContext';
import { useAppReady } from '../../context/AppReadyContext';
import { ensureMeasuredThenAdvance, measureButton } from '../../utils/walkthroughUtils';
import APIUsageEnergyBar from '../shared/APIUsageEnergyBar';
import { hasEnergyBarsRemaining } from '../../utils/walkthroughEnergyCheck';

import { logger } from '../../utils/logger';
import * as Haptics from 'expo-haptics';
interface KanjiScannerProps {
  onCardSwipe?: () => void;
  onContentReady?: (isReady: boolean) => void;
  onWalkthroughComplete?: () => void;
  /** When false, walkthrough will not auto-start (e.g. until post-onboarding loading overlay is dismissed). */
  canStartWalkthrough?: boolean;
  /** When true, block touches until the walkthrough modal appears (prevents tapping buttons in the brief window). */
  blockTouchesBeforeWalkthrough?: boolean;
  /** When true, sign-in prompt modal is visible - swipe instructions should wait */
  isSignInPromptVisible?: boolean;
}

export default function KanjiScanner({ onCardSwipe, onContentReady, onWalkthroughComplete, canStartWalkthrough = true, blockTouchesBeforeWalkthrough = false, isSignInPromptVisible = false }: KanjiScannerProps) {
  logger.log('🎬 [KanjiScanner] Component render, onContentReady callback:', !!onContentReady);
  
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isSplashVisible } = useAppReady();
  
  // Calculate responsive dimensions based on actual device safe areas
  const { height: SCREEN_HEIGHT } = Dimensions.get('window');
  const BUTTON_HEIGHT = 65;
  const BUTTON_BOTTOM_POSITION = 25;
  const BUTTON_ROW_HEIGHT = BUTTON_HEIGHT + BUTTON_BOTTOM_POSITION + insets.bottom;
  const BOTTOM_CLEARANCE = 50;
  const REVIEWER_TOP_OFFSET = 50;
  const REVIEWER_TO_BUTTON_GAP = 20; // Clear space between card reviewer and main buttons
  const ESTIMATED_TOP_SECTION = insets.top + 55;
  const REVIEWER_MAX_HEIGHT = SCREEN_HEIGHT - ESTIMATED_TOP_SECTION - REVIEWER_TOP_OFFSET - BUTTON_ROW_HEIGHT - BOTTOM_CLEARANCE - REVIEWER_TO_BUTTON_GAP;
  
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [imageHistory, setImageHistory] = useState<CapturedImage[]>([]);
  const [forwardHistory, setForwardHistory] = useState<CapturedImage[]>([]);
  // Add originalImage state to store the pre-crop/pre-highlight version
  const [originalImage, setOriginalImage] = useState<CapturedImage | null>(null);
  const [highlightModeActive, setHighlightModeActive] = useState(false);
  const [cropModeActive, setCropModeActive] = useState(false);
  const [hasCropSelection, setHasCropSelection] = useState(false);
  const [localProcessing, setLocalProcessing] = useState(false);
  const [showTextInputModal, setShowTextInputModal] = useState(false);
  const [inputText, setInputText] = useState('');
  const [hasHighlightSelection, setHasHighlightSelection] = useState(false);
  const [hideWalkthroughOverlay, setHideWalkthroughOverlay] = useState(false);
  const [highlightRegion, setHighlightRegion] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    strokes?: { x: number; y: number }[][];
    strokeWidth?: number;
  } | null>(null);
  const [maskCaptureParams, setMaskCaptureParams] = useState<{
    imageDataUri: string;
    width: number;
    height: number;
    strokes: { x: number; y: number }[][];
    strokeWidth: number;
  } | null>(null);
  const maskCaptureViewRef = useRef<View>(null);
  const maskCaptureResolveRef = useRef<((uri: string) => void) | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  // Add a flag to track when we're returning from flashcards
  const [returningFromFlashcards, setReturningFromFlashcards] = useState(false);
  // Add a ref to track if we've lost focus (to distinguish between returning from another screen vs just interacting)
  const hasLostFocusRef = useRef(false);
  
  // New state for image processing loading
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  // Only show overlay for picker/processing, not for image render
  // Removed isImageRendering/shouldAnimateOnLoad since overlay is not tied to render anymore
  // Always-mounted global overlay to guarantee paint order
  const globalOverlayOpacity = React.useRef(new Animated.Value(0)).current;
  const [isGlobalOverlayVisible, setIsGlobalOverlayVisible] = useState(false);

  const showGlobalOverlay = React.useCallback((reason: string) => {
    logger.log(`[KanjiScanner] Global overlay show (${reason})`);
    setIsGlobalOverlayVisible(true);
    globalOverlayOpacity.stopAnimation();
    // Immediate show to avoid any flash of underlying UI
    Animated.timing(globalOverlayOpacity, {
      toValue: 1,
      duration: 0,
      useNativeDriver: true,
    }).start();
  }, [globalOverlayOpacity]);

  const hideGlobalOverlay = React.useCallback((reason: string) => {
    logger.log(`[KanjiScanner] Global overlay hide (${reason})`);
    // Use a short fade-out duration to blend smoothly with image fade-in
    // For immediate hide (cancelled/error), we still get a brief fade for polish
    Animated.timing(globalOverlayOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setIsGlobalOverlayVisible(false));
  }, [globalOverlayOpacity]);
  
  // Safety timeout ref to automatically reset stuck processing states
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // State for rotate mode
  const [rotateModeActive, setRotateModeActive] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  // New state for rotation controls via callback
  const [currentRotationUIState, setCurrentRotationUIState] = useState<ImageHighlighterRotationState | null>(null);
  
  const router = useRouter();
  const { user } = useAuth();
  const { recognizeKanji, isProcessing, error } = useKanjiRecognition();
  const { incrementOCRCount, canPerformOCR, remainingScans } = useOCRCounter();
  const { canCreateFlashcard, remainingFlashcards } = useFlashcardCounter();
  const { rightSwipeCount, streakCount, currentDeckSwipedCount, deckTotalCards, resetSwipeCounts } = useSwipeCounter();
  const { purchaseSubscription, subscription } = useSubscription();
  const { forcedDetectionLanguage } = useSettings();
  const { isConnected } = useNetworkState();
  
  // State for unified API limit (applies to all API call types)
  const [apiCallsRemaining, setApiCallsRemaining] = useState<number>(Number.MAX_SAFE_INTEGER);
  const [isLoadingAPILimits, setIsLoadingAPILimits] = useState(false);
  
  // Add ref to access the ImageHighlighter component
  const imageHighlighterRef = useRef<ImageHighlighterRef>(null);

  // Instead of setting initialRotation to rotation, we'll store a reference
  // to track rotation changes better
  const rotationRef = useRef<number>(0);

  // Refs for walkthrough buttons (right to left: camera, gallery, flashcards, custom card)
  const cameraButtonRef = useRef<View>(null);
  const galleryButtonRef = useRef<View>(null);
const flashcardsButtonRef = useRef<View>(null);
const customCardButtonRef = useRef<View>(null);
const reviewerContainerRef = useRef<View>(null);
const collectionsButtonRef = useRef<View>(null);
const reviewButtonRef = useRef<View>(null);
const settingsButtonRef = useRef<View>(null);
const rotateButtonRef = useRef<View>(null);
const cropButtonRef = useRef<View>(null);
const highlightButtonRef = useRef<View>(null);
const checkmarkButtonRef = useRef<View>(null);
const galleryConfirmRef = useRef<View>(null); // reuse gallery button for the second prompt

  // Define walkthrough steps (starting from rightmost button: camera)
  const walkthroughSteps: WalkthroughStep[] = [
    {
      id: 'camera',
      title: t('walkthrough.camera.title'),
      description: t('walkthrough.camera.description'),
    },
    {
      id: 'gallery',
      title: t('walkthrough.gallery.title'),
      description: t('walkthrough.gallery.description'),
    },
    {
      id: 'flashcards',
      title: t('walkthrough.flashcards.title'),
      description: t('walkthrough.flashcards.description'),
    },
    {
      id: 'custom-card',
      title: t('walkthrough.customCard.title'),
      description: t('walkthrough.customCard.description'),
    },
    {
      id: 'review-cards',
      title: t('walkthrough.reviewCards.title'),
      description: t('walkthrough.reviewCards.description'),
    },
    {
      id: 'collections',
      title: t('walkthrough.collections.title'),
      description: t('walkthrough.collections.description'),
    },
    {
      id: 'review-button',
      title: t('walkthrough.reviewButton.title'),
      description: t('walkthrough.reviewButton.description'),
    },
    {
      id: 'settings',
      title: t('walkthrough.settings.title'),
      description: t('walkthrough.settings.description'),
    },
    {
      id: 'gallery-confirm',
      title: t('walkthrough.galleryConfirm.title'),
      description: t('walkthrough.galleryConfirm.description'),
    },
    {
      id: 'rotate',
      title: t('walkthrough.rotate.title'),
      description: t('walkthrough.rotate.description'),
    },
    {
      id: 'crop',
      title: t('walkthrough.crop.title'),
      description: t('walkthrough.crop.description'),
    },
    {
      id: 'highlight',
      title: t('walkthrough.highlight.title'),
      description: t('walkthrough.highlight.description'),
    },
    {
      id: 'confirm-highlight',
      title: t('walkthrough.confirmHighlight.title'),
      description: t('walkthrough.confirmHighlight.description'),
    },
  ];

  // Initialize walkthrough hook
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
    shouldShowWalkthrough: shouldShowWalkthroughPrompt,
    registerStep,
    updateStepLayout,
  } = useWalkthrough(walkthroughSteps);

  const { setWalkthroughPhase, hideProgressBar } = useOnboardingProgress();

  // Sync progress bar with home walkthrough step
  useEffect(() => {
    if (isWalkthroughActive) {
      setWalkthroughPhase('home', currentStepIndex);
    }
  }, [isWalkthroughActive, currentStepIndex, setWalkthroughPhase]);

  // Track when user completes walkthrough via Done button (to show swipe instructions modal)
  const [walkthroughJustCompleted, setWalkthroughJustCompleted] = useState(false);
  // Once walkthrough has ended (completed or skipped), never show the pre-walkthrough touch block again
  const walkthroughEverEndedRef = useRef(false);
  const handleWalkthroughDone = useCallback(() => {
    setWalkthroughJustCompleted(true);
    walkthroughEverEndedRef.current = true;
    completeWalkthrough();
    onWalkthroughComplete?.();
  }, [completeWalkthrough, onWalkthroughComplete]);

  const handleSkipWalkthrough = useCallback(() => {
    walkthroughEverEndedRef.current = true;
    hideProgressBar();
    skipWalkthrough();
  }, [skipWalkthrough, hideProgressBar]);

  // Register steps with the walkthrough hook
  useEffect(() => {
    walkthroughSteps.forEach(step => {
      registerStep({
        ...step,
        targetRef: 
          step.id === 'camera' ? cameraButtonRef :
          step.id === 'gallery' ? galleryButtonRef :
          step.id === 'gallery-confirm' ? galleryButtonRef :
          step.id === 'flashcards' ? flashcardsButtonRef :
          step.id === 'custom-card' ? customCardButtonRef :
          step.id === 'rotate' ? rotateButtonRef :
          step.id === 'crop' ? cropButtonRef :
          step.id === 'highlight' ? highlightButtonRef :
          step.id === 'confirm-highlight' ? checkmarkButtonRef :
          step.id === 'review-cards' ? reviewerContainerRef :
          step.id === 'collections' ? collectionsButtonRef :
          step.id === 'review-button' ? reviewButtonRef :
          step.id === 'settings' ? settingsButtonRef :
          undefined,
      });
    });
  }, []);

  // Start walkthrough on first launch or after reset (only after splash and post-onboarding loading are dismissed)
  useEffect(() => {
    if (shouldShowWalkthroughPrompt && canStartWalkthrough && !capturedImage && !isWalkthroughActive && !isSplashVisible) {
      // Delay to ensure buttons are rendered and measured
      const timer = setTimeout(async () => {
        // Check if user has energy bars before starting walkthrough
        try {
          const hasEnergy = await hasEnergyBarsRemaining(subscription.plan);
          
          if (!hasEnergy) {
            // Show error message and don't start walkthrough
            Alert.alert(
              t('walkthrough.noEnergyTitle'),
              t('walkthrough.noEnergyMessage')
            );
            return;
          }
          
          // User has energy, proceed with walkthrough
          startWalkthrough();
        } catch (error) {
          logger.error('[KanjiScanner] Error checking energy before walkthrough:', error);
          // On error, show message and don't start walkthrough
          Alert.alert(
            t('walkthrough.noEnergyTitle'),
            t('walkthrough.noEnergyMessage')
          );
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [shouldShowWalkthroughPrompt, canStartWalkthrough, capturedImage, isWalkthroughActive, isSplashVisible, subscription.plan, t]);

  // Track if initial measurements have been done
  const hasMeasuredRef = useRef<boolean>(false);
  const hasAdvancedFromGalleryRef = useRef<boolean>(false);
  
  // Track if we're navigating to flashcards - used to immediately hide walkthrough overlay
  // Using BOTH ref AND state ensures the overlay is hidden before any other state changes
  const isNavigatingToFlashcardsRef = useRef<boolean>(false);
  const [isNavigatingToFlashcards, setIsNavigatingToFlashcards] = useState(false);
  const isEditorWalkthroughStep = currentStep?.id === 'rotate' || currentStep?.id === 'crop' || currentStep?.id === 'highlight' || currentStep?.id === 'back-button';
  const galleryStepIdForHighlight = currentStep?.id === 'gallery-confirm' ? 'gallery' : currentStep?.id;

  // Reset the gallery auto-advance guard when walkthrough is inactive
  useEffect(() => {
    if (!isWalkthroughActive) {
      hasAdvancedFromGalleryRef.current = false;
    }
  }, [isWalkthroughActive]);

  // Reset the navigation flag when screen is focused (user navigated back)
  useFocusEffect(
    React.useCallback(() => {
      // Reset when screen gains focus
      isNavigatingToFlashcardsRef.current = false;
      setIsNavigatingToFlashcards(false);
      
      // Refresh API limits when returning to screen (in case user used API calls)
      const refreshAPILimits = async () => {
        try {
          // Get subscription plan with proper source of truth handling
          const subscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
          logger.log(`[KanjiScanner] Refreshing API limits with plan: ${subscriptionPlan}`);
          const rateLimitStatus = await apiLogger.checkRateLimitStatus(subscriptionPlan);
          setApiCallsRemaining(rateLimitStatus.apiCallsRemaining);
          logger.log(`[KanjiScanner] API calls remaining: ${rateLimitStatus.apiCallsRemaining}`);
        } catch (error) {
          logger.error('Error refreshing API limits on focus:', error);
        }
      };
      
      refreshAPILimits();
    }, [subscription])
  );

  // Load API limits on mount and when subscription changes
  useEffect(() => {
    const loadAPILimits = async () => {
      setIsLoadingAPILimits(true);
      try {
        // Get subscription plan with proper source of truth handling
        const subscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
        logger.log(`[KanjiScanner] Loading API limits with plan: ${subscriptionPlan}`);
        const rateLimitStatus = await apiLogger.checkRateLimitStatus(subscriptionPlan);
        setApiCallsRemaining(rateLimitStatus.apiCallsRemaining);
        logger.log(`[KanjiScanner] API calls remaining: ${rateLimitStatus.apiCallsRemaining}, daily limit: ${rateLimitStatus.dailyLimit}`);
      } catch (error) {
        logger.error('Error loading API limits in KanjiScanner:', error);
        // Default to allowing if check fails
        setApiCallsRemaining(Number.MAX_SAFE_INTEGER);
      } finally {
        setIsLoadingAPILimits(false);
      }
    };

    loadAPILimits();
  }, [subscription]);

  // Helper to check if API limits are exhausted (unified limit for all API call types)
  const isAPILimitExhausted = apiCallsRemaining <= 0;

  // Auto-advance from gallery step to rotate once an image is loaded, but ensure editor buttons are measured first to avoid overlay flicker
  useEffect(() => {
    if (!isWalkthroughActive || !capturedImage || currentStep?.id !== 'gallery-confirm' || hasAdvancedFromGalleryRef.current) {
      return;
    }

    hasAdvancedFromGalleryRef.current = true;
    const cancelFlag = { cancelled: false };

    ensureMeasuredThenAdvance({
      targets: [
        { ref: rotateButtonRef, stepId: 'rotate' },
        { ref: cropButtonRef, stepId: 'crop' },
        { ref: highlightButtonRef, stepId: 'highlight' },
      ],
      updateLayout: updateStepLayout,
      advance: nextStep,
      retries: 4,
      retryDelayMs: 100,
      settleDelayMs: 50,
      cancelFlag,
    });

    return () => {
      cancelFlag.cancelled = true;
    };
  }, [isWalkthroughActive, capturedImage, currentStep?.id, nextStep, updateStepLayout]);

  // Measure all button positions immediately when walkthrough becomes active
  useEffect(() => {
    if (!isWalkthroughActive) {
      hasMeasuredRef.current = false;
      return;
    }

    // Measure all buttons immediately when walkthrough starts to prevent flickering
    if (!hasMeasuredRef.current) {
      const measureButtons = () => {
        // Measure all buttons to have layouts ready
        measureButton(cameraButtonRef, 'camera', updateStepLayout);
        measureButton(galleryButtonRef, 'gallery', updateStepLayout);
        measureButton(galleryButtonRef, 'gallery-confirm', updateStepLayout);
        measureButton(flashcardsButtonRef, 'flashcards', updateStepLayout);
        measureButton(customCardButtonRef, 'custom-card', updateStepLayout);
        if (capturedImage) {
          measureButton(rotateButtonRef, 'rotate', updateStepLayout);
          measureButton(cropButtonRef, 'crop', updateStepLayout);
          measureButton(highlightButtonRef, 'highlight', updateStepLayout);
        }
        measureButton(reviewerContainerRef, 'review-cards', updateStepLayout);
        measureButton(collectionsButtonRef, 'collections', updateStepLayout);
        measureButton(reviewButtonRef, 'review-button', updateStepLayout);
        measureButton(settingsButtonRef, 'settings', updateStepLayout);
      };

      // Small delay to ensure layout is complete
      setTimeout(() => {
        measureButtons();
        hasMeasuredRef.current = true;
      }, 100);
    }
  }, [isWalkthroughActive, updateStepLayout]);

  // Re-measure on step change in case positions shifted
  useEffect(() => {
    if (!isWalkthroughActive || !hasMeasuredRef.current) {
      return;
    }

    const measureButtons = () => {
      // Re-measure current step's button to ensure accurate positioning
      const currentStepId = walkthroughSteps[currentStepIndex]?.id;
      if (currentStepId) {
        const refMap: Record<string, React.RefObject<View>> = {
          'camera': cameraButtonRef,
          'gallery': galleryButtonRef,
          'gallery-confirm': galleryButtonRef,
          'flashcards': flashcardsButtonRef,
          'custom-card': customCardButtonRef,
          'rotate': rotateButtonRef,
          'crop': cropButtonRef,
          'highlight': highlightButtonRef,
          'review-cards': reviewerContainerRef,
          'collections': collectionsButtonRef,
          'review-button': reviewButtonRef,
          'settings': settingsButtonRef,
        };
        const ref = refMap[currentStepId];
        if (ref) {
          setTimeout(() => {
            measureButton(ref, currentStepId, updateStepLayout);
          }, 50);
        }
      }
    };

    measureButtons();
  }, [currentStepIndex, isWalkthroughActive]);

  // Callback for ImageHighlighter to update rotation UI state
  const handleRotationStateChange = React.useCallback((newState: ImageHighlighterRotationState) => {
    logger.log('[KanjiScanner] Rotation state update from IH:', newState);
    setCurrentRotationUIState(newState);
  }, []); // Empty dependency array as setCurrentRotationUIState is stable

  // Safety mechanism: Auto-reset processing states after timeout
  useEffect(() => {
    if (isImageProcessing || localProcessing) {
      // Set a 60-second timeout to automatically reset stuck processing states
      processingTimeoutRef.current = setTimeout(() => {
        logger.warn('[KanjiScanner] Processing timeout reached - auto-resetting stuck states');
        setIsImageProcessing(false);
        hideGlobalOverlay('timeoutReset');
        setLocalProcessing(false);
        setIsNavigating(false);
      }, 60000); // Increased to 60 seconds to allow for longer processing
    } else {
      // Clear timeout when processing completes normally
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };
  }, [isImageProcessing, localProcessing]);



  // Reset navigation state when component becomes active
  useFocusEffect(
    React.useCallback(() => {
      // Track that we've gained focus
      const isReturningFromAnotherScreen = hasLostFocusRef.current;
      hasLostFocusRef.current = false;
      
      // Reset the ref when regaining focus
      isNavigatingToFlashcardsRef.current = false;
      logger.log('[KanjiScanner] Regained focus - reset navigation ref');
      
      // Set returning flag if we were navigating
      if (isNavigating) {
        setReturningFromFlashcards(true);
      }
      
      setIsNavigating(false);
      
      // Only reset processing states if they've been stuck for a while
      // Use a longer delay to avoid interrupting legitimate operations like gallery picker
      // iOS can fire multiple focus events while the picker is still open
      const resetTimer = setTimeout(() => {
        if (isImageProcessing) {
          logger.log('[KanjiScanner] Resetting stuck image processing state after delay');
          setIsImageProcessing(false);
        }
        if (localProcessing) {
          logger.log('[KanjiScanner] Resetting stuck local processing state after delay');
          setLocalProcessing(false);
        }
      }, 10000); // Increased to 10 seconds to allow time for gallery browsing
      
      // Don't allow navigation away if we're processing an image
      return () => {
        // Track that we're losing focus when the cleanup function runs
        hasLostFocusRef.current = true;
        
        clearTimeout(resetTimer);
        if (isImageProcessing || localProcessing) {
          logger.log('[KanjiScanner] Preventing navigation during image processing');
          // Prevent navigation by returning to this screen if processing is active
          if (isImageProcessing || localProcessing) {
            // This is a safety measure - the buttons should already be disabled
            logger.log('[KanjiScanner] Processing active, preventing navigation');
            // We don't force navigation back here as it would create a loop,
            // but the disabled buttons should prevent this situation
          }
        }
      };
    }, [isImageProcessing, localProcessing, isNavigating])
  );

  const handleResetCounter = () => {
    Alert.alert(
      t('settings.resetSwipeCounterTitle'),
      t('settings.resetSwipeCounterMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('settings.resetSwipeCounterConfirm'), 
          style: 'destructive',
          onPress: async () => {
            await resetSwipeCounts();
            Alert.alert(t('common.success'), t('settings.resetSwipeCounterSuccess'));
          }
        }
      ]
    );
  };

  const handleOpenSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/settings');
  };

  const handlePhotoCapture = (imageInfo: CapturedImage | null) => {
    if (imageInfo) {
      logger.log('[KanjiScanner] New image received (camera/gallery), updating view');
      setCapturedImage(imageInfo);
      setOriginalImage(imageInfo); // Also store as original image
      logger.log('[KanjiScanner] New image captured, storing as original:', imageInfo.uri);
      setImageHistory([]);
      setForwardHistory([]);
      
      // Mark this as the original image in the memory manager
      const memoryManager = MemoryManager.getInstance();
      memoryManager.markAsOriginalImage(imageInfo.uri);
    } else {
      setCapturedImage(null);
      setOriginalImage(null);
      setImageHistory([]);
      setForwardHistory([]);
    }
    setHighlightModeActive(false);
  };

  // Helper function to show upgrade alert
  const showUpgradeAlert = () => {
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
  };

  // Helper function to show upgrade alert for API limits
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

  // Helper function to clean up discarded branch images (for history branching)
  const cleanupDiscardedBranch = async (imagesToDiscard: CapturedImage[]) => {
    if (!imagesToDiscard || imagesToDiscard.length === 0) {
      return;
    }
    
    try {
      logger.log(`[KanjiScanner] Cleaning up ${imagesToDiscard.length} discarded branch images`);
      
      // Extract URIs from CapturedImage objects
      const urisToDelete = imagesToDiscard.map(img => img.uri);
      
      // Use MemoryManager to untrack and delete the files
      const memoryManager = MemoryManager.getInstance();
      await memoryManager.untrackAndDeleteImages(urisToDelete);
      
      logger.log('[KanjiScanner] Discarded branch cleanup completed');
    } catch (error) {
      logger.error('[KanjiScanner] Error cleaning up discarded branch:', error);
      // Don't throw - this is cleanup, shouldn't block the main operation
    }
  };

  // Helper function to validate that the current image still exists
  const validateCurrentImage = async (): Promise<boolean> => {
    if (!capturedImage) {
      return false;
    }
    
    try {
      const fileInfo = await FileSystem.getInfoAsync(capturedImage.uri);
      if (!fileInfo.exists) {
        logger.warn('[KanjiScanner] Current image no longer exists:', capturedImage.uri);
        
        // Try to restore from original image
        if (originalImage && originalImage.uri !== capturedImage.uri) {
          const originalFileInfo = await FileSystem.getInfoAsync(originalImage.uri);
          if (originalFileInfo.exists) {
            logger.log('[KanjiScanner] Restoring from original image');
            setCapturedImage(originalImage);
            return true;
          }
        }
        
        // Try to restore from last valid image in history
        if (imageHistory.length > 0) {
          const lastImage = imageHistory[imageHistory.length - 1];
          const lastImageFileInfo = await FileSystem.getInfoAsync(lastImage.uri);
          if (lastImageFileInfo.exists) {
            logger.log('[KanjiScanner] Restoring from last image in history');
            setCapturedImage(lastImage);
            setImageHistory(prev => prev.slice(0, -1));
            return true;
          }
        }
        
        // Could not restore - image is missing
        Alert.alert(
          t('camera.imageMissingTitle'),
          t('camera.imageMissingMessage'),
          [{ text: t('common.ok') }]
        );
        
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('[KanjiScanner] Error validating current image:', error);
      return false;
    }
  };

  const handleTextInput = () => {
    if (!canCreateFlashcard) {
      showUpgradeAlert();
      return;
    }
    setShowTextInputModal(true);
  };

  const handleCancelTextInput = () => {
    setInputText('');
    setShowTextInputModal(false);
  };
  
  const handleNavigateToSavedFlashcards = () => {
    logger.log('🔗 [KanjiScanner] Navigating to saved-flashcards screen...');
    logger.log('🔗 [KanjiScanner] Current network status:', isConnected ? 'ONLINE' : 'OFFLINE');
    logger.log('🔗 [KanjiScanner] User authenticated:', !!user);
    try {
      router.push('/saved-flashcards');
      logger.log('✅ [KanjiScanner] Navigation push called successfully');
    } catch (error) {
      logger.error('❌ [KanjiScanner] Navigation error:', error);
    }
  };

  const handleSubmitTextInput = async () => {
    if (!inputText.trim()) {
      Alert.alert(t('camera.emptyInputTitle'), t('camera.emptyInputMessage'));
      return;
    }

    // Check API limit before navigation
    if (apiCallsRemaining <= 0) {
      showAPILimitUpgradeAlert('translate');
      return;
    }

    // Refresh API limits before navigation
    try {
      const subscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
      const rateLimitStatus = await apiLogger.checkRateLimitStatus(subscriptionPlan);
      setApiCallsRemaining(rateLimitStatus.apiCallsRemaining);
    } catch (error) {
      logger.error('Error refreshing API limits before navigation:', error);
    }

    // Navigate to flashcards with the custom text
    router.push({
      pathname: "/flashcards",
      params: { text: inputText.trim() }
    });

    // Reset the input and close the modal
    setInputText('');
    setShowTextInputModal(false);
  };

  const handleWordScopeTextInput = async () => {
    if (!inputText.trim()) {
      Alert.alert(t('camera.emptyInputTitle'), t('camera.emptyInputMessage'));
      return;
    }

    // Check API limit before navigation
    if (apiCallsRemaining <= 0) {
      showAPILimitUpgradeAlert('wordscope');
      return;
    }

    // Refresh API limits before navigation
    try {
      const subscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
      const rateLimitStatus = await apiLogger.checkRateLimitStatus(subscriptionPlan);
      setApiCallsRemaining(rateLimitStatus.apiCallsRemaining);
    } catch (error) {
      logger.error('Error refreshing API limits before navigation:', error);
    }

    // Navigate to flashcards with the custom text and WordScope flag
    router.push({
      pathname: "/flashcards",
      params: { text: inputText.trim(), useScope: 'true' }
    });

    // Reset the input and close the modal
    setInputText('');
    setShowTextInputModal(false);
  };

  const pickImage = async () => {
    if (!canCreateFlashcard) {
      showUpgradeAlert();
      return;
    }
    
    const memoryManager = MemoryManager.getInstance();
    
    try {
      // Turn on global overlay BEFORE opening picker to avoid any flash of underlying UI
      showGlobalOverlay('beforePickerOpen');
      setIsImageProcessing(true);
      
      // Do cleanup in background, don't wait for it
      memoryManager.gentleCleanup().catch(err => 
        logger.warn('[KanjiScanner pickImage] Background cleanup failed:', err)
      );

      // Small delay to ensure React has processed state updates before launching native picker
      // This prevents a race condition where the overlay/walkthrough animations
      // can interfere with the native picker presentation on iOS
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 1, // Get original quality - we'll compress only if needed later
        exif: false, // PERFORMANCE: Skip EXIF metadata processing - faster for live photos
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const assetWidth = asset.width || 0;
        const assetHeight = asset.height || 0;
        
        logger.log('[KanjiScanner pickImage] Selected image:', asset.uri, 
          `${assetWidth}x${assetHeight}`);

        // PERFORMANCE: Check if this is a very large image that needs processing for memory safety
        // Only process images larger than 4000px (very high res photos from modern phones)
        // Most photos (including live photos) and all screenshots are under this threshold
        const isVeryLargeImage = assetWidth > 4000 || assetHeight > 4000;
        
        if (!isVeryLargeImage) {
          // FAST PATH: Show the original image immediately without any processing!
          // React Native's Image component can display HEIC/HEIF natively on iOS
          logger.log('[KanjiScanner pickImage] Using original image directly (fast path)');
          
          memoryManager.trackProcessedImage(asset.uri);
          memoryManager.markAsOriginalImage(asset.uri);

          handlePhotoCapture({
            uri: asset.uri,
            width: assetWidth,
            height: assetHeight,
          });
          
          // Note: setIsImageProcessing(false) and hideGlobalOverlay are now called
          // by ImageHighlighter's onImageLoaded callback to prevent flicker
          
          // Background cleanup (non-blocking)
          memoryManager.shouldCleanup().then(shouldClean => {
            if (shouldClean) {
              memoryManager.cleanupPreviousImages(asset.uri).catch(err => 
                logger.warn('[KanjiScanner] Background cleanup failed:', err)
              );
            }
          });
          
          return;
        }
        
        // SLOW PATH: Only for very large images (>4000px) that could cause memory issues
        logger.log('[KanjiScanner pickImage] Very large image detected, processing for memory safety');
        
        const standardConfig = memoryManager.getStandardImageConfig();
        const safeMaxDimension = 2000; // Resize to 2000px max for very large images
        const scale = safeMaxDimension / Math.max(assetWidth, assetHeight);
        
        const transformations = [{
          resize: {
            width: Math.round(assetWidth * scale),
            height: Math.round(assetHeight * scale)
          }
        }];

        let processedImage;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            logger.log(`[KanjiScanner pickImage] Processing attempt ${retryCount + 1}/${maxRetries + 1}`);
            
            const compressionLevel = retryCount === 0 ? standardConfig.compress : 0.6;
            
            processedImage = await ImageManipulator.manipulateAsync(
              asset.uri,
              transformations,
              { 
                compress: compressionLevel,
                format: ImageManipulator.SaveFormat.JPEG
              }
            );

            if (processedImage && processedImage.width > 0 && processedImage.height > 0) {
              logger.log('[KanjiScanner pickImage] Processed image:', 
                `${processedImage.width}x${processedImage.height}`);
              break;
            } else {
              throw new Error('Invalid processed image dimensions');
            }
            
          } catch (processingError) {
            logger.error(`[KanjiScanner pickImage] Processing attempt ${retryCount + 1} failed:`, processingError);
            
            if (retryCount < maxRetries) {
              const retryMaxDimension = safeMaxDimension / (retryCount + 1.5);
              const retryScale = retryMaxDimension / Math.max(assetWidth, assetHeight);
              
              transformations.length = 0;
              transformations.push({
                resize: {
                  width: Math.round(assetWidth * retryScale),
                  height: Math.round(assetHeight * retryScale)
                }
              });
              
              await memoryManager.forceCleanup();
              retryCount++;
            } else {
              throw processingError;
            }
          }
        }

        if (!processedImage) {
          // Fallback to original if processing fails
          logger.warn('[KanjiScanner pickImage] Processing failed, using original');
          processedImage = {
            uri: asset.uri,
            width: assetWidth,
            height: assetHeight
          };
        }

        memoryManager.trackProcessedImage(processedImage.uri);
        memoryManager.markAsOriginalImage(processedImage.uri);

        handlePhotoCapture({
          uri: processedImage.uri,
          width: processedImage.width,
          height: processedImage.height,
        });
        
        // Note: setIsImageProcessing(false) and hideGlobalOverlay are now called
        // by ImageHighlighter's onImageLoaded callback to prevent flicker
        
        // Background cleanup
        memoryManager.shouldCleanup().then(shouldClean => {
          if (shouldClean) {
            memoryManager.cleanupPreviousImages(processedImage!.uri).catch(err => 
              logger.warn('[KanjiScanner] Memory cleanup failed:', err)
            );
          }
        });
      } else {
        // Picker cancelled
        setIsImageProcessing(false);
        hideGlobalOverlay('pickerCancelled');
      }
    } catch (error) {
      logger.error('[KanjiScanner] Error picking image:', error);
      setIsImageProcessing(false);
      hideGlobalOverlay('pickerError');
      
      await memoryManager.forceCleanup();
      Alert.alert(t('common.error'), 'Failed to process image. Please try selecting a different image.');
    }
  };

  const resetEditorStateForWalkthrough = useCallback(() => {
    setCapturedImage(null);
    setOriginalImage(null);
    setImageHistory([]);
    setForwardHistory([]);
    setHighlightModeActive(false);
    setCropModeActive(false);
    setHasCropSelection(false);
    setHasHighlightSelection(false);
    setHighlightRegion(null);
  }, []);

  const handleWalkthroughPrevious = useCallback(() => {
    const currentId = currentStep?.id;
    const isRotateStep = currentId === 'rotate';
    const isCropStep = currentId === 'crop';
    const isHighlightStep = currentId === 'highlight';
    const isConfirmHighlightStep = currentId === 'confirm-highlight';

    if (isWalkthroughActive && isConfirmHighlightStep) {
      // From confirm-highlight, just hide the overlay to allow user to adjust their highlight
      // Don't change state or step back - user stays in highlight mode and can try again
      setHideWalkthroughOverlay(true);
      return;
    }

    if (isWalkthroughActive && (isHighlightStep || isConfirmHighlightStep)) {
      // From highlight/confirm-highlight, go back to crop step and restore original image
      logger.log('[KanjiScanner] Going back from highlight to crop step - restoring original image');

      // Exit any active modes
      if (highlightModeActive) {
        setHighlightModeActive(false);
        setHasHighlightSelection(false);
        setHighlightRegion(null);
        imageHighlighterRef.current?.clearHighlightBox?.();
      }
      if (cropModeActive) {
        setCropModeActive(false);
        imageHighlighterRef.current?.toggleCropMode();
      }

      // Restore original image if it exists and is different from current
      if (originalImage && originalImage.uri !== capturedImage?.uri) {
        logger.log('[KanjiScanner] Restoring original image for crop step:', originalImage.uri);
        // Add current cropped image to forward history for potential redo
        setForwardHistory(prev => [...prev, capturedImage!]);
        setCapturedImage(originalImage);
      }

      // Go back to crop step
      previousStep();
      return;
    }

    if (isWalkthroughActive && isRotateStep) {
      // From rotate, go back to gallery-confirm/home and exit editor
      hasAdvancedFromGalleryRef.current = false;
      resetEditorStateForWalkthrough();
      previousStep();
      return;
    }

    if (isWalkthroughActive && isCropStep) {
      // From crop, stay in editor flow and step back one overlay
      previousStep();
      return;
    }

    previousStep();
  }, [currentStep?.id, isWalkthroughActive, previousStep, resetEditorStateForWalkthrough, originalImage, capturedImage, highlightModeActive, cropModeActive]);

  const handleRegionSelected = async (region: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number; // This rotation is for context if a crop is applied on an already rotated image
  }) => {
    if (!capturedImage || !imageHighlighterRef.current) return;
    
    // Validate that the current image still exists before processing
    const isValid = await validateCurrentImage();
    if (!isValid) {
      logger.error('[KanjiScanner] Current image validation failed, aborting region selection');
      return;
    }
    
    try {
      logger.log('[KanjiScanner] Received region for selection/crop:', region);
      logger.log('[KanjiScanner] Current modes:', { 
        highlightModeActive, 
        cropModeActive, 
        rotateModeActive 
      });

      if (highlightModeActive) {
        logger.log('[KanjiScanner] Highlight region selected (screen/IH coords):', region);
        setHighlightRegion(region); 
        setHasHighlightSelection(true);
        
        // If we're in walkthrough on highlight step, advance to confirm-highlight step
        if (isWalkthroughActive && currentStep?.id === 'highlight') {
          nextStep();
          setHideWalkthroughOverlay(false); // Show overlay again for confirm step
        }
        
        // If we're in walkthrough on confirm-highlight step and overlay was hidden, show it again
        if (isWalkthroughActive && currentStep?.id === 'confirm-highlight' && hideWalkthroughOverlay) {
          setHideWalkthroughOverlay(false);
        }
        
        return; 
      }

      if (cropModeActive) { 
        logger.log('[KanjiScanner] Crop operation initiated via onRegionSelected. Region from IH:', region);
        setLocalProcessing(true);
        
        if (capturedImage) {
          // If there's forward history, we're branching - clean up the discarded branch
          if (forwardHistory.length > 0) {
            logger.log('[KanjiScanner] Branching detected - cleaning up', forwardHistory.length, 'discarded images');
            // Clean up the forward history images asynchronously (don't await to avoid blocking)
            cleanupDiscardedBranch(forwardHistory).catch(err => {
              logger.error('[KanjiScanner] Failed to cleanup discarded branch:', err);
            });
          }
          
          // Store current image in history
          setImageHistory(prev => [...prev, capturedImage]);
          setForwardHistory([]);
          
          // If this is the first crop, save the original image
          if (!originalImage) {
            logger.log('[KanjiScanner] Setting original image before first crop');
            setOriginalImage(capturedImage);
          } else {
            logger.log('[KanjiScanner] Original image already saved:', originalImage.uri);
          }
        }

        const { x, y, width, height, rotation } = region; // Destructure from IH-provided region
        const cropDetails: { x: number; y: number; width: number; height: number; } = { x, y, width, height };
        
        // Use ProcessImage.processImage to handle crop and potential rotation context
        const processedUri = await ProcessImage.processImage(
            capturedImage.uri,
            { crop: cropDetails, rotate: rotation } // rotation might be 0 or undefined if not rotated
        );
        
        if (processedUri) {
          // Get dimensions of the newly processed (cropped, possibly rotated) image
          const imageInfo = await ProcessImage.getImageInfo(processedUri);
          
          logger.log('[KanjiScanner] Crop applied. New image:', processedUri, 'New Dims:', imageInfo);
          logger.log('[KanjiScanner] Original image remains:', originalImage?.uri);
          setCapturedImage({
            uri: processedUri,
            width: imageInfo.width,
            height: imageInfo.height
          });

          // If we're in walkthrough mode on the crop step, advance to highlight step
          if (isWalkthroughActive && currentStep?.id === 'crop') {
            logger.log('[KanjiScanner] Crop completed during walkthrough - advancing to highlight step');
            nextStep(); // Advance to highlight step
            setHideWalkthroughOverlay(false); // Show the walkthrough overlay again
          }
        } else {
          logger.warn('[KanjiScanner] ProcessImage.processImage did not return a URI for crop operation.');
          // Potentially revert to previous image from history if capturedImage was pushed too early
          // or show an error. For now, localProcessing will be set to false.
        }
        setCropModeActive(false);
        setLocalProcessing(false);
        return; 
      }
      
      logger.warn('[KanjiScanner] handleRegionSelected called unexpectedly. Active modes:', 
        { highlightModeActive, cropModeActive, rotateModeActive });
      setLocalProcessing(false);

    } catch (error) {
      logger.error('[KanjiScanner] Error in handleRegionSelected:', error);
      Alert.alert(t('common.error'), t('camera.processingError'));
      setLocalProcessing(false);
    }
  };

  // New function to process the highlight region
  const processHighlightRegion = async (params: {
    x: number;
    y: number;
    width: number;
    height: number;
    strokes?: { x: number; y: number }[][];
    strokeWidth?: number;
    regionDisplay?: { x: number; y: number; width: number; height: number };
  }) => {
    const originalRegionFromConfirm = { x: params.x, y: params.y, width: params.width, height: params.height };
    if (!capturedImage) return;
    
    // Check if user can perform OCR
    if (!canPerformOCR) {
      Alert.alert(
        t('camera.ocrLimitReachedTitle'),
        t('camera.ocrLimitReachedMessage', { remaining: remainingScans }),
        [
          { text: t('common.ok'), style: 'default' },
          { text: t('subscription.limit.upgradeToPremium'), style: 'default', onPress: () => {
            // Navigate to subscription screen
            router.push('/settings'); // You can create a dedicated subscription screen route
          }}
        ]
      );
      return;
    }
    
    logger.log('[KanjiScanner PHR] Received originalRegionForProcessing:', originalRegionFromConfirm);
    logger.log('[KanjiScanner PHR] Full image URI for cropping:', capturedImage.uri);

    setLocalProcessing(true); // Restore local processing state
    try {
      const { uri, width: imageW, height: imageH } = capturedImage;

      // Region must be in current image pixel space (same as capturedImage dimensions).
      // Clamp to current image bounds so crop never exceeds the image (important after crop).
      const clampedRegion = {
        x: Math.max(0, Math.min(originalRegionFromConfirm.x, imageW - 1)),
        y: Math.max(0, Math.min(originalRegionFromConfirm.y, imageH - 1)),
        width: Math.max(1, Math.min(originalRegionFromConfirm.width, imageW - Math.max(0, originalRegionFromConfirm.x))),
        height: Math.max(1, Math.min(originalRegionFromConfirm.height, imageH - Math.max(0, originalRegionFromConfirm.y))),
      };

      const croppedImageUri = await cropImageToRegion(uri, clampedRegion, { exactRegion: true });
      let textRegions: VisionApiResponse[] = [];

      // Shared continuation after we have OCR result (used by both composite path and debug preview)
      const completeHighlightWithOcrResult = async (regions: VisionApiResponse[]) => {
        logger.log('OCR result:', regions.length > 0 ? `${regions.length} texts found` : 'No text found');
        await incrementOCRCount();
        if (regions && regions.length > 0) {
          const detectedText = regions.map(item => item.text).join('\n');
          logger.log('Extracted text:', detectedText);
          setIsNavigating(true);
          isNavigatingToFlashcardsRef.current = true;
          logger.log('[KanjiScanner] Navigation initiated - component will hide from render tree');
          if (!originalImage) {
            logger.log('[KanjiScanner PHR] Storing current image as original before navigating');
            setOriginalImage(capturedImage);
            const memoryManager = MemoryManager.getInstance();
            memoryManager.markAsOriginalImage(capturedImage.uri);
          } else {
            logger.log('[KanjiScanner PHR] Original image already stored:', originalImage.uri);
          }
          imageHighlighterRef.current?.clearHighlightBox?.();
          const params: any = { text: detectedText, imageUri: uri };
          if (isWalkthroughActive) {
            params.walkthrough = 'true';
            walkthroughEverEndedRef.current = true;
            completeWalkthrough();
            onWalkthroughComplete?.();
            AsyncStorage.setItem('@swipe_instructions_pending', 'true').catch(() => {});
          }
          router.push({ pathname: '/flashcards', params });
        } else {
          if (isWalkthroughActive) {
            Alert.alert(
              t('walkthrough.noTextFoundTitle'),
              t('walkthrough.noTextFoundMessage'),
              [{ text: t('common.ok'), onPress: () => { setHideWalkthroughOverlay(false); previousStep(); } }]
            );
          } else {
            const languageName = DETECTABLE_LANGUAGES[forcedDetectionLanguage as keyof typeof DETECTABLE_LANGUAGES] || 'text';
            Alert.alert(
              t('camera.noTextFoundTitle', { language: languageName }),
              t('camera.noTextFoundMessage', { language: languageName.toLowerCase() }),
              [{ text: t('common.ok') }]
            );
          }
        }
      };

      // COMPOSITE APPROACH: Create ONE image from all stroke rectangles (white + stroke regions), send to OCR
      if (imageHighlighterRef.current && params.strokes && params.strokes.length > 0) {
        try {
          logger.log('[KanjiScanner PHR] Capturing composite image (one picture from all stroke rectangles)...');
          const compositeResult = await imageHighlighterRef.current.captureCompositeStrokeImage();
          
          if (compositeResult?.uri) {
            logger.log('[KanjiScanner PHR] Using composite image for OCR, dimensions:', compositeResult.width, 'x', compositeResult.height);
            textRegions = await detectJapaneseText(
              compositeResult.uri,
              { x: 0, y: 0, width: 1000, height: 1000 },
              false
            );
            if (textRegions.length > 0) {
              logger.log('[KanjiScanner PHR] Composite OCR success');
            }
          }
        } catch (compositeError) {
          logger.warn('[KanjiScanner PHR] Composite capture/OCR failed, falling back to full crop:', compositeError);
        }
      }

      // Fallback: if composite failed or found nothing, use the full bounding box crop
      if (textRegions.length === 0) {
        logger.log('[KanjiScanner PHR] Using full bounding box crop for OCR');
        textRegions = await detectJapaneseText(
          croppedImageUri,
          { x: 0, y: 0, width: 1000, height: 1000 },
          false
        );
      }
      
      await completeHighlightWithOcrResult(textRegions);
    } catch (error: any) {
      logger.error('Error processing highlight region:', error);
      
      // During walkthrough, show a friendly message and go back to highlight step
      if (isWalkthroughActive) {
        Alert.alert(
          t('walkthrough.noTextFoundTitle'),
          t('walkthrough.noTextFoundMessage'),
          [{ 
            text: t('common.ok'),
            onPress: () => {
              // Reset overlay visibility so walkthrough shows again
              setHideWalkthroughOverlay(false);
              previousStep();
            }
          }]
        );
      } else if (error.message && error.message.includes('timed out')) {
        // Check if it's a timeout error from our OCR service
        Alert.alert(
          t('camera.processingLimitReachedTitle'),
          t('camera.processingLimitReachedMessage'),
          [{ text: t('common.ok') }]
        );
      } else {
        Alert.alert(
          t('camera.ocrErrorTitle'),
          t('camera.ocrErrorMessage'),
          [{ text: t('common.ok') }]
        );
      }
    } finally {
      // Always reset localProcessing since OCR is complete
      setLocalProcessing(false);
      
      // Only reset UI states if we're not navigating to prevent UI flash
      if (!isNavigating) {
        setHighlightRegion(null);
        setHasHighlightSelection(false);
        setHighlightModeActive(false);
        imageHighlighterRef.current?.clearHighlightBox?.(); // Ensure highlight box is cleared
      }
    }
  };

  const confirmHighlightSelection = async () => {
    if (!highlightRegion || !imageHighlighterRef.current || !capturedImage) return;
    
    logger.log('[KanjiScanner CnfHS] Current capturedImage URI:', capturedImage.uri);
    logger.log('[KanjiScanner CnfHS] Received highlightRegion from state:', highlightRegion);
    const transformData = imageHighlighterRef.current.getTransformData();
    logger.log('[KanjiScanner CnfHS] TransformData from ImageHighlighter:', transformData);

    // Use the new properties from transformData.
    // originalImageWidth/Height here are the CURRENT displayed image dimensions (capturedImage after crop), not the pre-crop original.
    const {
      originalImageWidth,
      originalImageHeight,
      displayImageViewWidth,
      displayImageViewHeight,
    } = transformData;

    // Log the selection dimensions as percentages of the display
    const widthPercentage = (highlightRegion.width / displayImageViewWidth) * 100;
    const heightPercentage = (highlightRegion.height / displayImageViewHeight) * 100;
    logger.log(`[KanjiScanner CnfHS] Selection dimensions: ${highlightRegion.width}x${highlightRegion.height} (${widthPercentage.toFixed(1)}% x ${heightPercentage.toFixed(1)}% of view)`);

    // The highlightRegion state has its x,y already adjusted by ImageHighlighter
    // to be relative to the visible image content's top-left (display pixels).
    // Clamp it against the displayImageView dimensions before scaling to image pixels.
    const clampedHighlightRegion = {
      x: Math.max(0, Math.min(highlightRegion.x, displayImageViewWidth)),
      y: Math.max(0, Math.min(highlightRegion.y, displayImageViewHeight)),
      width: Math.max(5, highlightRegion.width),
      height: Math.max(5, highlightRegion.height)
    };

    clampedHighlightRegion.width = Math.min(clampedHighlightRegion.width,
                                           displayImageViewWidth - clampedHighlightRegion.x);
    clampedHighlightRegion.height = Math.min(clampedHighlightRegion.height,
                                            displayImageViewHeight - clampedHighlightRegion.y);

    if (clampedHighlightRegion.width <= 0) clampedHighlightRegion.width = 5;
    if (clampedHighlightRegion.height <= 0) clampedHighlightRegion.height = 5;

    // Convert display coordinates to current image pixel coordinates (no extra margin so OCR matches selection).
    const widthRatio = originalImageWidth / displayImageViewWidth;
    const heightRatio = originalImageHeight / displayImageViewHeight;
    logger.log('[KanjiScanner CnfHS] Clamped Region:', clampedHighlightRegion);
    logger.log('[KanjiScanner CnfHS] Scaling Ratios:', { widthRatio, heightRatio });

    const originalRegion = {
      x: Math.round(clampedHighlightRegion.x * widthRatio),
      y: Math.round(clampedHighlightRegion.y * heightRatio),
      width: Math.round(clampedHighlightRegion.width * widthRatio),
      height: Math.round(clampedHighlightRegion.height * heightRatio)
    };
    
    // Ensure coordinates are within image bounds
    originalRegion.x = Math.max(0, originalRegion.x);
    originalRegion.y = Math.max(0, originalRegion.y);
    originalRegion.width = Math.min(originalRegion.width, originalImageWidth - originalRegion.x);
    originalRegion.height = Math.min(originalRegion.height, originalImageHeight - originalRegion.y);
    
    logger.log('[KanjiScanner CnfHS] Calculated originalRegion (to be sent to processHighlightRegion):', originalRegion);
    logger.log('[KanjiScanner CnfHS] Region as percentage of original image:', {
      x: (originalRegion.x / originalImageWidth * 100).toFixed(1) + '%',
      y: (originalRegion.y / originalImageHeight * 100).toFixed(1) + '%',
      width: (originalRegion.width / originalImageWidth * 100).toFixed(1) + '%',
      height: (originalRegion.height / originalImageHeight * 100).toFixed(1) + '%'
    });
    
    // Final safety check for very large regions that might strain OCR
    if (originalRegion.width * originalRegion.height > 4000000) { // 4 megapixels
      logger.log('[KanjiScanner CnfHS] Warning: Very large region selected, OCR processing may take longer');
    }
    
    await processHighlightRegion({
      ...originalRegion,
      strokes: highlightRegion.strokes,
      strokeWidth: highlightRegion.strokeWidth,
      regionDisplay: clampedHighlightRegion,
    });
  };

  const cancelHighlightSelection = () => {
    setHighlightRegion(null);
    setHasHighlightSelection(false);
    imageHighlighterRef.current?.clearHighlightBox?.();
  };

  const activateHighlightMode = () => {
    // First, exit other modes if they're active
    if (rotateModeActive) {
      imageHighlighterRef.current?.toggleRotateMode(); // Exit rotate mode in ImageHighlighter
      setRotateModeActive(false);
    }
    if (cropModeActive) {
      setCropModeActive(false);
      imageHighlighterRef.current?.toggleCropMode();
    }

    // Then activate highlight mode
    logger.log('[KanjiScanner] Activating highlight mode');
    setHighlightModeActive(true);
    setHasHighlightSelection(false);
    setHighlightRegion(null);

    // Make sure the ImageHighlighter component is ready for highlight selection
    if (imageHighlighterRef.current) {
      imageHighlighterRef.current.clearHighlightBox?.();
      // We don't need to call activateHighlightMode on the ref since
      // the ImageHighlighter component observes the highlightModeActive prop
    }
  };

  // Walkthrough Next handler: for gallery-confirm without an image, trigger pickImage instead of advancing
  const handleWalkthroughNext = useCallback(() => {
    if (currentStep?.id === 'gallery-confirm' && !capturedImage) {
      if (canCreateFlashcard && isConnected && !localProcessing && !isImageProcessing) {
        pickImage();
      }
      return;
    }
    if (currentStep?.id === 'highlight') {
      activateHighlightMode();
      // Hide overlay so user can draw a highlight
      // Don't advance yet - wait for user to draw a highlight
      setHideWalkthroughOverlay(true);
      return;
    }
    // For confirm-highlight step, hide the overlay so user can press the checkmark
    // The walkthrough will continue on the flashcards page
    if (currentStep?.id === 'confirm-highlight') {
      setHideWalkthroughOverlay(true);
      return;
    }
    if (currentStep?.id === 'crop') {
      // Activate crop mode while staying on the crop walkthrough step
      // (Inline logic from toggleCropMode but skip validation since we're in controlled walkthrough flow)
      setCropModeActive(true);

      // Exit highlight mode if it's active
      if (highlightModeActive) {
        setHighlightModeActive(false);
      }

      // Call the ImageHighlighter's toggleCropMode function
      imageHighlighterRef.current?.toggleCropMode();

      // Hide walkthrough overlay to let user interact with crop mode
      setHideWalkthroughOverlay(true);
      return;
    }
    // On last step, use handleWalkthroughDone to set flag for swipe instructions modal
    if (currentStepIndex === walkthroughSteps.length - 1) {
      handleWalkthroughDone();
    } else {
      nextStep();
    }
  }, [currentStep?.id, currentStepIndex, capturedImage, canCreateFlashcard, isConnected, localProcessing, isImageProcessing, pickImage, nextStep, handleWalkthroughDone, walkthroughSteps.length]);

  // Helper function to actually skip the walkthrough (extracted for reuse)
  const skipWalkthroughFromHighlight = async () => {
    logger.log('[KanjiScanner] User confirmed walkthrough cancellation during highlight phase');
    walkthroughEverEndedRef.current = true;
    // Reset walkthrough-related states first
    setHideWalkthroughOverlay(false);
    setHighlightModeActive(false);
    setHasHighlightSelection(false);
    setHighlightRegion(null);
    hasRegisteredCheckmarkRef.current = false;
    imageHighlighterRef.current?.clearHighlightBox?.();
    // Then skip the walkthrough (this sets isActive to false)
    await skipWalkthrough();
    logger.log('[KanjiScanner] Walkthrough skip completed via cancelActiveMode');
  };

  // Renamed from cancelHighlightMode and made more generic
  const cancelActiveMode = async () => {
    // If we're in walkthrough mode during highlight or crop phase, show confirmation dialog
    // Note: We check for highlight, confirm-highlight, and crop steps, and don't require hideWalkthroughOverlay
    // because the user might press X while the walkthrough overlay is still visible
    if (isWalkthroughActive && (currentStep?.id === 'highlight' || currentStep?.id === 'confirm-highlight' || currentStep?.id === 'crop')) {
      Alert.alert(
        t('walkthrough.endWalkthroughTitle', 'End Walkthrough?'),
        t('walkthrough.endWalkthroughMessage', 'Pressing x will take you out of the walkthrough. Are you sure?'),
        [
          {
            text: t('walkthrough.continueWalkthrough', 'No, Continue Walkthrough'),
            onPress: () => {
              logger.log('[KanjiScanner] User chose to continue walkthrough');
              // Do nothing - stay in current walkthrough mode
            }
          },
          {
            text: t('walkthrough.endWalkthrough', 'Yes, End Walkthrough'),
            style: 'destructive',
            onPress: skipWalkthroughFromHighlight
          }
        ]
      );
      return;
    }

    if (highlightModeActive) {
      setHighlightModeActive(false);
      setHasHighlightSelection(false);
      setHighlightRegion(null);
      imageHighlighterRef.current?.clearHighlightBox?.();
      logger.log('[KanjiScanner] Highlight mode cancelled');
    } else if (cropModeActive) {
      setCropModeActive(false);
      imageHighlighterRef.current?.toggleCropMode(); // Syncs IH internal mode & clears box
      imageHighlighterRef.current?.clearCropBox?.(); 
      logger.log('[KanjiScanner] Crop mode cancelled');
    } else if (rotateModeActive) {
      imageHighlighterRef.current?.cancelRotationChanges(); // 1. IH reverts visual rotation & clears its session
      imageHighlighterRef.current?.toggleRotateMode();    // 2. IH formally exits rotate mode
      setRotateModeActive(false);                           // 3. KS updates its state (triggers effect cleanup)
      logger.log('[KanjiScanner] Rotate mode cancelled');
    }
  };

  const confirmCrop = () => {
    if (cropModeActive && hasCropSelection && imageHighlighterRef.current) {
      logger.log('[KanjiScanner] Confirming crop...');
      imageHighlighterRef.current.applyCrop();
      // ImageHighlighter's applyCrop calls onRegionSelected, which is handleRegionSelected here.
      // handleRegionSelected already sets cropModeActive to false after processing.
      // It also sets localProcessing to true/false.
      // We might not need to do much else here as handleRegionSelected should take over.
    } else {
      logger.warn('[KanjiScanner] confirmCrop called in invalid state');
    }
  };

  const discardCropSelection = async () => {
    if (cropModeActive && imageHighlighterRef.current) {
      logger.log('[KanjiScanner] Discarding crop selection...');
      imageHighlighterRef.current.clearCropBox();
      setHasCropSelection(false); // Manually update as the mode is still active
      
      // Clean up memory when user discards crop selection
      try {
        const memoryManager = MemoryManager.getInstance();
        if (await memoryManager.shouldCleanup() && capturedImage && capturedImage.uri) {
          await memoryManager.cleanupPreviousImages(capturedImage.uri);
        }
        logger.log('[KanjiScanner] Memory cleanup completed after discarding crop selection');
      } catch (cleanupError) {
        logger.warn('[KanjiScanner] Memory cleanup failed after discarding crop selection:', cleanupError);
      }
    } else {
      logger.warn('[KanjiScanner] discardCropSelection called in invalid state');
    }
  };

  const discardHighlightSelection = async () => {
    if (highlightModeActive && imageHighlighterRef.current) {
      logger.log('[KanjiScanner] Discarding highlight selection...');
      imageHighlighterRef.current.clearHighlightBox();
      setHasHighlightSelection(false); // Manually update as the mode is still active
      
      // Clean up memory when user discards highlight selection
      try {
        const memoryManager = MemoryManager.getInstance();
        if (await memoryManager.shouldCleanup() && capturedImage && capturedImage.uri) {
          await memoryManager.cleanupPreviousImages(capturedImage.uri);
        }
        logger.log('[KanjiScanner] Memory cleanup completed after discarding highlight selection');
      } catch (cleanupError) {
        logger.warn('[KanjiScanner] Memory cleanup failed after discarding highlight selection:', cleanupError);
      }
    } else {
      logger.warn('[KanjiScanner] discardHighlightSelection called in invalid state');
    }
  };

  const toggleCropMode = async () => {
    // Validate image before entering crop mode
    if (!cropModeActive) {
      const isValid = await validateCurrentImage();
      if (!isValid) {
        logger.error('[KanjiScanner] Cannot enter crop mode - image validation failed');
        return;
      }
    }
    
    const newCropMode = !cropModeActive;
    setCropModeActive(newCropMode);
    
    // Exit highlight mode if it's active
    if (newCropMode && highlightModeActive) {
      setHighlightModeActive(false);
    }
    
    // Call the ImageHighlighter's toggleCropMode function
    imageHighlighterRef.current?.toggleCropMode();
  };

  // Add an effect to monitor highlightModeActive changes
  React.useEffect(() => {
    logger.log('[KanjiScanner] highlightModeActive state changed:', highlightModeActive);
  }, [highlightModeActive]);

  // Add an effect to monitor capturedImage changes
  React.useEffect(() => {
    if (capturedImage) {
      logger.log('[KanjiScanner] capturedImage state updated:', {
        uri: capturedImage.uri,
        width: capturedImage.width,
        height: capturedImage.height
      });
    }
  }, [capturedImage]);

  // Effect to capture masked image when maskCaptureParams is set
  useEffect(() => {
    if (!maskCaptureParams || !maskCaptureViewRef.current || !maskCaptureResolveRef.current) return;

    const captureMaskedImage = async () => {
      try {
        await new Promise((r) => setTimeout(r, 150));
        const uri = await captureRef(maskCaptureViewRef, {
          format: 'jpg',
          quality: 0.95,
          result: 'tmpfile',
        });
        maskCaptureResolveRef.current?.(uri);
        logger.log('[KanjiScanner] Masked image captured successfully');
      } catch (error) {
        logger.error('[KanjiScanner] Failed to capture masked image:', error);
        maskCaptureResolveRef.current?.('');
      } finally {
        maskCaptureResolveRef.current = null;
        setMaskCaptureParams(null);
      }
    };

    captureMaskedImage();
  }, [maskCaptureParams]);

  // Restore the handleCancel function which was accidentally removed
  const handleCancel = async () => {
    // If we're in walkthrough mode during highlight, confirm-highlight, or crop phase, show confirmation dialog
    // Note: We check for 'highlight', 'confirm-highlight', and 'crop' steps, and don't require hideWalkthroughOverlay
    // because the user might press cancel while the walkthrough overlay is still visible
    if (isWalkthroughActive && (currentStep?.id === 'highlight' || currentStep?.id === 'confirm-highlight' || currentStep?.id === 'crop')) {
      Alert.alert(
        t('walkthrough.endWalkthroughTitle', 'End Walkthrough?'),
        t('walkthrough.endWalkthroughMessage', 'Pressing x or the back button will take you out of the walkthrough. Are you sure?'),
        [
          {
            text: t('walkthrough.continueWalkthrough', 'No, Continue Walkthrough'),
            onPress: () => {
              logger.log('[KanjiScanner] User chose to continue walkthrough');
              // Do nothing - stay in walkthrough mode
            }
          },
          {
            text: t('walkthrough.endWalkthrough', 'Yes, End Walkthrough'),
            style: 'destructive',
            onPress: skipWalkthroughFromHighlight
          }
        ]
      );
      return;
    }

    // Clean up memory when user cancels current session
    try {
      const memoryManager = MemoryManager.getInstance();
      await memoryManager.gentleCleanup();
      logger.log('[KanjiScanner] Memory cleanup completed after cancel');
    } catch (cleanupError) {
      logger.warn('[KanjiScanner] Memory cleanup failed after cancel:', cleanupError);
    }

    // Clear all state after cleanup to ensure we don't reference deleted images
    setCapturedImage(null);
    setOriginalImage(null);
    // No image-render overlay management anymore
    setHighlightModeActive(false);
    setCropModeActive(false);
    setImageHistory([]);
    setForwardHistory([]);
  };

  // Restore the handleBackToPreviousImage function which was accidentally removed
  const handleBackToPreviousImage = async () => {
    if (imageHistory.length > 0 && capturedImage) {
      logger.log('[KanjiScanner] Going back to previous image. History length:', imageHistory.length);
      
      // Clear any highlight box, crop box, or selections in ImageHighlighter
      imageHighlighterRef.current?.clearHighlightBox?.();
      imageHighlighterRef.current?.clearCropBox?.();
      setHighlightRegion(null);
      setHasHighlightSelection(false);
      setHighlightModeActive(false);
      setHasCropSelection(false);
      
      // Get the last image from history
      const previousImage = imageHistory[imageHistory.length - 1];
      
      // Check if the previous image still exists
      try {
        const fileInfo = await FileSystem.getInfoAsync(previousImage.uri);
        if (!fileInfo.exists) {
          logger.log('[KanjiScanner] Previous image no longer exists:', previousImage.uri);
          
          // Remove the non-existent image from history
          const updatedImageHistory = imageHistory.slice(0, -1).filter(img => img.uri !== previousImage.uri);
          setImageHistory(updatedImageHistory);
          
          // Try again with the next image in history if available
          if (updatedImageHistory.length > 0) {
            logger.log('[KanjiScanner] Trying next image in history');
            return handleBackToPreviousImage();
          }
          
          // If history is empty but we have an original image, try to use that
        if (originalImage && originalImage.uri !== capturedImage.uri) {
            const originalFileInfo = await FileSystem.getInfoAsync(originalImage.uri);
            if (originalFileInfo.exists) {
              logger.log('[KanjiScanner] No more history but original image exists, using it:', originalImage.uri);
              
              // Save current image to forward history
              setForwardHistory([...forwardHistory, capturedImage]);
              
            // Set original image as current
              setCapturedImage(originalImage);
              return;
            }
          }
          
          // If we can't find the original image in state, check the MemoryManager
          const memoryManager = MemoryManager.getInstance();
          const originalUri = memoryManager.getOriginalImageUri();
          
          if (originalUri && originalUri !== capturedImage.uri) {
            const originalExists = await memoryManager.originalImageExists();
            if (originalExists) {
              logger.log('[KanjiScanner] Retrieved original image from MemoryManager:', originalUri);
              
              // Get dimensions of the original image
              try {
                const imageInfo = await FileSystem.getInfoAsync(originalUri);
                const imageSize = await ImageManipulator.manipulateAsync(
                  originalUri, 
                  [], 
                  { format: ImageManipulator.SaveFormat.JPEG, base64: false }
                );
                
                // Save current image to forward history
                setForwardHistory([...forwardHistory, capturedImage]);
                
                // Set original image as current and update originalImage state
                const originalImageData = {
                  uri: originalUri,
                  width: imageSize.width || 0,
                  height: imageSize.height || 0
                };
                
                setCapturedImage(originalImageData);
                setOriginalImage(originalImageData);
                
                return;
              } catch (error) {
                logger.warn('[KanjiScanner] Error getting original image dimensions:', error);
              }
            }
          }
          
          logger.log('[KanjiScanner] No more valid images in history');
          return;
        }
        
        // Save current image to forward history
        const updatedForwardHistory = [...forwardHistory, capturedImage];
        setForwardHistory(updatedForwardHistory);
        
        // Set previous image as the current image
        setCapturedImage(previousImage);
        
        // If we're going back to the original image, log it for debugging
        // The original image is preserved in the originalImage state variable
        // so we can always identify it in the history navigation
        if (originalImage && previousImage.uri === originalImage.uri) {
          logger.log('[KanjiScanner] Restored original image from history');
        }
        
        // Remove it from history
        setImageHistory(prev => prev.slice(0, -1));
        
        // Clean up memory when navigating to previous image
        try {
          const memoryManager = MemoryManager.getInstance();
          if (await memoryManager.shouldCleanup()) {
            // Collect all URIs that should be preserved (current image and forward history)
            const preservedUris = [previousImage.uri, ...updatedForwardHistory.map(img => img.uri)].filter(
              uri => typeof uri === 'string'
            ) as string[];
            
            logger.log('[KanjiScanner] Preserving URIs during cleanup:', preservedUris);
            
            // Clean up images except for the preserved ones
            if (preservedUris.length > 0) {
              await memoryManager.cleanupPreviousImages(...preservedUris);
            } else {
              await memoryManager.cleanupPreviousImages();
            }
          }
          logger.log('[KanjiScanner] Memory cleanup completed after navigating to previous image');
        } catch (cleanupError) {
          logger.warn('[KanjiScanner] Memory cleanup failed after navigating to previous image:', cleanupError);
        }
      } catch (error) {
        logger.warn('[KanjiScanner] Error checking if previous image exists:', error);
        
        // Remove the potentially problematic image from history
        const updatedImageHistory = imageHistory.slice(0, -1);
        setImageHistory(updatedImageHistory);
        
        // Try again with the next image in history if available
        if (updatedImageHistory.length > 0) {
          logger.log('[KanjiScanner] Trying next image in history after error');
          return handleBackToPreviousImage();
        }
      }
    }
  };

  // Restore the handleForwardToNextImage function which was accidentally removed
  const handleForwardToNextImage = async () => {
    if (forwardHistory.length > 0 && capturedImage) {
      logger.log('[KanjiScanner] Going forward to next image. Forward history length:', forwardHistory.length);
      
      // Clear any highlight box, crop box, or selections in ImageHighlighter
      imageHighlighterRef.current?.clearHighlightBox?.();
      imageHighlighterRef.current?.clearCropBox?.();
      setHighlightRegion(null);
      setHasHighlightSelection(false);
      setHighlightModeActive(false);
      setHasCropSelection(false);
      
      // Get the last image from forward history
      const nextImage = forwardHistory[forwardHistory.length - 1];
      
      // Check if the next image still exists
      try {
        const fileInfo = await FileSystem.getInfoAsync(nextImage.uri);
        if (!fileInfo.exists) {
          logger.log('[KanjiScanner] Next image no longer exists:', nextImage.uri);
          
          // Remove the non-existent image from forward history
          const updatedForwardHistory = forwardHistory.slice(0, -1).filter(img => img.uri !== nextImage.uri);
          setForwardHistory(updatedForwardHistory);
          
          // Try again with the next image in forward history if available
          if (updatedForwardHistory.length > 0) {
            logger.log('[KanjiScanner] Trying next image in forward history');
            return handleForwardToNextImage();
          }
          
          // If forward history is empty, check if we can use the original image from MemoryManager
          const memoryManager = MemoryManager.getInstance();
          const originalUri = memoryManager.getOriginalImageUri();
          
          if (originalUri && originalUri !== capturedImage.uri) {
            const originalExists = await memoryManager.originalImageExists();
            if (originalExists) {
              logger.log('[KanjiScanner] Retrieved original image from MemoryManager for forward navigation:', originalUri);
              
              // Get dimensions of the original image
              try {
                const imageInfo = await FileSystem.getInfoAsync(originalUri);
                const imageSize = await ImageManipulator.manipulateAsync(
                  originalUri, 
                  [], 
                  { format: ImageManipulator.SaveFormat.JPEG, base64: false }
                );
                
                // Save current image to backward history
                setImageHistory([...imageHistory, capturedImage]);
                
                // Set original image as current and update originalImage state
                const originalImageData = {
                  uri: originalUri,
                  width: imageSize.width || 0,
                  height: imageSize.height || 0
                };
                
                setCapturedImage(originalImageData);
                setOriginalImage(originalImageData);
                
                return;
              } catch (error) {
                logger.warn('[KanjiScanner] Error getting original image dimensions for forward navigation:', error);
              }
            }
          }
          
          logger.log('[KanjiScanner] No more valid images in forward history');
          return;
        }
        
        // Save current image to backward history
        const updatedImageHistory = [...imageHistory, capturedImage];
        setImageHistory(updatedImageHistory);
        
        // Set next image as the current image
        setCapturedImage(nextImage);
        
        // If we're going forward to the original image, log this for debugging
        if (originalImage && nextImage.uri === originalImage.uri) {
          logger.log('[KanjiScanner] Restored original image from forward history');
        }
        
        // Remove it from forward history
        const updatedForwardHistory = forwardHistory.slice(0, -1);
        setForwardHistory(updatedForwardHistory);
        
        // Clean up memory when navigating to next image
        try {
          const memoryManager = MemoryManager.getInstance();
          if (await memoryManager.shouldCleanup()) {
            // Collect all URIs that should be preserved (current image, backward history, and remaining forward history)
            const preservedUris = [
              nextImage.uri, 
              ...updatedImageHistory.map(img => img.uri),
              ...updatedForwardHistory.map(img => img.uri)
            ].filter(uri => typeof uri === 'string') as string[];
            
            // Always add the original image URI to the preserved list if it exists
            if (originalImage && originalImage.uri) {
              if (!preservedUris.includes(originalImage.uri)) {
                preservedUris.push(originalImage.uri);
                logger.log('[KanjiScanner] Adding original image to preserved URIs during forward navigation:', originalImage.uri);
              }
            }
            
            logger.log('[KanjiScanner] Preserving URIs during forward navigation cleanup:', preservedUris);
            
            // Clean up images except for the preserved ones
            if (preservedUris.length > 0) {
              await memoryManager.cleanupPreviousImages(...preservedUris);
            } else {
              await memoryManager.cleanupPreviousImages();
            }
          }
          logger.log('[KanjiScanner] Memory cleanup completed after navigating to next image');
        } catch (cleanupError) {
          logger.warn('[KanjiScanner] Memory cleanup failed after navigating to next image:', cleanupError);
        }
      } catch (error) {
        logger.warn('[KanjiScanner] Error checking if next image exists:', error);
        
        // Remove the potentially problematic image from forward history
        const updatedForwardHistory = forwardHistory.slice(0, -1);
        setForwardHistory(updatedForwardHistory);
        
        // Try again with the next image in forward history if available
        if (updatedForwardHistory.length > 0) {
          logger.log('[KanjiScanner] Trying next image in forward history after error');
          return handleForwardToNextImage();
        }
      }
    }
  };

  // Add an effect to check if a crop region exists when in crop mode
  React.useEffect(() => {
    if (cropModeActive) {
      // Use an interval to check crop status since it might change
      const checkInterval = setInterval(() => {
        const hasCrop = !!imageHighlighterRef.current?.hasCropRegion;
        if (hasCrop !== hasCropSelection) {
          setHasCropSelection(hasCrop);
        }
      }, 100);
      
      return () => clearInterval(checkInterval);
    } else {
      setHasCropSelection(false);
    }
  }, [cropModeActive, hasCropSelection]);

  // Clear highlight when the screen comes into focus and restore original image if needed
  useFocusEffect(
    React.useCallback(() => {
      // Track if we're returning from another screen vs just interacting
      const isReturningFromAnotherScreen = hasLostFocusRef.current;
      
      if (capturedImage) {
        // Clear any lingering highlight boxes or selections only if returning from another screen
        if (isReturningFromAnotherScreen) {
          logger.log('[KanjiScanner] Returning from another screen, clearing highlight box');
          imageHighlighterRef.current?.clearHighlightBox?.();
          setHighlightRegion(null);
          setHasHighlightSelection(false);
          
          // Only deactivate highlight mode if we're returning from another screen
          if (highlightModeActive) {
            logger.log('[KanjiScanner] Returning from another screen: Clearing highlight mode');
            setHighlightModeActive(false);
          }
          
          // Check if the current image still exists (it might have been deleted after saving a flashcard)
          if (returningFromFlashcards && capturedImage.uri) {
            FileSystem.getInfoAsync(capturedImage.uri).then(fileInfo => {
              if (!fileInfo.exists) {
                logger.log('[KanjiScanner] Current image no longer exists after flashcard save:', capturedImage.uri);
                
                // Remove the deleted image from forward history if it's there
                setForwardHistory(prev => prev.filter(img => img.uri !== capturedImage.uri));
                
                // If we have original image, use that
                if (originalImage) {
                  logger.log('[KanjiScanner] Restoring original image after flashcard save');
                  setCapturedImage(originalImage);
                } else if (imageHistory.length > 0) {
                  // Otherwise use the last image in history
                  logger.log('[KanjiScanner] Using last image in history after flashcard save');
                  const lastImage = imageHistory[imageHistory.length - 1];
                  setCapturedImage(lastImage);
                  setImageHistory(prev => prev.slice(0, -1));
                }
              }
            }).catch(err => {
              logger.warn('[KanjiScanner] Error checking if image exists:', err);
            });
          }
        }
      }
      
      // When returning from flashcards, we want to keep showing the cropped image
      // that the user was working with, not immediately restore the original image.
      // The original image is still accessible via the back button.
      if (returningFromFlashcards) {
        logger.log('[KanjiScanner] Returning from flashcards, keeping current cropped image');
        
        // Just reset the returning flag without changing the image
        setReturningFromFlashcards(false);
        
        // Make sure the original image is still stored for later access
        if (!originalImage && capturedImage) {
          logger.log('[KanjiScanner] No original image stored, setting current as original');
          setOriginalImage(capturedImage);
        }
      }
      
      return () => {
        // Cleanup function
      };
    }, [capturedImage, originalImage, returningFromFlashcards, highlightModeActive, imageHistory])
  );

  // Track if we've already measured the checkmark button for this walkthrough session
  const hasRegisteredCheckmarkRef = React.useRef(false);

  // Measure and update checkmark button layout when highlight selection is made
  React.useEffect(() => {
    if (isWalkthroughActive && currentStep?.id === 'confirm-highlight' && hasHighlightSelection) {
      if (!hasRegisteredCheckmarkRef.current && checkmarkButtonRef.current) {
        hasRegisteredCheckmarkRef.current = true;
        // Measure the checkmark button and update the step layout
        checkmarkButtonRef.current.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            updateStepLayout('confirm-highlight', { x, y, width, height });
          }
        });
      }
    } else if (currentStep?.id !== 'confirm-highlight') {
      // Reset the flag when leaving the confirm-highlight step
      hasRegisteredCheckmarkRef.current = false;
    }
  }, [isWalkthroughActive, currentStep?.id, hasHighlightSelection, updateStepLayout]);

  // Toggle rotate mode
  const toggleRotateMode = async () => {
    // Validate image before entering rotate mode
    if (!rotateModeActive) {
      const isValid = await validateCurrentImage();
      if (!isValid) {
        logger.error('[KanjiScanner] Cannot enter rotate mode - image validation failed');
        return;
      }
    }
    
    // If already in rotate mode, calling this will turn it off.
    // If in another mode, it will switch to rotate mode.
    const newRotateMode = !rotateModeActive;

    if (newRotateMode) {
      // Exit other modes if they're active before entering rotate mode
      if (highlightModeActive) {
        setHighlightModeActive(false);
        // Potentially clear highlight selection if needed
        setHasHighlightSelection(false);
        setHighlightRegion(null);
        imageHighlighterRef.current?.clearHighlightBox?.(); 
      }
      if (cropModeActive) {
        setCropModeActive(false);
        imageHighlighterRef.current?.toggleCropMode(); // Ensure IH exits crop mode
        imageHighlighterRef.current?.clearCropBox?.();
      }
    }
    // else: if turning OFF rotate mode, cancelActiveMode is typically used for explicit cancel.
    // If toggled off by activating another mode, IH.toggleRotateMode will handle IH state.

    setRotateModeActive(newRotateMode);
    imageHighlighterRef.current?.toggleRotateMode(); // Tell ImageHighlighter to toggle its internal state

    // Button states (currentRotationUIState, etc.) will be updated by the useEffect
  };

  // New Rotation Handlers
  const handleConfirmRotation = async () => {
    if (!imageHighlighterRef.current || !capturedImage) return;
    logger.log('[KanjiScanner] Confirming rotation...', 'Current image dimensions:', capturedImage.width, 'x', capturedImage.height);
    
    // Set loading state before starting the rotation process
    setLocalProcessing(true);
    
    try {
      const result = await imageHighlighterRef.current.confirmCurrentRotation();
      if (result && result.uri !== capturedImage.uri) { // Check if image actually changed
        // First add current image to history
        setImageHistory(prev => [...prev, capturedImage]);
        setForwardHistory([]);
        
        // Determine if we're rotating by 90 or 270 degrees, which would swap width/height
        const isOrientationChange = 
          Math.abs(Math.abs(result.width - capturedImage.width) - Math.abs(result.height - capturedImage.height)) < 10;
        
        // Simple direct replacement - preserve exact dimensions from result
        logger.log('[KanjiScanner] Setting new image with UNMODIFIED dimensions:', result.width, 'x', result.height);
        
        setCapturedImage({
          uri: result.uri,
          width: result.width,
          height: result.height 
        });
        
        logger.log('[KanjiScanner] Rotation confirmed with dimensions:', 
          result.width, 'x', result.height, 
          isOrientationChange ? '(orientation changed)' : '(orientation preserved)');
      }
    } catch (error) {
      logger.error('[KanjiScanner] Error confirming rotation:', error);
      Alert.alert(t('common.error'), t('camera.rotationError'));
    } finally {
      // Always clean up state regardless of success or failure
      imageHighlighterRef.current?.toggleRotateMode(); // Explicitly exit rotate mode in ImageHighlighter
      setRotateModeActive(false); // Exit rotate mode in KanjiScanner state
      setLocalProcessing(false);
      
      // Clean up memory after rotation operation
      try {
        const memoryManager = MemoryManager.getInstance();
        if (await memoryManager.shouldCleanup()) {
          await memoryManager.cleanupPreviousImages(capturedImage?.uri);
        }
        logger.log('[KanjiScanner] Memory cleanup completed after rotation');
      } catch (cleanupError) {
        logger.warn('[KanjiScanner] Memory cleanup failed after rotation:', cleanupError);
      }
    }
  };

  const handleUndoRotation = () => {
    imageHighlighterRef.current?.undoRotationChange();
    // Button states will be updated by the useEffect
  };

  const handleRedoRotation = () => {
    imageHighlighterRef.current?.redoRotationChange();
    // Button states will be updated by the useEffect
  };

  // Create dynamic styles based on calculated dimensions
  const styles = useMemo(() => createStyles(
    REVIEWER_TOP_OFFSET,
    REVIEWER_MAX_HEIGHT
  ), [REVIEWER_TOP_OFFSET, REVIEWER_MAX_HEIGHT]);

  const showTouchBlock = blockTouchesBeforeWalkthrough && !isWalkthroughActive && !walkthroughEverEndedRef.current;

  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        // const { x, y, width, height } = event.nativeEvent.layout;
        // logger.log(`[KanjiScannerRootView] onLayout: x:${x}, y:${y}, width:${width}, height:${height}`);
      }}
    >
      {/* Block touches in the brief window after loading overlay is gone but before walkthrough modal appears */}
      {showTouchBlock && (
        <View
          style={[StyleSheet.absoluteFill, { zIndex: 1700 }]}
          pointerEvents="auto"
        />
      )}
      {/* Off-screen masked image capture for stroke-based OCR (rendered when maskCaptureParams is set) */}
      {maskCaptureParams && (
        <View
          ref={maskCaptureViewRef}
          style={{
            position: 'absolute',
            left: -9999,
            top: 0,
            width: maskCaptureParams.width,
            height: maskCaptureParams.height,
            opacity: 0.01,
            pointerEvents: 'none',
          }}
          collapsable={false}
        >
          <MaskedImageCapture
            imageDataUri={maskCaptureParams.imageDataUri}
            width={maskCaptureParams.width}
            height={maskCaptureParams.height}
            strokes={maskCaptureParams.strokes}
            strokeWidth={maskCaptureParams.strokeWidth}
          />
        </View>
      )}
      {/* Early return when navigating - prevents the component from rendering during transition */}
      {/* This is the industry standard approach: remove from component tree instead of just hiding */}
      {isNavigatingToFlashcardsRef.current ? null : (
        <>
          {/* Always-mounted global overlay for guaranteed paint order */}
          <Animated.View
            pointerEvents={(isImageProcessing || isGlobalOverlayVisible) ? 'auto' : 'none'}
            style={[
              styles.loadingOverlay,
              { opacity: globalOverlayOpacity }
            ]}
          >
            <ActivityIndicator size="large" color={COLORS.primary} />
          </Animated.View>
          {!capturedImage ? (
            <>
          {/* Badge + Settings Buttons */}
          {!capturedImage && (
            <>
              <View style={styles.topRightButtonRow}>
                <TouchableOpacity
                  style={[
                    styles.badgeButtonTouchable,
                    (localProcessing || isImageProcessing) ? styles.disabledButton : null
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    router.push('/badges');
                  }}
                  disabled={localProcessing || isImageProcessing}
                >
                  <Ionicons
                    name="medal-outline"
                    size={28}
                    color="grey"
                  />
                </TouchableOpacity>
                <WalkthroughTarget
                  targetRef={settingsButtonRef}
                  stepId="settings"
                  currentStepId={currentStep?.id}
                  isWalkthroughActive={isWalkthroughActive}
                  style={styles.settingsButton}
                  highlightStyle={styles.highlightedSettingsButtonWrapper}
                >
                  <TouchableOpacity 
                    style={[
                      styles.settingsButtonTouchable,
                      (localProcessing || isImageProcessing) ? styles.disabledButton : null
                    ]} 
                    onPress={handleOpenSettings}
                    disabled={localProcessing || isImageProcessing || (isWalkthroughActive && currentStep?.id !== 'settings')}
                  >
                    <Ionicons 
                      name="menu-outline" 
                      size={30} 
                      color={
                        isWalkthroughActive
                          ? (currentStep?.id === 'settings' ? '#FFFF00' : '#CCCCCC')
                          : 'grey'
                      } 
                    />
                  </TouchableOpacity>
                </WalkthroughTarget>
              </View>
              
              {/* API Usage Energy Bar + Streak (fire) indicator */}
              <View style={styles.energyBarRow}>
                <APIUsageEnergyBar style={styles.energyBarInRow} />
                <View style={styles.energyBarFireIndicator}>
                  <Ionicons name="flame" size={10} color="#F59E0B" style={styles.energyBarFireIcon} />
                  <Text style={styles.energyBarStreakCount} numberOfLines={1}>
                    {streakCount}
                  </Text>
                </View>
              </View>
              
            </>
          )}
          
          {/* Random Card Reviewer */}
          <View 
            ref={reviewerContainerRef} 
            collapsable={false} 
            style={styles.reviewerContainer}
          >
            <RandomCardReviewer
              onCardSwipe={onCardSwipe}
              onContentReady={onContentReady}
              collectionsButtonRef={collectionsButtonRef}
              reviewButtonRef={reviewButtonRef}
              isWalkthroughActive={isWalkthroughActive}
              currentWalkthroughStepId={currentStep?.id}
              walkthroughJustCompleted={walkthroughJustCompleted}
              onSwipeInstructionsDismissed={() => setWalkthroughJustCompleted(false)}
              isSignInPromptVisible={isSignInPromptVisible}
            />
          </View>
          
          {/* Button Row - moved below the reviewer */}
          <View style={styles.buttonRow}>
            {/* Add Custom Card Button (leftmost) */}
            <View 
              ref={customCardButtonRef} 
              collapsable={false} 
              pointerEvents={isWalkthroughActive && currentStep?.id !== 'custom-card' ? 'none' : 'auto'}
              style={isWalkthroughActive && currentStep?.id === 'custom-card' ? styles.highlightedButtonWrapper : null}
            >
              <PokedexButton
                onPress={(canCreateFlashcard && !isAPILimitExhausted && isConnected) ? handleTextInput : showUpgradeAlert}
                icon={isWalkthroughActive ? "add" : ((canCreateFlashcard && !isAPILimitExhausted && isConnected) ? "add" : "lock-closed")}
                iconColor={
                  isWalkthroughActive && currentStep?.id === 'custom-card'
                    ? '#FBBF24' // Warm amber for highlighted
                    : isWalkthroughActive
                    ? '#94A3B8' // Slate grey for non-highlighted during walkthrough
                    : '#000000' // Black icon color
                }
                color="grey"
                size="medium"
                shape="square"
                style={styles.rowButton}
                disabled={!isConnected || localProcessing || isImageProcessing || (isWalkthroughActive && currentStep?.id !== 'custom-card')}
                darkDisabled={isAPILimitExhausted || !canCreateFlashcard || !isConnected || localProcessing || isImageProcessing}
              />
            </View>
            {/* Check Flashcards Button */}
            <View 
              ref={flashcardsButtonRef} 
              collapsable={false} 
              pointerEvents={isWalkthroughActive && currentStep?.id !== 'flashcards' ? 'none' : 'auto'}
              style={isWalkthroughActive && currentStep?.id === 'flashcards' ? styles.highlightedButtonWrapper : null}
            >
              <PokedexButton
                onPress={handleNavigateToSavedFlashcards}
                materialCommunityIcon="cards"
                iconColor={
                  isWalkthroughActive && currentStep?.id === 'flashcards'
                    ? '#FBBF24' // Warm amber for highlighted
                    : isWalkthroughActive
                    ? '#94A3B8' // Slate grey for non-highlighted during walkthrough
                    : '#000000' // Black icon color
                }
                color="grey"
                size="medium"
                shape="square"
                style={styles.rowButton}
                disabled={localProcessing || isImageProcessing || (isWalkthroughActive && currentStep?.id !== 'flashcards')}
              />
            </View>
            {/* Gallery Button */}
            <WalkthroughTarget
              targetRef={galleryButtonRef} 
              stepId="gallery"
              currentStepId={currentStep?.id}
              activeIds={['gallery-confirm']}
              isWalkthroughActive={isWalkthroughActive}
              highlightStyle={styles.highlightedButtonWrapper}
              dimStyle={styles.dimmedToolbarButton}
              pointerEventsWhenInactive="none"
            >
              <PokedexButton
                onPress={(canCreateFlashcard && !isAPILimitExhausted && isConnected) ? pickImage : showUpgradeAlert}
                icon={isWalkthroughActive ? "images" : ((isAPILimitExhausted || !canCreateFlashcard || !isConnected || isImageProcessing || localProcessing) ? "lock-closed" : "images")}
                iconColor={
                  isWalkthroughActive && (currentStep?.id === 'gallery' || currentStep?.id === 'gallery-confirm')
                    ? '#FBBF24' // Warm amber for highlighted
                    : isWalkthroughActive
                    ? '#94A3B8' // Slate grey for non-highlighted during walkthrough
                    : '#000000' // Black icon color
                }
                color="grey"
                size="medium"
                shape="square"
                style={styles.rowButton}
                disabled={
                  !isConnected || localProcessing || isImageProcessing ||
                  (isWalkthroughActive && currentStep?.id !== 'gallery' && currentStep?.id !== 'gallery-confirm')
                }
                darkDisabled={isAPILimitExhausted || !canCreateFlashcard || !isConnected || localProcessing || isImageProcessing}
              />
            </WalkthroughTarget>
            {/* Camera Button (rightmost) */}
            <View 
              ref={cameraButtonRef} 
              collapsable={false} 
              pointerEvents={isWalkthroughActive && currentStep?.id !== 'camera' ? 'none' : 'auto'}
              style={isWalkthroughActive && currentStep?.id === 'camera' ? styles.highlightedButtonWrapper : null}
            >
              {isWalkthroughActive ? (
                // During walkthrough, always show camera icon
                <PokedexButton
                  onPress={() => {}} // No action during walkthrough
                  icon="camera"
                  iconColor={
                    currentStep?.id === 'camera' 
                      ? '#FBBF24' // Warm amber for highlighted
                      : '#94A3B8' // Slate grey for non-highlighted during walkthrough
                  }
                  color="grey"
                  size="medium"
                  shape="square"
                  style={styles.rowButton}
                  disabled={currentStep?.id !== 'camera'}
                />
              ) : isImageProcessing || localProcessing || !isConnected ? (
                <PokedexButton
                  onPress={() => {}} // No action when disabled
                  icon="lock-closed"
                  iconColor="#64748B"
                  color="grey"
                  size="medium"
                  shape="square"
                  style={styles.rowButton}
                  disabled={true}
                  darkDisabled={true}
                />
              ) : (
                <CameraButton 
                  onPhotoCapture={handlePhotoCapture} 
                  style={styles.rowButton}
                  onProcessingStateChange={setIsImageProcessing}
                  disabled={isAPILimitExhausted || !canCreateFlashcard || !isConnected || localProcessing || isImageProcessing}
                  onDisabledPress={showUpgradeAlert}
                  darkDisabled={isAPILimitExhausted || !canCreateFlashcard || !isConnected || localProcessing || isImageProcessing}
                />
              )}
            </View>
          </View>
        </>
      ) : (
        <View style={styles.imageContainer}>
          <ImageHighlighter
            ref={imageHighlighterRef}
            imageUri={capturedImage.uri}
            imageWidth={capturedImage.width}
            imageHeight={capturedImage.height}
            highlightModeActive={highlightModeActive}
            onActivateHighlightMode={activateHighlightMode}
            onRegionSelected={handleRegionSelected}
            onRotationStateChange={handleRotationStateChange}
            onImageLoaded={() => {
              // Hide overlay only after image has loaded to prevent flicker
              setIsImageProcessing(false);
              hideGlobalOverlay('imageLoaded');
            }}
          />
          
      <View style={styles.toolbar}>
        {/* Back Button (far left) */}
        <PokedexButton
          onPress={handleCancel}
          icon="arrow-back"
          iconColor="#FFFFFF"
          size="medium"
          shape="square"
          style={styles.toolbarFarButton}
          disabled={localProcessing || isImageProcessing}
        />

            {/* Flexible spacer to push center controls to the right */}
            <View style={{ flex: 1 }} />

            {/* Center Controls Column */}
            <View style={styles.toolbarCenterControls}>
              {/* Image History Undo/Redo Buttons (Top row in center) */}
              {!localProcessing && 
               (!highlightModeActive && !cropModeActive && !rotateModeActive) && 
               (imageHistory.length > 0 || forwardHistory.length > 0) && (
                <View style={[styles.toolbarButtonGroup, styles.historyButtonsContainer]}>
                  <PokedexButton
                    onPress={handleBackToPreviousImage}
                    icon="arrow-undo"
                    iconColor={(imageHistory.length === 0 || localProcessing || isImageProcessing) ? '#888888' : '#FFFFFF'}
                    size="medium"
                    shape="square"
                    disabled={imageHistory.length === 0 || localProcessing || isImageProcessing}
                    darkDisabled={imageHistory.length === 0 || localProcessing || isImageProcessing}
                  />
                  <PokedexButton
                    onPress={handleForwardToNextImage}
                    icon="arrow-redo"
                    iconColor={(forwardHistory.length === 0 || localProcessing || isImageProcessing) ? '#888888' : '#FFFFFF'}
                    size="medium"
                    shape="square"
                    disabled={forwardHistory.length === 0 || localProcessing || isImageProcessing}
                    darkDisabled={forwardHistory.length === 0 || localProcessing || isImageProcessing}
                  />
                </View>
              )}

              {/* Mode Activation / Confirmation Buttons (Bottom row in center or replaces history) */}
              <View style={styles.toolbarButtonGroup}>
                {/* Mode Activation Buttons (Highlight, Crop, Rotate) */}
                {!highlightModeActive && !cropModeActive && !rotateModeActive && !localProcessing && !isNavigating && (
                  <>
                    <WalkthroughTarget
                      targetRef={rotateButtonRef}
                      stepId="rotate"
                      currentStepId={currentStep?.id}
                      isWalkthroughActive={isWalkthroughActive}
                      highlightStyle={styles.highlightedToolbarButtonWrapper}
                      dimStyle={styles.dimmedToolbarButton}
                    >
                      <PokedexButton
                        onPress={toggleRotateMode}
                        icon="refresh"
                        iconColor={
                          isWalkthroughActive
                            ? (currentStep?.id === 'rotate' ? '#FFFF00' : '#CCCCCC')
                            : '#FFFFFF'
                        }
                        size="medium"
                        shape="square"
                        disabled={localProcessing || isImageProcessing || (isWalkthroughActive && currentStep?.id !== 'rotate')}
                      />
                    </WalkthroughTarget>
                    <WalkthroughTarget
                      targetRef={cropButtonRef}
                      stepId="crop"
                      currentStepId={currentStep?.id}
                      isWalkthroughActive={isWalkthroughActive}
                      highlightStyle={styles.highlightedToolbarButtonWrapper}
                      dimStyle={styles.dimmedToolbarButton}
                    >
                      <PokedexButton
                        onPress={toggleCropMode}
                        icon="crop"
                        iconColor={
                          isWalkthroughActive
                            ? (currentStep?.id === 'crop' ? '#FFFF00' : '#CCCCCC')
                            : '#FFFFFF'
                        }
                        size="medium"
                        shape="square"
                        disabled={localProcessing || isImageProcessing || (isWalkthroughActive && currentStep?.id !== 'crop')}
                      />
                    </WalkthroughTarget>
                    <WalkthroughTarget
                      targetRef={highlightButtonRef}
                      stepId="highlight"
                      currentStepId={currentStep?.id}
                      isWalkthroughActive={isWalkthroughActive}
                      highlightStyle={styles.highlightedToolbarButtonWrapper}
                      dimStyle={styles.dimmedToolbarButton}
                    >
                      <PokedexButton
                        onPress={activateHighlightMode}
                        icon="create-outline"
                        iconColor={
                          isWalkthroughActive
                            ? (currentStep?.id === 'highlight' ? '#FFFF00' : '#CCCCCC')
                            : '#FFFFFF'
                        }
                        size="medium"
                        shape="square"
                        disabled={localProcessing || isImageProcessing || (isWalkthroughActive && currentStep?.id !== 'highlight')}
                      />
                    </WalkthroughTarget>
                  </>
                )}
                
                {/* Confirmation buttons when a mode IS active */}
                {(highlightModeActive || cropModeActive || rotateModeActive) && !localProcessing && !isNavigating && (
                  <>
                    <PokedexButton
                      onPress={cancelActiveMode} 
                      icon="close"
                      iconColor="#FFFFFF"
                      size="medium"
                      shape="square"
                      disabled={localProcessing || isImageProcessing}
                    />
                    
                    {hasHighlightSelection && highlightModeActive && (
                      <>
                        <PokedexButton
                          onPress={discardHighlightSelection} 
                          icon="refresh-outline" 
                          iconColor="#FFFFFF"
                          size="medium"
                          shape="square"
                          disabled={localProcessing || isImageProcessing}
                        />
                        <WalkthroughTarget
                          targetRef={checkmarkButtonRef}
                          stepId="confirm-highlight"
                          currentStepId={currentStep?.id}
                          isWalkthroughActive={isWalkthroughActive}
                          highlightStyle={styles.highlightedToolbarButtonWrapper}
                          dimStyle={styles.dimmedToolbarButton}
                        >
                          <PokedexButton
                            onPress={confirmHighlightSelection}
                            icon="checkmark"
                            iconColor={
                              isWalkthroughActive
                                ? (currentStep?.id === 'confirm-highlight' ? '#FFFF00' : '#CCCCCC')
                                : '#FFFFFF'
                            }
                            size="medium"
                            shape="square"
                            disabled={localProcessing || isImageProcessing || (isWalkthroughActive && currentStep?.id !== 'confirm-highlight')}
                          />
                        </WalkthroughTarget>
                      </>
                    )}
  
                    {cropModeActive && hasCropSelection && (
                      <>
                        <PokedexButton
                          onPress={discardCropSelection}
                          icon="refresh-outline" 
                          iconColor="#FFFFFF"
                          size="medium"
                          shape="square"
                          disabled={localProcessing || isImageProcessing}
                        />
                        <PokedexButton
                          onPress={confirmCrop}
                          icon="checkmark"
                          iconColor="#FFFFFF"
                          size="medium"
                          shape="square"
                          disabled={localProcessing || isImageProcessing}
                        />
                      </>
                    )}

                    {/* Rotate Mode Specific Buttons */}
                    {rotateModeActive && currentRotationUIState && (
                      <>
                        {currentRotationUIState.canUndo && (
                          <PokedexButton
                            onPress={handleUndoRotation}
                            icon="arrow-undo"
                            iconColor="#FFFFFF"
                            size="medium"
                            shape="square"
                          disabled={localProcessing || isImageProcessing}
                          />
                        )}
                        {currentRotationUIState.canRedo && (
                          <PokedexButton
                            onPress={handleRedoRotation}
                            icon="arrow-redo"
                            iconColor="#FFFFFF"
                            size="medium"
                            shape="square"
                          disabled={localProcessing || isImageProcessing}
                          />
                        )}
                        {currentRotationUIState.hasRotated && (
                          <PokedexButton
                            onPress={handleConfirmRotation}
                            icon="checkmark"
                            iconColor="#FFFFFF"
                            size="medium"
                            shape="square"
                            disabled={localProcessing || isImageProcessing}
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </View>
            </View>
          </View>
          
          {/* Loading indicator for local processing (OCR, rotation, etc.) */}
          {localProcessing && (
            <View style={styles.localProcessingOverlay}>
              <ActivityIndicator size="large" color="black" />
            </View>
          )}

          {/* Display either rotation error or general error */}
          {(error || rotateError) && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{rotateError || error}</Text>
            </View>
          )}
        </View>
      )}

      {/* Note: global overlay above replaces conditional overlay */}

      {/* Text Input Modal */}
      <Modal
        visible={showTextInputModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelTextInput}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          style={styles.modalContainer}
          pointerEvents="box-none"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent} pointerEvents="box-none">
            <View pointerEvents="auto">
              <ScrollView 
                style={styles.modalScrollContent}
                contentContainerStyle={styles.modalScrollContentContainer}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <TextInput
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  placeholder={t('textInput.placeholder')}
                  placeholderTextColor="#999"
                  autoFocus
                  editable
                />
              </ScrollView>
            </View>
            <View style={styles.modalFooter} pointerEvents="auto">
              <View style={styles.modalButtonsContainer}>
                <TouchableOpacity 
                  style={styles.modalButton} 
                  onPress={handleCancelTextInput}
                  disabled={localProcessing || isImageProcessing}
                >
                  <LinearGradient
                    colors={(localProcessing || isImageProcessing) 
                      ? ['rgba(100, 116, 139, 0.5)', 'rgba(71, 85, 105, 0.6)']
                      : ['rgba(140, 140, 140, 0.35)', 'rgba(100, 100, 100, 0.45)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {!(localProcessing || isImageProcessing) && (
                    <LinearGradient
                      colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 0.6 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <View style={styles.modalButtonContent}>
                    <Text style={styles.modalButtonText}>{t('textInput.cancel')}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.modalButton,
                    isAPILimitExhausted ? styles.disabledButton : null,
                    isAPILimitExhausted ? styles.darkDisabledButton : null
                  ]} 
                  onPress={() => {
                    if (localProcessing || isImageProcessing) return;
                    if (isAPILimitExhausted) {
                      showAPILimitUpgradeAlert('wordscope');
                    } else {
                      handleWordScopeTextInput();
                    }
                  }}
                  disabled={localProcessing || isImageProcessing || isLoadingAPILimits}
                >
                  <LinearGradient
                    colors={(localProcessing || isImageProcessing || isAPILimitExhausted) 
                      ? ['rgba(100, 116, 139, 0.5)', 'rgba(71, 85, 105, 0.6)']
                      : ['rgba(140, 140, 140, 0.35)', 'rgba(100, 100, 100, 0.45)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {!(localProcessing || isImageProcessing || isAPILimitExhausted) && (
                    <LinearGradient
                      colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 0.6 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <View style={styles.modalButtonContent}>
                    <View style={styles.modalDualIconContainer}>
                      {isAPILimitExhausted ? (
                        <Ionicons name="lock-closed" size={16} color={COLORS.darkGray} />
                      ) : (
                        <>
                          <FontAwesome5 
                            name="microscope" 
                            size={14} 
                            color="#ffffff" 
                          />
                          <Ionicons 
                            name="language" 
                            size={14} 
                            color="#ffffff" 
                          />
                        </>
                      )}
                    </View>
                    <Text style={[
                      styles.modalWordScopeButtonText,
                      isAPILimitExhausted ? { color: COLORS.darkGray } : null
                    ]}>
                      {isAPILimitExhausted ? 'Locked' : t('textInput.wordScope')}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.modalButton,
                    isAPILimitExhausted ? styles.disabledButton : null,
                    isAPILimitExhausted ? styles.darkDisabledButton : null
                  ]} 
                  onPress={() => {
                    if (localProcessing || isImageProcessing) return;
                    if (isAPILimitExhausted) {
                      showAPILimitUpgradeAlert('translate');
                    } else {
                      handleSubmitTextInput();
                    }
                  }}
                  disabled={localProcessing || isImageProcessing || isLoadingAPILimits}
                >
                  <LinearGradient
                    colors={(localProcessing || isImageProcessing || isAPILimitExhausted) 
                      ? ['rgba(100, 116, 139, 0.5)', 'rgba(71, 85, 105, 0.6)']
                      : ['rgba(140, 140, 140, 0.35)', 'rgba(100, 100, 100, 0.45)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {!(localProcessing || isImageProcessing || isAPILimitExhausted) && (
                    <LinearGradient
                      colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 0.6 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <View style={styles.modalButtonContent}>
                    <Ionicons 
                      name={isAPILimitExhausted ? "lock-closed" : "language"} 
                      size={14} 
                      color={isAPILimitExhausted ? COLORS.darkGray : "#ffffff"} 
                      style={styles.modalButtonIcon}
                    />
                    <Text style={[
                      styles.modalButtonText,
                      isAPILimitExhausted ? { color: COLORS.darkGray } : null
                    ]}>
                      {isAPILimitExhausted ? 'Locked' : t('textInput.translate')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Walkthrough Overlay - completely excluded from tree when navigating to prevent flash */}
      {/* Debug log for walkthrough visibility */}
      {(() => { console.log('[DEBUG KanjiScanner Walkthrough] visible check:', { isWalkthroughActive, hideWalkthroughOverlay, isNavigatingToFlashcards, isNavigatingRef: isNavigatingToFlashcardsRef.current, shouldRender: !isNavigatingToFlashcards && !isNavigatingToFlashcardsRef.current, currentStepId: currentStep?.id }); return null; })()}
      {!isNavigatingToFlashcards && !isNavigatingToFlashcardsRef.current && (
        <WalkthroughOverlay
          visible={isWalkthroughActive && !hideWalkthroughOverlay && !isImageProcessing && !isGlobalOverlayVisible}
          currentStep={currentStep}
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
          onNext={handleWalkthroughNext}
          onPrevious={handleWalkthroughPrevious}
          onSkip={handleSkipWalkthrough}
          onDone={handleWalkthroughDone}
          customNextLabel={
            currentStep?.id === 'crop' ? t('walkthrough.crop.cta') :
            currentStep?.id === 'highlight' ? t('walkthrough.highlight.cta') :
            currentStep?.id === 'confirm-highlight' ? t('common.next') :
            undefined
          }
          treatAsNonFinal={currentStep?.id === 'confirm-highlight'}
        />
      )}
        </>
      )}
    </View>
  );
}

// Create styles dynamically based on calculated dimensions
const createStyles = (reviewerTopOffset: number, reviewerMaxHeight: number) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000', // Black screen behind uploaded image
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 45, 85, 0.8)',
    padding: 10,
    borderRadius: 8,
    position: 'absolute',
    bottom: 20,
    right: 20,
    left: 100,
    zIndex: 999,
  },
  errorText: {
    fontFamily: FONTS.sansBold,
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  energyBarRow: {
    position: 'absolute',
    top: 16,
    left: 15,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 950, // Above reviewer (900) so energy bar is not obscured
  },
  energyBarFireIndicator: {
    minWidth: 26,
    height: 19,
    borderRadius: 4,
    backgroundColor: COLORS.mediumSurface,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    marginLeft: 6,
    gap: 2,
    flexShrink: 0, // Keep full width for 2–3 digit streak counts
  },
  energyBarFireIcon: {
    marginTop: 0,
  },
  energyBarStreakCount: {
    fontFamily: FONTS.sansSemiBold,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text,
    minWidth: 8,
    textAlign: 'center',
  },
  energyBarInRow: {
    marginLeft: 0,
    flexShrink: 0, // Prevent energy bar from shrinking in row
  },
  topRightButtonRow: {
    position: 'absolute',
    top: 5,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 800,
  },
  badgeButtonTouchable: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  settingsButton: {
    // No position - lives inside topRightButtonRow
  },
  settingsButtonTouchable: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  highlightedSettingsButtonWrapper: {
    padding: 4,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 200, 0, 0.9)',
    shadowColor: '#FFFF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  highlightedToolbarButtonWrapper: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 200, 0, 0.9)',
    shadowColor: '#FFFF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  dimmedToolbarButton: {
    opacity: 0.35,
  },
  swipeCounterContainer: {
    position: 'absolute',
    top: reviewerTopOffset + 10, // Align with header (50px + 10px containerPaddingTop)
    left: 15 + 80 + 8 + 80 + 8 + 20, // Position right after Review button: header padding (15) + Collections button (~80) + margin (8) + Review button (~80) + spacing (8)
    flexDirection: 'row',
    gap: 8,
    zIndex: 1600, // Above loading overlay (1500)
    alignItems: 'center',
    height: 45, // Match header height (45px) to center vertically with collections button
  },
  swipeCounter: {
    padding: 10,
    borderRadius: 10,
    minWidth: 80, // Doubled from 40
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeCounterRight: {
    backgroundColor: 'rgba(52, 199, 89, 1.0)', // Fully opaque green
  },
  swipeCounterText: {
    fontFamily: FONTS.sansBold,
    color: '#FFFFFF', // Pure white
    fontSize: 18, // Slightly larger for better visibility
    fontWeight: '900', // Extra bold
    opacity: 1, // Explicitly set opacity to 1
  },
  buttonIcon: {
    marginRight: 8,
  },
  // Reviewer container style - responsive for all screen sizes
  reviewerContainer: {
    position: 'absolute',
    top: reviewerTopOffset, // Positioned to clear settings button
    transform: [{ translateY: 0 }],
    left: 0,
    right: 0,
    zIndex: 900,
    maxHeight: reviewerMaxHeight, // Calculated to fit available space
  },
  textInputButton: {
    backgroundColor: '#E53170',
    borderRadius: 8,
    width: 80,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: Platform.OS === 'ios' ? 'flex-end' : 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 20,
  },
  modalContent: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    marginBottom: Platform.OS === 'ios' ? 10 : 0,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  modalScrollContent: {
    maxHeight: 300,
  },
  modalScrollContentContainer: {
    padding: 20,
    paddingBottom: 12,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.mediumSurface,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  modalTitle: {
    fontFamily: FONTS.sansBold,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: COLORS.text,
  },
  textInput: {
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    minHeight: 120,
    maxHeight: 180,
    color: COLORS.text,
    backgroundColor: COLORS.mediumSurface,
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  modalButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    // Glassmorphism border
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    // Soft shadow for depth
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Background for gradient overlay
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  modalButtonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dualIconContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  modalDualIconContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 2,
  },
  modalButtonIcon: {
    marginBottom: 4,
  },
  modalButtonText: {
    fontFamily: FONTS.sansBold,
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
    zIndex: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modalWordScopeButtonText: {
    fontFamily: FONTS.sansBold,
    color: 'white',
    fontWeight: 'bold',
    fontSize: 11,
    textAlign: 'center',
    zIndex: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  instructionContainer: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 100,
  },
  instructionText: {
    fontFamily: FONTS.sans,
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
  buttonText: {
    fontFamily: FONTS.sansBold,
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  rotateButton: {
    backgroundColor: '#A0A0B9',
    borderRadius: 8,
    width: 80,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'absolute',
    bottom: 20,
    right: 200, // Position it to the left of the crop button
    zIndex: 999,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  toolbarCenterControls: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  toolbarButtonGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  historyButtonsContainer: {
  },
  toolbarFarButton: {
  },
  buttonGrid: {
    position: 'absolute',
    bottom: 50,
    left: 50,
    right: 50,
    flexDirection: 'column',
  },
  buttonRow: {
    position: 'absolute',
    bottom: 25, // Adjusted from 40 to ensure buttons are above Pokedex bottom decorations
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    zIndex: 800,
  },
  rowButton: {
    marginHorizontal: 12, // Keep the spacing between buttons
    width: 65, // Keep the button size
    height: 65, // Keep the button size
  },
  highlightedButtonWrapper: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 200, 0, 0.9)',
    shadowColor: '#FFFF00',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  gridButton: {
    marginHorizontal: 0,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1500, // Higher than all other UI elements
  },
  localProcessingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -25 }, { translateY: -25 }],
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 25,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    zIndex: 1000,
  },
  disabledButton: {
    opacity: 0.5,
  },
  darkDisabledButton: {
    opacity: 0.3,
    backgroundColor: 'rgba(100, 100, 100, 0.3)',
  },
}); 