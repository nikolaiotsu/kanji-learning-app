import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, Animated, ScrollView, LayoutChangeEvent, Image, ActivityIndicator, Easing } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Flashcard } from '../../types/Flashcard';
import { Ionicons, MaterialIcons, FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { useSettings, AVAILABLE_LANGUAGES } from '../../context/SettingsContext';
import FuriganaText from '../shared/FuriganaText';
import { logger } from '../../utils/logger';
import * as Haptics from 'expo-haptics';
import { getCachedImageUri } from '../../services/imageCache';
import { useAuth } from '../../context/AuthContext';
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
  onAppendAnalysis?: (flashcardId: string, newAnalysis: string) => Promise<void>;
  deckName?: string; // Optional deck name to display
  disableTouchHandling?: boolean; // If true, the card won't be flippable via touch
  cardHeight?: number; // Optional responsive card height (defaults to 300 if not provided)
  showRefreshButton?: boolean; // Show refresh button next to image toggle in saved flashcards mode
  isOnline?: boolean; // Whether the app is online (disables write operations when offline)
  isReviewModeActive?: boolean; // Whether review mode is active (for rainbow border effect)
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({ 
  flashcard, 
  onDelete, 
  onSend, 
  onEdit,
  onImageToggle,
  onAppendAnalysis,
  deckName,
  disableTouchHandling = false,
  cardHeight = 300, // Sensible default for saved-flashcards page
  showRefreshButton = false,
  isOnline = true, // Default to true for backward compatibility
  isReviewModeActive = false, // Default to false
}) => {
  const { t } = useTranslation();
  const { targetLanguage } = useSettings();
  const { user } = useAuth();
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  
  // Rainbow border animation
  const rainbowAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (isReviewModeActive) {
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
      return () => {
        loop.stop();
        rainbowAnim.setValue(0);
      };
    }
  }, [isReviewModeActive, rainbowAnim]);
  
  // Interpolate rainbow colors
  const rainbowColor = rainbowAnim.interpolate({
    inputRange: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1],
    outputRange: [
      '#FF0000', // Red
      '#FF7F00', // Orange
      '#FFFF00', // Yellow
      '#00FF00', // Green
      '#0000FF', // Blue
      '#4B0082', // Indigo
      '#FF0000', // Back to Red (loop)
    ],
  });
  
  // Create styles with responsive card height
  const styles = React.useMemo(() => createStyles(cardHeight), [cardHeight]);
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
  const [imageUrlWithCacheBust, setImageUrlWithCacheBust] = useState(flashcard.imageUrl);
  const [imageUriToUse, setImageUriToUse] = useState<string | undefined>(flashcard.imageUrl);
  const MAX_RETRY_COUNT = 5;
  
  // State for appending alternate analysis
  const [isAppendingAnalysis, setIsAppendingAnalysis] = useState(false);
  
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

  // Determine pronunciation guide type based on content (no language detection needed)
  useEffect(() => {
    const furiganaText = flashcard.furiganaText;
    
    if (!furiganaText) {
      setNeedsRomanization(false);
      setDetectedLanguage('English'); // Default for text without pronunciation guide
      return;
    }

    // Check what type of pronunciation guide the furiganaText contains
    const containsHiragana = /[\u3040-\u309F]/.test(furiganaText); // Japanese furigana
    const containsHangul = /[\uAC00-\uD7AF]/.test(furiganaText); // Korean
    const containsCyrillic = /[\u0400-\u04FF]/.test(furiganaText); // Russian
    const containsArabicScript = /[\u0600-\u06FF]/.test(furiganaText); // Arabic
    const containsLatinInParentheses = /\([a-zA-Zāēīōūǎěǐǒǔàèìòùáéíóúǘǜɑ\s]+\)/.test(furiganaText); // Chinese pinyin or other romanization

    let language = 'unknown';
    if (containsHiragana) {
      language = 'Japanese';
    } else if (containsLatinInParentheses) {
      // Could be Chinese pinyin, Korean romanization, Russian romanization, etc.
      // Check for specific patterns to distinguish
      if (containsHangul) {
        language = 'Korean';
      } else if (containsCyrillic) {
        language = 'Russian';
      } else if (containsArabicScript) {
        language = 'Arabic';
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
    } else {
      // Fallback: check original text for basic language patterns
      const originalText = flashcard.originalText;
      const latinChars = originalText.replace(/\s+/g, '').split('').filter(char => /[a-zA-Z]/.test(char)).length;
      if (latinChars > 0 && latinChars / originalText.replace(/\s+/g, '').length >= 0.5) {
        language = 'English';
      }
    }
    
    setDetectedLanguage(language);
    setNeedsRomanization(furiganaText.length > 0);
  }, [flashcard.furiganaText]);

  // Function to handle card flipping
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
    });
  };

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
    // Call the onImageToggle callback if provided
    if (onImageToggle) {
      onImageToggle(newState);
    }
  };

  // Handle appending alternate analysis
  const handleAppendAnalysis = async () => {
    if (!isOnline) {
      const { Alert } = require('react-native');
      Alert.alert(
        t('offline.title') || 'Offline',
        t('offline.editDisabled') || 'Editing flashcards requires an internet connection.',
        [{ text: t('common.ok') || 'OK' }]
      );
      return;
    }
    
    if (!onAppendAnalysis || !flashcard.scopeAnalysis || !flashcard.originalText) {
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsAppendingAnalysis(true);
    
    try {
      // Import the API function
      const { fetchSingleScopeAnalysis } = require('../../services/claudeApi');
      
      // Determine current analysis type
      const isWord = !(/[.!?。！？]/.test(flashcard.originalText)) && flashcard.originalText.trim().length < 50;
      const currentType = isWord ? 'etymology' : 'grammar';
      const alternateType = currentType === 'etymology' ? 'grammar' : 'etymology';
      
      // Fetch alternate analysis
      const alternateAnalysis = await fetchSingleScopeAnalysis(
        flashcard.originalText,
        alternateType,
        flashcard.targetLanguage,
        flashcard.sourceLanguage || 'ja'
      );
      
      if (alternateAnalysis) {
        // Append with separator
        const separator = `\n\n--- ${alternateType === 'etymology' ? 'Etymology & Context' : 'Grammar Analysis'} ---\n\n`;
        const updatedAnalysis = flashcard.scopeAnalysis + separator + alternateAnalysis;
        
        // Call parent handler to update the flashcard
        await onAppendAnalysis(flashcard.id, updatedAnalysis);
        logger.log('🔬 [FlashcardItem] Successfully appended alternate analysis');
      }
    } catch (error) {
      logger.error('🔬 [FlashcardItem] Failed to append alternate analysis:', error);
      const { Alert } = require('react-native');
      Alert.alert(
        t('common.error') || 'Error',
        'Failed to fetch additional analysis. Please try again.'
      );
    } finally {
      setIsAppendingAnalysis(false);
    }
  };

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

  // Handle image load error
  const handleImageLoadError = () => {
    logger.error('Image failed to load:', flashcard.imageUrl);
    setImageLoadingState('error');
  };

  // Handle image retry (tap-to-retry or refresh button)
  const handleImageRetry = () => {
    if (imageRetryCount >= MAX_RETRY_COUNT) {
      logger.warn('Max retry count reached for image:', flashcard.imageUrl);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageRetryCount(prev => prev + 1);
    setImageLoadingState('loading');
    
    // Cache bust by appending timestamp
    if (flashcard.imageUrl) {
      const separator = flashcard.imageUrl.includes('?') ? '&' : '?';
      const cacheBustedUrl = `${flashcard.imageUrl}${separator}refresh=${Date.now()}`;
      setImageUrlWithCacheBust(cacheBustedUrl);
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
  const frontAnimatedStyle = {
    transform: [
      { 
        rotateY: flipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '180deg']
        })
      }
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
          outputRange: ['180deg', '360deg']
        })
      }
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
    // Reset to the original URL (removes any cache-busting params from retries)
    setImageUrlWithCacheBust(flashcard.imageUrl);
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
      {/* Backdrop overlay - tap outside card to dismiss */}
      {showImage && flashcard.imageUrl && (
        <TouchableOpacity 
          style={styles.backdropOverlay}
          activeOpacity={1}
          onPress={toggleShowImage}
        />
      )}
      
      <Animated.View style={[
        styles.cardWrapper,
        showImage && flashcard.imageUrl ? styles.expandedCardWrapper : null,
        isReviewModeActive && { borderColor: rainbowColor, borderWidth: 1, borderRadius: 16 }
      ]}>
        {/* Front of the card */}
        <Animated.View style={[
          styles.cardContent, 
          styles.cardSide, 
          frontAnimatedStyle
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
                <View 
                  style={[
                    styles.imageContainer,
                    !showImage && styles.hiddenImage
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
                </View>
              )}
            </ScrollView>
          </View>
        </Animated.View>

        {/* Back of the card */}
        <Animated.View style={[
          styles.cardContent, 
          styles.cardSide, 
          backAnimatedStyle
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
              {needsRomanization && flashcard.furiganaText && (
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
                     t('flashcard.sectionTitles.withPronunciationGuide')}
                  </Text>
                  {(detectedLanguage === 'Japanese' || detectedLanguage === 'Chinese' || detectedLanguage === 'Korean' || detectedLanguage === 'Russian' || detectedLanguage === 'Arabic' || detectedLanguage === 'Hindi') ? (
                    <FuriganaText
                      text={flashcard.furiganaText}
                      fontSize={20}
                      furiganaFontSize={12}
                      color={COLORS.text}
                      furiganaColor={COLORS.darkGray}
                      textAlign="center"
                    />
                  ) : (
                    <Text style={styles.furiganaText}>
                      {flashcard.furiganaText}
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
                // Match the same logic used by the API to determine word vs sentence
                const isWordInput = flashcard.originalText && !(/[.!?。！？]/.test(flashcard.originalText)) && flashcard.originalText.trim().length < 50;
                return (
                <>
                  <Text style={styles.sectionTitle}>
                    {isWordInput ? 'Etymology & Context' : 'Grammar Analysis'}
                  </Text>
                  <Text style={styles.scopeAnalysisText}>
                    {flashcard.scopeAnalysis}
                  </Text>
                  
                  {/* Append Alternate Analysis Button */}
                  {onAppendAnalysis && 
                   !flashcard.scopeAnalysis.includes('--- Etymology & Context ---') && 
                   !flashcard.scopeAnalysis.includes('--- Grammar Analysis ---') && (
                    <TouchableOpacity
                      style={styles.appendAnalysisButton}
                      onPress={handleAppendAnalysis}
                      disabled={isAppendingAnalysis || !isOnline}
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
                </>
                );
              })()}
              
              {/* Always render the image on back side too but conditionally show it */}
              {flashcard.imageUrl && (
                <View 
                  style={[
                    styles.imageContainer,
                    !showImage && styles.hiddenImage
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
                </View>
              )}
              
              {deckName && (
                <View style={styles.deckInfoContainer}>
                  <Text style={styles.deckLabel}>{t('flashcard.sectionTitles.collection')}</Text>
                  <Text style={styles.deckName}>{deckName}</Text>
                </View>
              )}
            </ScrollView>
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
              color={isOnline ? COLORS.royalBlue : COLORS.darkGray} 
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
              color={isOnline ? COLORS.royalBlue : COLORS.darkGray} 
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
              color={isOnline ? COLORS.royalBlue : COLORS.darkGray} 
            />
          </TouchableOpacity>
        )}
      </View>
      
      {/* Bottom right actions for image and flip */}
      <View style={styles.bottomRightActionsContainer}>
        {/* Add image toggle button */}
        {flashcard.imageUrl && (
          <TouchableOpacity style={styles.imageButton} onPress={toggleShowImage}>
            <FontAwesome6 
              name="image" 
              size={24} 
              color="black" />
          </TouchableOpacity>
        )}
        
        {/* Refresh button (only in saved flashcards mode when image is showing) */}
        {flashcard.imageUrl && showRefreshButton && showImage && (
          <TouchableOpacity 
            style={styles.bottomActionButton} 
            onPress={handleImageRetry}
            disabled={imageRetryCount >= MAX_RETRY_COUNT}
          >
            <Ionicons 
              name="refresh" 
              size={24} 
              color={imageRetryCount >= MAX_RETRY_COUNT ? COLORS.darkGray : 'black'} 
            />
          </TouchableOpacity>
        )}
        
        {/* Flip button */}
        <TouchableOpacity style={styles.flipButton} onPress={handleFlip}>
          <MaterialIcons name="flip" size={24} color="black" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Create styles function with responsive card height
const createStyles = (responsiveCardHeight: number) => StyleSheet.create({
  cardContainer: {
    position: 'relative',
    width: '100%',
    marginVertical: 0, // Removed vertical margin - spacing controlled by parent
    paddingHorizontal: 0,
    borderRadius: 16,
    overflow: 'visible',
  },
  expandedCardContainer: {
    marginVertical: 20,
  },
  cardWrapper: {
    width: '100%',
    minHeight: responsiveCardHeight, // Responsive height
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.darkSurface,
    position: 'relative',
    zIndex: 2, // Above the backdrop overlay (zIndex: 1)
    borderWidth: 1,
    borderColor: COLORS.royalBlue,
  },
  expandedCardWrapper: {
    minHeight: Math.min(responsiveCardHeight * 1.8, 650), // Scale expanded height proportionally
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
  },
  cardSide: {
    width: '100%',
    height: '100%',
  },
  cardFront: {
    flex: 1,
    padding: 20,
    paddingTop: 50,
    paddingBottom: 50,
  },
  cardBack: {
    flex: 1,
    padding: 20,
    paddingTop: 50,
    paddingBottom: 50,
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
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.darkGray,
    marginBottom: 5,
    marginTop: 15,
    textAlign: 'center', // Center the title
  },
  furiganaText: {
    fontSize: 20, // Increased from 18 for better visibility on larger cards
    textAlign: 'center', // Center the text
    color: COLORS.text,
    marginBottom: 15,
    lineHeight: 30, // Increased proportionally
  },
  furiganaTextComponent: {
    marginBottom: 15,
    alignSelf: 'center',
  },
  translatedText: {
    fontSize: 20, // Increased from 18 for better visibility on larger cards
    textAlign: 'center', // Center the text
    color: COLORS.text,
    lineHeight: 30, // Increased proportionally
  },
  scopeAnalysisText: {
    fontSize: 16,
    textAlign: 'center',
    color: COLORS.text,
    lineHeight: 24,
    fontStyle: 'italic',
    marginTop: 10,
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
  dualIconContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButtonsContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 8,
    padding: 4,
    zIndex: 10,
  },
  bottomRightActionsContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 8,
    padding: 4,
    zIndex: 10,
  },
  bottomActionButton: {
    marginHorizontal: 8,
    padding: 10,
    backgroundColor: 'rgba(128, 128, 128, 0.5)', // Translucent grey background
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipButton: {
    marginHorizontal: 8,
    padding: 10,
    backgroundColor: 'rgba(128, 128, 128, 0.5)', // Translucent grey background
    borderRadius: 10,
  },
  imageButton: {
    marginHorizontal: 8,
    padding: 10,
    backgroundColor: 'rgba(128, 128, 128, 0.5)', // Translucent grey background
    borderRadius: 10,
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
  hiddenImage: {
    display: 'none', // Hide the image container when toggled off
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
    borderWidth: 1,
    borderColor: COLORS.darkGray,
    backgroundColor: COLORS.darkSurface,
  },
  deckLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.darkGray,
  },
  deckName: {
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
});

export default FlashcardItem; 