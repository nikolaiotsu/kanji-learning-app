import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Dimensions, Animated, ScrollView, LayoutChangeEvent, Image, ActivityIndicator, Easing, PanResponder } from 'react-native';
import { useTranslation } from 'react-i18next';
import i18next from '../../i18n';
import { Flashcard } from '../../types/Flashcard';
import { localizeScopeAnalysisHeadings, parseScopeAnalysisForStyling } from '../../utils/textFormatting';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { useSettings, AVAILABLE_LANGUAGES } from '../../context/SettingsContext';
import FuriganaText from '../shared/FuriganaText';
import PokedexButton from '../shared/PokedexButton';
import { logger } from '../../utils/logger';
import * as Haptics from 'expo-haptics';
import { getCachedImageUri } from '../../services/imageCache';
import { synthesizeAndPlay } from '../../services/ttsService';
import { useAuth } from '../../context/AuthContext';
import { interpolateColor } from '../../utils/styleUtils';
// Removed text formatting imports - no longer needed for direct content analysis

// Responsive card dimensions - calculate before component definition
const { width } = Dimensions.get('window');
const cardWidth = width * 0.9;

interface FlashcardItemProps {
  flashcard: Flashcard;
  onDelete?: (id: string) => void;
  onSend?: (id: string) => void;
  onEdit?: (id: string) => void;
  onImageToggle?: (showImage: boolean) => void;
  onFlip?: () => void; // Called when card flip animation completes (for walkthrough tracking)
  deckName?: string; // Optional deck name to display
  disableTouchHandling?: boolean; // If true, the card won't be flippable via touch
  cardHeight?: number; // Optional responsive card height (defaults to 300 if not provided)
  showRefreshButton?: boolean; // Show refresh button next to image toggle in saved flashcards mode
  isOnline?: boolean; // Whether the app is online (disables write operations when offline)
  isSrsModeActive?: boolean; // Whether review mode is active (for rainbow border effect)
  disableBackdropOverlay?: boolean; // If true, don't show the backdrop overlay (useful in list contexts)
  useScreenBackground?: boolean; // If true, use screen background color instead of black for flipped cards
  /** When the image fails to load (e.g. local file was deleted), call with the card so parent can clear imageUrl and persist */
  onImageLoadFailed?: (flashcard: Flashcard) => void | Promise<void>;
  /** Refs for walkthrough overlay positioning (flip and image buttons) */
  flipButtonRef?: React.RefObject<View>;
  imageButtonRef?: React.RefObject<View>;
  /** Walkthrough state for highlighting buttons during card interaction steps */
  isWalkthroughActive?: boolean;
  currentWalkthroughStepId?: string;
  /** When true, show a flip button beside the image button and disable edge flip gesture (e.g. in Your Collections where cards swipe left/right) */
  showFlipButton?: boolean;
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({ 
  flashcard, 
  onDelete, 
  onSend, 
  onEdit,
  onImageToggle,
  onFlip,
  deckName,
  disableTouchHandling = false,
  cardHeight = 300, // Sensible default for saved-flashcards page
  showRefreshButton = false,
  isOnline = true, // Default to true for backward compatibility
  isSrsModeActive = false, // Default to false
  disableBackdropOverlay = false, // Default to false to maintain existing behavior
  useScreenBackground = false, // Default to false to maintain existing black background
  onImageLoadFailed,
  flipButtonRef,
  imageButtonRef,
  isWalkthroughActive = false,
  currentWalkthroughStepId,
  showFlipButton = false,
}) => {
  const { t } = useTranslation();
  const { targetLanguage, forcedDetectionLanguage } = useSettings();
  const { user } = useAuth();
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  
  // Rainbow border animation
  const rainbowAnim = useRef(new Animated.Value(0)).current;
  const [rainbowBorderColor, setRainbowBorderColor] = useState('#FF0000');
  
  // Image fade animation
  const imageFadeAnim = useRef(new Animated.Value(0)).current;
  // Float animation for flip-card walkthrough arrows
  const flipArrowFloatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSrsModeActive) {
      // Start rainbow animation
      const loop = Animated.loop(
        Animated.timing(rainbowAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      );
      loop.start();
      
      // Listen to animation updates and update border color state
      const listenerId = rainbowAnim.addListener(({ value }) => {
        const colors = [
          '#FF0000', // Red
          '#FF7F00', // Orange
          '#FFFF00', // Yellow
          '#00FF00', // Green
          '#0000FF', // Blue
          '#4B0082', // Indigo
          '#FF0000', // Back to Red (loop)
        ];
        const segment = value * 6;
        const index = Math.floor(segment) % 6;
        const nextIndex = (index + 1) % 6;
        const progress = segment % 1;
        
        // Interpolate between colors
        const color1 = colors[index];
        const color2 = colors[nextIndex];
        const interpolatedColor = interpolateColor(color1, color2, progress);
        setRainbowBorderColor(interpolatedColor);
      });
      
      return () => {
        loop.stop();
        rainbowAnim.removeListener(listenerId);
        rainbowAnim.setValue(0);
      };
    } else {
      setRainbowBorderColor(COLORS.appleLiquidGrey);
    }
  }, [isSrsModeActive, rainbowAnim]);
  
  // Create styles with responsive card height
  const styles = React.useMemo(() => createStyles(cardHeight, useScreenBackground), [cardHeight, useScreenBackground]);
  // Track if content is scrollable (overflow)
  const [frontContentScrollable, setFrontContentScrollable] = useState(false);
  const [backContentScrollable, setBackContentScrollable] = useState(false);
  // Check language and determine if romanization is needed
  const [needsRomanization, setNeedsRomanization] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('');
  // References to the scroll views
  const frontScrollViewRef = useRef<ScrollView>(null);
  const backScrollViewRef = useRef<ScrollView>(null);
  // State for showing the image
  const [showImage, setShowImage] = useState(false);
  // State to track expanded card size when image is shown
  const [expandedCardHeight, setExpandedCardHeight] = useState(0);
  // Track if image is loaded to prevent unnecessary reloads
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  
  // Image loading state management
  type ImageLoadingState = 'idle' | 'loading' | 'success' | 'error';
  const [imageLoadingState, setImageLoadingState] = useState<ImageLoadingState>('idle');
  const [imageRetryCount, setImageRetryCount] = useState(0);
  const [imageUriToUse, setImageUriToUse] = useState<string | undefined>(flashcard.imageUrl);
  const MAX_RETRY_COUNT = 5;

  // TTS (text-to-speech) state for speaker button on back
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  
  
  // Load cached image URI on mount or when image URL changes
  useEffect(() => {
    const loadImageUri = async () => {
      if (flashcard.imageUrl && user) {
        try {
          const cachedUri = await getCachedImageUri(user.id, flashcard.imageUrl);
          setImageUriToUse(cachedUri);
        } catch (error) {
          logger.error('Error loading cached image URI:', error);
          setImageUriToUse(flashcard.imageUrl);
        }
      } else {
        setImageUriToUse(flashcard.imageUrl);
      }
    };
    
    loadImageUri();
  }, [flashcard.imageUrl, user?.id]);
  
  // Get translated language name for display (use the language stored with the flashcard)
  const translatedLanguageName = AVAILABLE_LANGUAGES[flashcard.targetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'English';

  // Format next review date for display
  const formatReviewDate = (date?: Date): string => {
    if (!date) return '';
    try {
      const reviewDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const reviewDateOnly = new Date(reviewDate);
      reviewDateOnly.setHours(0, 0, 0, 0);
      
      const diffTime = reviewDateOnly.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return t('flashcard.reviewDate.dueToday');
      } else if (diffDays === 1) {
        return t('flashcard.reviewDate.dueTomorrow');
      } else if (diffDays === -1) {
        return t('flashcard.reviewDate.dueYesterday');
      } else if (diffDays < 0) {
        return t('flashcard.reviewDate.dueDaysAgo', { days: Math.abs(diffDays) });
      } else {
        // Format as MM/DD/YYYY or use locale-specific format
        const month = reviewDate.getMonth() + 1;
        const day = reviewDate.getDate();
        const year = reviewDate.getFullYear();
        const dateStr = `${month}/${day}/${year}`;
        return t('flashcard.reviewDate.dueDate', { date: dateStr });
      }
    } catch (error) {
      logger.error('Error formatting review date:', error);
      return '';
    }
  };

  const reviewDateText = formatReviewDate(flashcard.nextReviewDate);

  // Determine pronunciation guide type based on content (no language detection needed)
  useEffect(() => {
const readingsText = flashcard.readingsText;

    if (!readingsText) {
      setNeedsRomanization(false);
      setDetectedLanguage('English'); // Default for text without pronunciation guide
      return;
    }

    // Check what type of pronunciation guide the readingsText contains
    const containsHiragana = /[\u3040-\u309F]/.test(readingsText); // Japanese furigana
    const containsHangul = /[\uAC00-\uD7AF]/.test(readingsText); // Korean
    const containsCyrillic = /[\u0400-\u04FF]/.test(readingsText); // Russian
    const containsArabicScript = /[\u0600-\u06FF]/.test(readingsText); // Arabic
    const containsThaiScript = /[\u0E00-\u0E7F]/.test(readingsText); // Thai
    const containsDevanagari = /[\u0900-\u097F]/.test(readingsText); // Hindi
    const containsLatinInParentheses = /\([a-zA-Zāēīōūǎěǐǒǔàèìòùáéíóúǘǜɑ\s\.\-]+\)/.test(readingsText); // Chinese pinyin or other romanization (includes periods for Thai RTGS)

    let language = 'unknown';
    if (containsHiragana) {
      language = 'Japanese';
    } else if (containsLatinInParentheses) {
      // Could be Chinese pinyin, Korean romanization, Russian romanization, Thai RTGS, etc.
      // Check for specific patterns to distinguish
      if (containsHangul) {
        language = 'Korean';
      } else if (containsCyrillic) {
        language = 'Russian';
      } else if (containsArabicScript) {
        language = 'Arabic';
      } else if (containsThaiScript) {
        language = 'Thai';
      } else if (containsDevanagari) {
        language = 'Hindi';
      } else {
        // Default to Chinese for Latin characters in parentheses
        language = 'Chinese';
      }
    } else if (containsHangul) {
      language = 'Korean';
    } else if (containsCyrillic) {
      language = 'Russian';
    } else if (containsArabicScript) {
      language = 'Arabic';
    } else if (containsThaiScript) {
      language = 'Thai';
    } else if (containsDevanagari) {
      language = 'Hindi';
    } else {
      // Fallback: check original text for basic language patterns
      const originalText = flashcard.originalText;
      const latinChars = originalText.replace(/\s+/g, '').split('').filter(char => /[a-zA-Z]/.test(char)).length;
      if (latinChars > 0 && latinChars / originalText.replace(/\s+/g, '').length >= 0.5) {
        language = 'English';
      }
    }
    
    setDetectedLanguage(language);
    setNeedsRomanization(readingsText.length > 0);
  }, [flashcard.readingsText]);

  // Function to handle card flipping (used by edge gesture; respects disableTouchHandling)
  const handleFlip = () => {
    if (disableTouchHandling) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Animate the flip
    Animated.timing(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIsFlipped(!isFlipped);
      onFlip?.();
    });
  };

  // Flip via button (used when showFlipButton is true; always flips regardless of disableTouchHandling)
  const handleFlipButtonPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIsFlipped(!isFlipped);
      onFlip?.();
    });
  };

  const handleTtsPress = useCallback(async () => {
    if (!user?.id || ttsLoading || !flashcard.originalText?.trim()) return;
    setTtsError(null);
    setTtsLoading(true);
    // Prefer flashcard.sourceLanguage (persisted at creation) > forcedDetectionLanguage > heuristic
    const effectiveLanguage = flashcard.sourceLanguage || forcedDetectionLanguage || detectedLanguage || 'unknown';
    const result = await synthesizeAndPlay({
      flashcard,
      detectedLanguage: effectiveLanguage,
      userId: user.id,
    });
    setTtsLoading(false);
    if (!result.success) {
      setTtsError(result.error);
      setTimeout(() => setTtsError(null), 3000);
    }
  }, [user?.id, ttsLoading, flashcard, detectedLanguage, forcedDetectionLanguage]);

  // Refs so edge PanResponders (created once) always see current values
  const disableTouchHandlingRef = useRef(disableTouchHandling);
  disableTouchHandlingRef.current = disableTouchHandling;
  const isFlippedRef = useRef(isFlipped);
  isFlippedRef.current = isFlipped;
  const onFlipRef = useRef(onFlip);
  onFlipRef.current = onFlip;

  // Interactive flip gesture constants (larger range = heavier, less twitchy feel)
  const FLIP_GESTURE_THRESHOLD = 40;   // Min drag to commit the flip
  const FLIP_DRAG_RANGE = 130;         // Drag distance for a full 180° (higher = slower, more resistance)

  // Track haptic thresholds for both directions so we fire at 25%, 50%, 75% each way
  const lastForwardThresholdRef = useRef(-1);
  const lastBackwardThresholdRef = useRef(4);
  const lastProgressRef = useRef(-1);

  // Shared handler: update flipAnim to follow the finger during drag
  const handleFlipGestureMove = useCallback((_: any, gestureState: { dx: number }) => {
    const absDx = Math.abs(gestureState.dx);
    const progress = Math.min(absDx / FLIP_DRAG_RANGE, 1);
    const wasFlipped = isFlippedRef.current;
    flipAnim.setValue(wasFlipped ? 1 - progress : progress);

    const thresholdIndex = Math.floor(progress * 4); // 0..3 for 0–25%, 25–50%, 50–75%, 75–100%
    const lastProgress = lastProgressRef.current;

    if (progress > lastProgress) {
      // Dragging forward (opening the flip): haptic at 25%, 50%, 75%
      if (thresholdIndex > lastForwardThresholdRef.current && thresholdIndex >= 1) {
        lastForwardThresholdRef.current = thresholdIndex;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      lastBackwardThresholdRef.current = 4; // reset so next backward pass gets full haptics
    } else if (progress < lastProgress) {
      // Dragging backward (closing the flip): haptic when crossing 75%, 50%, 25% on the way back
      if (thresholdIndex < lastBackwardThresholdRef.current) {
        lastBackwardThresholdRef.current = thresholdIndex;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      lastForwardThresholdRef.current = -1; // reset so next forward pass gets full haptics
    }

    lastProgressRef.current = progress;
  }, [flipAnim]);

  // Shared handler: on release, complete flip or snap back
  const handleFlipGestureRelease = useCallback((_: any, gestureState: { dx: number }) => {
    lastForwardThresholdRef.current = -1;
    lastBackwardThresholdRef.current = 4;
    lastProgressRef.current = -1;

    const absDx = Math.abs(gestureState.dx);
    const wasFlipped = isFlippedRef.current;

    if (absDx > FLIP_GESTURE_THRESHOLD) {
      // Commit the flip -- animate to the target with remaining duration
      const progress = Math.min(absDx / FLIP_DRAG_RANGE, 1);
      const remainingDuration = Math.max((1 - progress) * 300, 80);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.timing(flipAnim, {
        toValue: wasFlipped ? 0 : 1,
        duration: remainingDuration,
        useNativeDriver: true,
      }).start(() => {
        setIsFlipped(!wasFlipped);
        onFlipRef.current?.();
      });
    } else {
      // Snap back to the starting position
      Animated.timing(flipAnim, {
        toValue: wasFlipped ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [flipAnim]);

  const leftEdgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !disableTouchHandlingRef.current &&
        gestureState.dx > 15 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: handleFlipGestureMove,
      onPanResponderRelease: handleFlipGestureRelease,
    })
  ).current;

  // Float animation for flip inward arrows (only when on flip-card walkthrough step)
  useEffect(() => {
    if (!isWalkthroughActive || currentWalkthroughStepId !== 'flip-card') {
      flipArrowFloatAnim.setValue(0);
      return;
    }
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(flipArrowFloatAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(flipArrowFloatAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.start();
    return () => floatLoop.stop();
  }, [isWalkthroughActive, currentWalkthroughStepId, flipArrowFloatAnim]);

  const flipArrowFloatTranslateY = useMemo(
    () =>
      flipArrowFloatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -10],
      }),
    [flipArrowFloatAnim]
  );

  const rightEdgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !disableTouchHandlingRef.current &&
        gestureState.dx < -15 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: handleFlipGestureMove,
      onPanResponderRelease: handleFlipGestureRelease,
    })
  ).current;

  const handleDelete = () => {
    if (!isOnline) {
      // Show offline alert
      const { Alert } = require('react-native');
      Alert.alert(
        t('offline.title') || 'Offline',
        t('offline.editDisabled') || 'Editing and deleting flashcards requires an internet connection.',
        [{ text: t('common.ok') || 'OK' }]
      );
      return;
    }
    if (onDelete) {
      onDelete(flashcard.id);
    }
  };

  const handleSend = () => {
    if (!isOnline) {
      // Show offline alert
      const { Alert } = require('react-native');
      Alert.alert(
        t('offline.title') || 'Offline',
        t('offline.moveDisabled') || 'Moving flashcards requires an internet connection.',
        [{ text: t('common.ok') || 'OK' }]
      );
      return;
    }
    if (onSend) {
      onSend(flashcard.id);
    }
  };
  
  const handleEdit = () => {
    if (!isOnline) {
      // Show offline alert
      const { Alert } = require('react-native');
      Alert.alert(
        t('offline.title') || 'Offline',
        t('offline.editDisabled') || 'Editing and deleting flashcards requires an internet connection.',
        [{ text: t('common.ok') || 'OK' }]
      );
      return;
    }
    if (onEdit) {
      onEdit(flashcard.id);
    }
  };

  // Toggle showing the image
  const toggleShowImage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const newState = !showImage;
    setShowImage(newState);
    
    // Animate fade in/out
    Animated.timing(imageFadeAnim, {
      toValue: newState ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // Call the onImageToggle callback if provided
    if (onImageToggle) {
      onImageToggle(newState);
    }
  };
  
  // Initialize image fade animation based on showImage state
  useEffect(() => {
    imageFadeAnim.setValue(showImage ? 1 : 0);
  }, [flashcard.id]); // Reset when flashcard changes


  // Handle image load success
  const handleImageLoad = () => {
    setIsImageLoaded(true);
    setImageLoadingState('success');
    logger.log('🖼️ [FlashcardItem] Image loaded successfully:', flashcard.id);
  };

  // Handle image load start
  const handleImageLoadStart = () => {
    // Only set to loading if not already successfully loaded
    // This prevents the loading overlay from showing when toggling visibility
    if (imageLoadingState !== 'success') {
      setImageLoadingState('loading');
    }
  };
  
  // Safety mechanism: Reset from stuck loading state after timeout
  useEffect(() => {
    if (imageLoadingState === 'loading') {
      // If still loading after 10 seconds, reset to idle to allow retry
      const timeout = setTimeout(() => {
        logger.warn('Image loading timeout - resetting state');
        setImageLoadingState('idle');
      }, 10000);
      
      return () => clearTimeout(timeout);
    }
  }, [imageLoadingState]);

  // Handle image load error - optionally clear stored URL for local files so we don't keep retrying a dead path
  const handleImageLoadError = useCallback(() => {
    logger.error('Image failed to load:', flashcard.imageUrl);
    setImageLoadingState('error');
    const uri = flashcard.imageUrl;
    const isLocalFile = uri?.startsWith('file://') ?? false;
    if (isLocalFile && onImageLoadFailed) {
      setImageUriToUse(undefined);
      Promise.resolve(onImageLoadFailed(flashcard)).catch((err) =>
        logger.error('FlashcardItem onImageLoadFailed error:', err)
      );
    }
  }, [flashcard, onImageLoadFailed]);

  // Handle image retry (tap-to-retry or refresh button)
  const handleImageRetry = () => {
    if (imageRetryCount >= MAX_RETRY_COUNT) {
      logger.warn('Max retry count reached for image:', flashcard.imageUrl);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageRetryCount(prev => prev + 1);
    setIsImageLoaded(false);
    setImageLoadingState('loading');
    
    // Cache bust by appending timestamp - use cache-busted URL to force fresh network fetch
    if (flashcard.imageUrl) {
      const separator = flashcard.imageUrl.includes('?') ? '&' : '?';
      const cacheBustedUrl = `${flashcard.imageUrl}${separator}refresh=${Date.now()}`;
      setImageUriToUse(cacheBustedUrl);
    }
  };

  // Check if content is scrollable by comparing content height to container height
  const checkContentScrollable = useCallback((event: {
    nativeEvent: {
      contentSize: { height: number },
      layoutMeasurement: { height: number }
    }
  }, side: 'front' | 'back') => {
    const { contentSize, layoutMeasurement } = event.nativeEvent;
    const isScrollable = contentSize.height > layoutMeasurement.height;
    
    if (side === 'front') {
      setFrontContentScrollable(isScrollable);
    } else {
      setBackContentScrollable(isScrollable);
    }
  }, []);

  // Interpolate for front and back animations
  // Content rotates relative to wrapper; perspective on wrapper gives 3D depth
  const frontAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '180deg'],
        }),
      },
      // Slight scale at 90° so the card looks thinner when edge-on (more 3D)
      {
        scaleX: flipAnim.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1, 0.92, 1],
        }),
      },
    ],
    opacity: flipAnim.interpolate({
      inputRange: [0.5, 1],
      outputRange: [1, 0]
    }),
    zIndex: flipAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [1, 0, 0]
    })
  };
  
  const backAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['180deg', '360deg'],
        }),
      },
      // Match front: slightly narrower when edge-on for 3D effect
      {
        scaleX: flipAnim.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1, 0.92, 1],
        }),
      },
    ],
    opacity: flipAnim.interpolate({
      inputRange: [0, 0.5],
      outputRange: [0, 1]
    }),
    zIndex: flipAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0, 1]
    })
  };

  // Enhanced image preloading with better error handling
  useEffect(() => {
    if (flashcard.imageUrl) {
      // Preload image to prevent layout shifts and improve perceived performance
      const preloadImage = async () => {
        try {
          // TypeScript now knows imageUrl is not undefined due to the if check above
          await Image.prefetch(flashcard.imageUrl!);
          logger.log('🖼️ [FlashcardItem] Image preloaded successfully:', flashcard.id);
        } catch (error) {
          logger.warn('🖼️ [FlashcardItem] Image preload failed for:', flashcard.id, error);
          // Image will still attempt to load normally in the component
        }
      };
      
      preloadImage();
    }
  }, [flashcard.imageUrl, flashcard.id]);

  // Track the previous flashcard ID to detect real changes
  const prevFlashcardIdRef = useRef<string>();
  
  // Reset image state when flashcard changes (but preserve successful loads)
  useEffect(() => {
    setImageRetryCount(0);
    
    // If this is a truly new flashcard (different ID), reset everything
    if (prevFlashcardIdRef.current !== flashcard.id) {
      logger.log('🔄 [FlashcardItem] New flashcard detected, resetting image state');
      setImageLoadingState('idle');
      setIsImageLoaded(false);
      prevFlashcardIdRef.current = flashcard.id;
    } else if (imageLoadingState === 'error' || imageLoadingState === 'loading') {
      // Same flashcard but stuck in error/loading state - reset to idle
      logger.log('🔄 [FlashcardItem] Resetting stuck image state');
      setImageLoadingState('idle');
    }
  }, [flashcard.id, flashcard.imageUrl]);

  return (
    <View style={[
      styles.cardContainer,
      showImage && flashcard.imageUrl ? styles.expandedCardContainer : null
    ]}>
      {/* Backdrop overlay - tap outside card to dismiss (only show if not disabled) */}
      {showImage && flashcard.imageUrl && !disableBackdropOverlay && (
        <TouchableOpacity 
          style={styles.backdropOverlay}
          activeOpacity={1}
          onPress={toggleShowImage}
        />
      )}
      
      <Animated.View style={[
        styles.cardWrapper,
        showImage && flashcard.imageUrl ? styles.expandedCardWrapper : null,
      ]}>
        {/* Front of the card */}
        <Animated.View style={[
          styles.cardContent, 
          styles.cardSide, 
          frontAnimatedStyle
        ]}>
          {/* Small notches marking where the flip gesture zone begins (50px from each edge) */}
          <View style={styles.flipZoneNotchContainer} pointerEvents="none">
            <View style={[styles.flipZoneNotch, styles.flipZoneNotchLeftTop, { backgroundColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey }]} />
            <View style={[styles.flipZoneNotch, styles.flipZoneNotchLeftBottom, { backgroundColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey }]} />
            <View style={[styles.flipZoneNotch, styles.flipZoneNotchRightTop, { backgroundColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey }]} />
            <View style={[styles.flipZoneNotch, styles.flipZoneNotchRightBottom, { backgroundColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey }]} />
          </View>
          <View style={[
            styles.cardBorderWrapper,
            {
              borderWidth: 1,
              borderColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey,
              borderRadius: 16
            }
          ]}>
            <View style={styles.cardFront}>
            <ScrollView 
              ref={frontScrollViewRef}
              style={styles.scrollContainer}
              contentContainerStyle={styles.scrollContentContainer}
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
              nestedScrollEnabled={true}
              onContentSizeChange={(width, height) => {
                const scrollView = {
                  nativeEvent: {
                    contentSize: { height },
                    layoutMeasurement: { height: showImage && flashcard.imageUrl ? 650 : 300 } // Adjust measurement based on image display
                  }
                };
                checkContentScrollable(scrollView, 'front');
              }}
              onLayout={(event: LayoutChangeEvent) => {
                const scrollView = {
                  nativeEvent: {
                    contentSize: { height: 0 }, // Will be updated
                    layoutMeasurement: { height: event.nativeEvent.layout.height }
                  }
                };
                checkContentScrollable(scrollView, 'front');
              }}
            >
              <View style={styles.japaneseTextContainer}>
                {/* Front side always shows original text without furigana - this is for testing knowledge */}
                <Text style={styles.japaneseText}>
                  {flashcard.originalText}
                </Text>
              </View>
              
              {/* Always render the image but conditionally show it */}
              {flashcard.imageUrl && (
                <Animated.View 
                  style={[
                    styles.imageContainer,
                    {
                      opacity: imageFadeAnim,
                      // Hide from layout when not showing
                      height: showImage ? undefined : 0,
                      marginTop: showImage ? 15 : 0,
                      marginBottom: showImage ? 10 : 0,
                    }
                  ]}
                >
                  {imageLoadingState === 'error' ? (
                    // Error placeholder with tap-to-retry (icon only)
                    <TouchableOpacity 
                      style={styles.imageErrorContainer}
                      onPress={handleImageRetry}
                      disabled={imageRetryCount >= MAX_RETRY_COUNT}
                    >
                      <Ionicons 
                        name="cloud-offline-outline" 
                        size={64} 
                        color={imageRetryCount >= MAX_RETRY_COUNT ? COLORS.darkGray : COLORS.royalBlue} 
                      />
                    </TouchableOpacity>
                  ) : (
                    <>
                      <Image 
                        source={{ uri: imageUriToUse || flashcard.imageUrl }} 
                        style={styles.image}
                        resizeMode="contain"
                        onLoadStart={handleImageLoadStart}
                        onLoad={handleImageLoad}
                        onError={handleImageLoadError}
                      />
                      
                      {/* Loading overlay - only show if image hasn't been loaded before */}
                      {imageLoadingState === 'loading' && !isImageLoaded && (
                        <View style={styles.imageLoadingOverlay}>
                          <ActivityIndicator size="large" color={COLORS.primary} />
                        </View>
                      )}
                    </>
                  )}
                </Animated.View>
              )}
            </ScrollView>
            {/* Bottom right actions - flip with front */}
            <View style={styles.bottomRightActionsContainer}>
              {showFlipButton && (
                <View ref={flipButtonRef} collapsable={false}>
                  <PokedexButton
                    onPress={handleFlipButtonPress}
                    materialIcon="flip"
                    iconColor="black"
                    color="grey"
                    size="small"
                    shape="square"
                    style={styles.flashcardActionButton}
                  />
                </View>
              )}
              {flashcard.imageUrl && showRefreshButton && showImage && (
                <PokedexButton
                  onPress={handleImageRetry}
                  icon="refresh"
                  iconColor={imageRetryCount >= MAX_RETRY_COUNT ? COLORS.darkGray : 'black'}
                  color="grey"
                  size="small"
                  shape="square"
                  style={styles.flashcardActionButton}
                  disabled={imageRetryCount >= MAX_RETRY_COUNT}
                  darkDisabled={imageRetryCount >= MAX_RETRY_COUNT}
                />
              )}
              {flashcard.imageUrl && (
                <View ref={imageButtonRef} collapsable={false}>
                  <PokedexButton
                    onPress={toggleShowImage}
                    icon="image"
                    iconColor={isWalkthroughActive && currentWalkthroughStepId === 'image-button' ? '#FBBF24' : 'black'}
                    color={isWalkthroughActive && currentWalkthroughStepId === 'image-button' ? '#FBBF24' : 'grey'}
                    size="small"
                    shape="square"
                    style={StyleSheet.flatten([styles.flashcardActionButton, ...(isWalkthroughActive && currentWalkthroughStepId === 'image-button' ? [styles.walkthroughHighlightedButton] : [])])}
                  />
                </View>
              )}
            </View>
            {/* Full-height yellow highlight for flip walkthrough (fills lower part too); touch zones sit on top */}
            {isWalkthroughActive && currentWalkthroughStepId === 'flip-card' && (
              <View style={styles.flipZoneFullHeightHighlightContainer} pointerEvents="none">
                <View style={[styles.flipZoneFullHeightHighlight, styles.flipZoneFullHeightHighlightLeft]} />
                <View style={[styles.flipZoneFullHeightHighlight, styles.flipZoneFullHeightHighlightRight]} />
                <Animated.View style={[styles.flipZoneArrowWrap, styles.flipZoneArrowLeft, { transform: [{ translateY: flipArrowFloatTranslateY }] }]}>
                  <Ionicons name="chevron-forward" size={28} color="#1a1a1a" />
                </Animated.View>
                <Animated.View style={[styles.flipZoneArrowWrap, styles.flipZoneArrowRight, { transform: [{ translateY: flipArrowFloatTranslateY }] }]}>
                  <Ionicons name="chevron-back" size={28} color="#1a1a1a" />
                </Animated.View>
              </View>
            )}
            {/* Edge flip zones - swipe inward from left or right edge to flip */}
            <View
              style={[
                styles.leftEdgeZone,
                isWalkthroughActive && currentWalkthroughStepId === 'flip-card' && styles.flipZoneWalkthroughHighlight,
              ]}
              {...leftEdgePanResponder.panHandlers}
            />
            <View
              style={[
                styles.rightEdgeZone,
                isWalkthroughActive && currentWalkthroughStepId === 'flip-card' && styles.flipZoneWalkthroughHighlight,
              ]}
              {...rightEdgePanResponder.panHandlers}
            />
            </View>
          </View>
        </Animated.View>

        {/* Back of the card */}
        <Animated.View style={[
          styles.cardContent, 
          styles.cardSide, 
          backAnimatedStyle
        ]}>
          {/* Small notches marking where the flip gesture zone begins (50px from each edge) */}
          <View style={styles.flipZoneNotchContainer} pointerEvents="none">
            <View style={[styles.flipZoneNotch, styles.flipZoneNotchLeftTop, { backgroundColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey }]} />
            <View style={[styles.flipZoneNotch, styles.flipZoneNotchLeftBottom, { backgroundColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey }]} />
            <View style={[styles.flipZoneNotch, styles.flipZoneNotchRightTop, { backgroundColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey }]} />
            <View style={[styles.flipZoneNotch, styles.flipZoneNotchRightBottom, { backgroundColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey }]} />
          </View>
          <View style={[
            styles.cardBorderWrapper,
            {
              borderWidth: 1,
              borderColor: isSrsModeActive ? rainbowBorderColor : COLORS.appleLiquidGrey,
              borderRadius: 16
            }
          ]}>
            <View style={styles.cardBack}>
            <ScrollView 
              ref={backScrollViewRef}
              style={styles.scrollContainer}
              contentContainerStyle={styles.scrollContentContainer}
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
              nestedScrollEnabled={true}
              onContentSizeChange={(width, height) => {
                const scrollView = {
                  nativeEvent: {
                    contentSize: { height },
                    layoutMeasurement: { height: showImage && flashcard.imageUrl ? 650 : 300 } // Adjust measurement based on image display
                  }
                };
                checkContentScrollable(scrollView, 'back');
              }}
              onLayout={(event: LayoutChangeEvent) => {
                const scrollView = {
                  nativeEvent: {
                    contentSize: { height: 0 }, // Will be updated
                    layoutMeasurement: { height: event.nativeEvent.layout.height }
                  }
                };
                checkContentScrollable(scrollView, 'back');
              }}
            >
              {needsRomanization && flashcard.readingsText && (
                <>
                  <Text style={styles.sectionTitle}>
                    {detectedLanguage === 'Japanese' ? t('flashcard.sectionTitles.withFurigana') :
                     detectedLanguage === 'Chinese' ? t('flashcard.sectionTitles.withPinyin') :
                     detectedLanguage === 'Korean' ? t('flashcard.sectionTitles.withRevisedRomanization') :
                     detectedLanguage === 'Russian' ? t('flashcard.sectionTitles.withPracticalRomanization') :
                     detectedLanguage === 'Arabic' ? t('flashcard.sectionTitles.withArabicChatAlphabet') :
                     detectedLanguage === 'Hindi' ? t('flashcard.sectionTitles.withHindiRomanization') :
                     detectedLanguage === 'Esperanto' ? t('flashcard.sectionTitles.withEsperantoRomanization') :
                     detectedLanguage === 'Italian' ? t('flashcard.sectionTitles.withItalianAlphabet') :
                     detectedLanguage === 'Tagalog' ? t('flashcard.sectionTitles.withTagalogAlphabet') :
                     detectedLanguage === 'Thai' ? t('flashcard.sectionTitles.withThaiRomanization') :
                     t('flashcard.sectionTitles.withPronunciationGuide')}
                  </Text>
                  {(detectedLanguage === 'Japanese' || detectedLanguage === 'Chinese' || detectedLanguage === 'Korean' || detectedLanguage === 'Russian' || detectedLanguage === 'Arabic' || detectedLanguage === 'Hindi' || detectedLanguage === 'Thai') ? (
                    <FuriganaText
                      text={flashcard.readingsText}
                      fontSize={20}
                      furiganaFontSize={12}
                      color={COLORS.text}
                      furiganaColor={COLORS.darkGray}
                      textAlign="center"
                    />
                  ) : (
                    <Text style={styles.readingsText}>
                      {flashcard.readingsText}
                    </Text>
                  )}
                </>
              )}
              
              <Text style={styles.sectionTitle}>{t('flashcard.sectionTitles.translation', { language: translatedLanguageName })}</Text>
              <Text style={styles.translatedText}>
                {flashcard.translatedText}
              </Text>
              
              {/* Scope Analysis Section */}
              {flashcard.scopeAnalysis && (() => {
                // Get translations for target language (use flashcard's targetLanguage if available)
                const targetLang = flashcard.targetLanguage || 'en';
                const targetT = i18next.getFixedT(targetLang, 'translation');
                const scopeAnalysisText = flashcard.scopeAnalysis || '';
                const localizedScopeAnalysis = localizeScopeAnalysisHeadings(scopeAnalysisText, {
                  grammar: targetT('flashcard.wordscope.grammar'),
                  examples: targetT('flashcard.wordscope.examples'),
                  commonMistake: targetT('flashcard.wordscope.commonMistake'),
                  commonContext: targetT('flashcard.wordscope.commonContext'),
                  alternativeExpressions: targetT('flashcard.wordscope.alternativeExpressions'),
                });
                const segments = parseScopeAnalysisForStyling(localizedScopeAnalysis);
                return (
                  <>
                    <Text style={styles.sectionTitle}>Wordscope</Text>
                    <View style={styles.wordscopeCopyableContainer}>
                      <TextInput
                        value={localizedScopeAnalysis}
                        editable={false}
                        multiline
                        scrollEnabled={false}
                        caretHidden
                        style={[styles.wordscopeBaseText, styles.wordscopeSelectionLayer]}
                        underlineColorAndroid="transparent"
                      />
                      <View style={styles.wordscopeColoredOverlay} pointerEvents="none">
                        <Text style={styles.wordscopeBaseText}>
                          {segments.map((seg, i) => (
                            <Text
                              key={i}
                              style={
                                seg.isTargetLanguage
                                  ? styles.scopeAnalysisTargetText
                                  : seg.isSourceLanguage
                                    ? styles.scopeAnalysisSourceText
                                    : undefined
                              }
                            >
                              {seg.text}
                            </Text>
                          ))}
                        </Text>
                      </View>
                    </View>
                  </>
                );
              })()}
              
              {/* Always render the image on back side too but conditionally show it */}
              {flashcard.imageUrl && (
                <Animated.View 
                  style={[
                    styles.imageContainer,
                    {
                      opacity: imageFadeAnim,
                      // Hide from layout when not showing
                      height: showImage ? undefined : 0,
                      marginTop: showImage ? 15 : 0,
                      marginBottom: showImage ? 10 : 0,
                    }
                  ]}
                >
                  {imageLoadingState === 'error' ? (
                    // Error placeholder with tap-to-retry (icon only)
                    <TouchableOpacity 
                      style={styles.imageErrorContainer}
                      onPress={handleImageRetry}
                      disabled={imageRetryCount >= MAX_RETRY_COUNT}
                    >
                      <Ionicons 
                        name="cloud-offline-outline" 
                        size={64} 
                        color={imageRetryCount >= MAX_RETRY_COUNT ? COLORS.darkGray : COLORS.royalBlue} 
                      />
                    </TouchableOpacity>
                  ) : (
                    <>
                      <Image 
                        source={{ uri: imageUriToUse || flashcard.imageUrl }} 
                        style={styles.image}
                        resizeMode="contain"
                        onLoadStart={handleImageLoadStart}
                        onLoad={handleImageLoad}
                        onError={handleImageLoadError}
                      />
                      
                      {/* Loading overlay - only show if image hasn't been loaded before */}
                      {imageLoadingState === 'loading' && !isImageLoaded && (
                        <View style={styles.imageLoadingOverlay}>
                          <ActivityIndicator size="large" color={COLORS.primary} />
                        </View>
                      )}
                    </>
                  )}
                </Animated.View>
              )}
              
              {deckName && (
                <View style={styles.deckInfoContainer}>
                  <Text style={styles.deckLabel}>{t('flashcard.sectionTitles.collection')}</Text>
                  <Text style={styles.deckName}>{deckName}</Text>
                </View>
              )}
            </ScrollView>
            {/* Review date at bottom left */}
            {reviewDateText && (
              <View style={styles.reviewDateContainer}>
                <Text style={styles.reviewDateText}>{reviewDateText}</Text>
              </View>
            )}
            {/* Bottom right actions - flip with back */}
            <View style={styles.bottomRightActionsContainer}>
              {flashcard.originalText?.trim() && (
                ttsLoading ? (
                  <View style={[styles.flashcardActionButton, { width: 45, height: 45, justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator size="small" color={COLORS.text} />
                  </View>
                ) : (
                  <PokedexButton
                    onPress={handleTtsPress}
                    icon="volume-high"
                    iconColor={ttsError ? '#DC2626' : 'black'}
                    color="grey"
                    size="small"
                    shape="square"
                    style={styles.flashcardActionButton}
                    disabled={!user?.id}
                    darkDisabled={!user?.id}
                  />
                )
              )}
              {showFlipButton && (
                <PokedexButton
                  onPress={handleFlipButtonPress}
                  materialIcon="flip"
                  iconColor="black"
                  color="grey"
                  size="small"
                  shape="square"
                  style={styles.flashcardActionButton}
                />
              )}
              {flashcard.imageUrl && showRefreshButton && showImage && (
                <PokedexButton
                  onPress={handleImageRetry}
                  icon="refresh"
                  iconColor={imageRetryCount >= MAX_RETRY_COUNT ? COLORS.darkGray : 'black'}
                  color="grey"
                  size="small"
                  shape="square"
                  style={styles.flashcardActionButton}
                  disabled={imageRetryCount >= MAX_RETRY_COUNT}
                  darkDisabled={imageRetryCount >= MAX_RETRY_COUNT}
                />
              )}
              {flashcard.imageUrl && (
                <PokedexButton
                  onPress={toggleShowImage}
                  icon="image"
                  iconColor={isWalkthroughActive && currentWalkthroughStepId === 'image-button' ? '#FBBF24' : 'black'}
                  color={isWalkthroughActive && currentWalkthroughStepId === 'image-button' ? '#FBBF24' : 'grey'}
                  size="small"
                  shape="square"
                  style={StyleSheet.flatten([styles.flashcardActionButton, ...(isWalkthroughActive && currentWalkthroughStepId === 'image-button' ? [styles.walkthroughHighlightedButton] : [])])}
                />
              )}
            </View>
            {/* Full-height yellow highlight for flip walkthrough (fills lower part too); touch zones sit on top */}
            {isWalkthroughActive && currentWalkthroughStepId === 'flip-card' && (
              <View style={styles.flipZoneFullHeightHighlightContainer} pointerEvents="none">
                <View style={[styles.flipZoneFullHeightHighlight, styles.flipZoneFullHeightHighlightLeft]} />
                <View style={[styles.flipZoneFullHeightHighlight, styles.flipZoneFullHeightHighlightRight]} />
                <Animated.View style={[styles.flipZoneArrowWrap, styles.flipZoneArrowLeft, { transform: [{ translateY: flipArrowFloatTranslateY }] }]}>
                  <Ionicons name="chevron-forward" size={28} color="#1a1a1a" />
                </Animated.View>
                <Animated.View style={[styles.flipZoneArrowWrap, styles.flipZoneArrowRight, { transform: [{ translateY: flipArrowFloatTranslateY }] }]}>
                  <Ionicons name="chevron-back" size={28} color="#1a1a1a" />
                </Animated.View>
              </View>
            )}
            {/* Edge flip zones - swipe inward from left or right edge to flip */}
            <View
              style={[
                styles.leftEdgeZone,
                isWalkthroughActive && currentWalkthroughStepId === 'flip-card' && styles.flipZoneWalkthroughHighlight,
              ]}
              {...leftEdgePanResponder.panHandlers}
            />
            <View
              style={[
                styles.rightEdgeZone,
                isWalkthroughActive && currentWalkthroughStepId === 'flip-card' && styles.flipZoneWalkthroughHighlight,
              ]}
              {...rightEdgePanResponder.panHandlers}
            />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
      
      {/* Card Actions */}
      <View style={styles.actionButtonsContainer}>
        {onDelete && (
          <TouchableOpacity 
            style={[styles.deleteButton, !isOnline && styles.disabledButton]} 
            onPress={handleDelete}
          >
            <Ionicons 
              name="trash-outline" 
              size={22} 
                color={isOnline ? COLORS.royalBlue50 : COLORS.darkGray} 
            />
          </TouchableOpacity>
        )}
        
        {onEdit && (
          <TouchableOpacity 
            style={[styles.editButton, !isOnline && styles.disabledButton]} 
            onPress={handleEdit}
          >
            <Ionicons 
              name="pencil" 
              size={22} 
              color={isOnline ? COLORS.royalBlue50 : COLORS.darkGray} 
            />
          </TouchableOpacity>
        )}
        
        {onSend && (
          <TouchableOpacity 
            style={[styles.sendButton, !isOnline && styles.disabledButton]} 
            onPress={handleSend}
          >
            <MaterialIcons 
              name="drive-file-move-outline" 
              size={22} 
              color={isOnline ? COLORS.royalBlue50 : COLORS.darkGray} 
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// Create styles function with responsive card height
const createStyles = (responsiveCardHeight: number, useScreenBackground: boolean) => StyleSheet.create({
  cardContainer: {
    position: 'relative',
    width: '100%',
    marginVertical: 0, // Removed vertical margin - spacing controlled by parent
    paddingHorizontal: 0,
    borderRadius: 16,
    overflow: 'visible',
  },
  expandedCardContainer: {
    marginVertical: 0, // Keep layout height consistent even when image is expanded
  },
  cardWrapper: {
    width: '100%',
    height: responsiveCardHeight,
    maxHeight: responsiveCardHeight,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: useScreenBackground ? COLORS.flashcardScreenBackground : '#000000', // Use screen background in collections screen, black elsewhere
    position: 'relative',
    zIndex: 2, // Above the backdrop overlay (zIndex: 1)
    // Perspective for 3D flip: smaller = more dramatic depth
    transform: [{ perspective: 1000 }],
  },
  expandedCardWrapper: {
    // Removed padding to prevent border size changes
  },
  cardContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    backgroundColor: COLORS.darkSurface,
    // Enhanced shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cardSide: {
    width: '100%',
    height: '100%',
  },
  cardBorderWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardFront: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingTop: 50,
    paddingBottom: 50,
  },
  cardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingTop: 50,
    paddingBottom: 50,
  },
  flipZoneNotchContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
  },
  flipZoneNotch: {
    position: 'absolute',
    width: 2,
    height: 10,
    borderRadius: 1,
  },
  flipZoneNotchLeftTop: {
    left: 49,
    top: -5, // Jut out from top border (half above, half below the line)
  },
  flipZoneNotchLeftBottom: {
    left: 49,
    bottom: -5, // Jut out from bottom border
  },
  flipZoneNotchRightTop: {
    right: 49,
    top: -5,
  },
  flipZoneNotchRightBottom: {
    right: 49,
    bottom: -5,
  },
  leftEdgeZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 64, // Stop above action buttons so they remain tappable
    width: 50,
    zIndex: 20,
  },
  rightEdgeZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 64, // Stop above action buttons so they remain tappable
    width: 50,
    zIndex: 20,
  },
  flipZoneWalkthroughHighlight: {
    backgroundColor: 'rgba(251, 191, 36, 0.45)',
  },
  flipZoneFullHeightHighlightContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 19,
  },
  flipZoneFullHeightHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 50,
    backgroundColor: 'rgba(251, 191, 36, 0.45)',
  },
  flipZoneFullHeightHighlightLeft: {
    left: 0,
  },
  flipZoneFullHeightHighlightRight: {
    right: 0,
  },
  flipZoneArrowWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipZoneArrowLeft: {
    left: 0,
  },
  flipZoneArrowRight: {
    right: 0,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: 70, // Extra space at the bottom
  },
  japaneseTextContainer: {
    marginBottom: 15,
    alignItems: 'center', // Center the text
  },
  japaneseText: {
    fontSize: 28, // Increased from 24 for better visibility on larger cards
    textAlign: 'center',
    color: COLORS.text,
    lineHeight: 42, // Increased proportionally
    // Japanese/kanji: system font (e.g. Hiragino on iOS) for best CJK rendering
  },
  sectionTitle: {
    fontFamily: FONTS.sansBold,
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.darkGray,
    marginBottom: 5,
    marginTop: 15,
    textAlign: 'center', // Center the title
  },
  readingsText: {
    fontFamily: FONTS.sans,
    fontSize: 20, // Increased from 18 for better visibility on larger cards
    textAlign: 'center', // Center the text
    color: COLORS.text,
    marginBottom: 15,
    lineHeight: 30, // Increased proportionally
  },
  readingsTextComponent: {
    marginBottom: 15,
    alignSelf: 'center',
  },
  translatedText: {
    fontFamily: FONTS.sans,
    fontSize: 20, // Increased from 18 for better visibility on larger cards
    textAlign: 'center', // Center the text
    color: COLORS.text,
    lineHeight: 30, // Increased proportionally
  },
  wordscopeBaseText: {
    fontFamily: FONTS.sans,
    fontSize: 16,
    textAlign: 'center',
    color: COLORS.text,
    lineHeight: 24,
    fontStyle: 'italic',
    marginTop: 10,
    padding: 0,
    margin: 0,
  },
  wordscopeSelectionLayer: {
    color: 'transparent',
    backgroundColor: 'transparent',
  },
  wordscopeCopyableContainer: {
    position: 'relative',
  },
  wordscopeColoredOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  scopeAnalysisText: {
    fontFamily: FONTS.sans,
    fontSize: 16,
    textAlign: 'center',
    color: COLORS.text,
    lineHeight: 24,
    fontStyle: 'italic',
    marginTop: 10,
  },
  scopeAnalysisSourceText: {
    color: '#4ADE80', // Green for scanned/source language
  },
  scopeAnalysisTargetText: {
    color: '#A78BFA', // Purple for target language (translations, notes in Examples)
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
    fontFamily: FONTS.sansSemiBold,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  dualIconContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButtonsContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 4,
    zIndex: 10,
  },
  bottomRightActionsContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 4,
    zIndex: 10,
  },
  flashcardActionButton: {
    marginVertical: 0,
    marginHorizontal: 4,
  },
  walkthroughHighlightedButton: {
    borderWidth: 2,
    borderColor: '#FBBF24',
    borderRadius: 8,
  },
  deleteButton: {
    marginHorizontal: 8,
    padding: 6,
  },
  editButton: {
    marginHorizontal: 8,
    padding: 6,
  },
  sendButton: {
    marginHorizontal: 8,
    padding: 6,
  },
  disabledButton: {
    opacity: 0.4,
  },
  imageContainer: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 15,
    marginBottom: 10,
    alignSelf: 'center', // Center the image container
  },
  image: {
    width: '100%',
    height: 400,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  deckInfoContainer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    // Subtle dark border for depth
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    backgroundColor: COLORS.darkSurface,
  },
  deckLabel: {
    fontFamily: FONTS.sansBold,
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.darkGray,
  },
  deckName: {
    fontFamily: FONTS.sans,
    fontSize: 16,
    color: COLORS.darkGray,
  },
  backdropOverlay: {
    position: 'absolute',
    top: -1000, // Extend far beyond the card boundaries
    left: -1000,
    right: -1000,
    bottom: -1000,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 1, // Behind the card (cardWrapper has no explicit zIndex, defaults to auto)
    borderRadius: 0, // No rounding for backdrop
  },
  imageErrorContainer: {
    width: '100%',
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 8,
    padding: 20,
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  reviewDateContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    zIndex: 10,
  },
  reviewDateText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: COLORS.darkGray,
    opacity: 0.7,
  },
});

export default FlashcardItem; 