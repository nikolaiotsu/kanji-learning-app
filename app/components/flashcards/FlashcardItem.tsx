import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, Animated, ScrollView, LayoutChangeEvent, Image } from 'react-native';
import { Flashcard } from '../../types/Flashcard';
import { Ionicons, MaterialIcons, FontAwesome6 } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { useSettings, AVAILABLE_LANGUAGES } from '../../context/SettingsContext';
import { 
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
  containsGermanText
} from '../../utils/textFormatting';

interface FlashcardItemProps {
  flashcard: Flashcard;
  onDelete?: (id: string) => void;
  onSend?: (id: string) => void;
  onEdit?: (id: string) => void;
  onImageToggle?: (showImage: boolean) => void;
  deckName?: string; // Optional deck name to display
  disableTouchHandling?: boolean; // If true, the card won't be flippable via touch
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({ 
  flashcard, 
  onDelete, 
  onSend, 
  onEdit,
  onImageToggle,
  deckName,
  disableTouchHandling = false 
}) => {
  const { targetLanguage } = useSettings();
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
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
  
  // Get translated language name for display
  const translatedLanguageName = AVAILABLE_LANGUAGES[targetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'English';

  // Detect language of the text
  useEffect(() => {
    const originalText = flashcard.originalText;
    const hasJapanese = containsJapanese(originalText);
    const hasChinese = containsChinese(originalText);
    const hasKorean = containsKoreanText(originalText);
    const hasRussian = containsRussianText(originalText);
    const hasArabic = containsArabicText(originalText);
    const hasItalian = containsItalianText(originalText);
    const hasTagalog = containsTagalogText(originalText);
    const hasFrench = containsFrenchText(originalText);
    const hasSpanish = containsSpanishText(originalText);
    const hasPortuguese = containsPortugueseText(originalText);
    const hasGerman = containsGermanText(originalText);
    
    // Determine language
    let language = 'unknown';
    if (hasJapanese && !hasChinese && !hasKorean) language = 'Japanese';
    else if (hasChinese) language = 'Chinese';
    else if (hasKorean) language = 'Korean';
    else if (hasRussian) language = 'Russian';
    else if (hasArabic) language = 'Arabic';
    else if (hasItalian) language = 'Italian';
    else if (hasTagalog) language = 'Tagalog';
    else if (hasFrench) language = 'French';
    else if (hasSpanish) language = 'Spanish';
    else if (hasPortuguese) language = 'Portuguese';
    else if (hasGerman) language = 'German';
    else {
      // Check if the text is primarily Latin characters (likely English or other European languages)
      const latinChars = originalText.replace(/\s+/g, '').split('').filter(char => /[a-zA-Z]/.test(char)).length;
      if (latinChars > 0 && latinChars / originalText.replace(/\s+/g, '').length >= 0.5) {
        language = 'English';
      }
    }
    setDetectedLanguage(language);

    // All these languages need romanization
    const needsRom = hasJapanese || hasChinese || hasKorean || hasRussian || hasArabic;
    setNeedsRomanization(needsRom);
  }, [flashcard.originalText]);

  // Function to handle card flipping
  const handleFlip = () => {
    if (disableTouchHandling) return;
    
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
    if (onDelete) {
      onDelete(flashcard.id);
    }
  };

  const handleSend = () => {
    if (onSend) {
      onSend(flashcard.id);
    }
  };
  
  const handleEdit = () => {
    if (onEdit) {
      onEdit(flashcard.id);
    }
  };

  // Toggle showing the image
  const toggleShowImage = () => {
    const newState = !showImage;
    setShowImage(newState);
    // Call the onImageToggle callback if provided
    if (onImageToggle) {
      onImageToggle(newState);
    }
  };

  // Handle image load success
  const handleImageLoad = () => {
    setIsImageLoaded(true);
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

  // Pre-load the image when the component mounts
  useEffect(() => {
    if (flashcard.imageUrl) {
      Image.prefetch(flashcard.imageUrl).catch(() => {
        // Silent catch - we'll still try to load the image normally if prefetch fails
      });
    }
  }, [flashcard.imageUrl]);

  return (
    <View style={[
      styles.cardContainer,
      showImage && flashcard.imageUrl ? styles.expandedCardContainer : null
    ]}>
      <View style={[
        styles.cardWrapper,
        showImage && flashcard.imageUrl ? styles.expandedCardWrapper : null
      ]}>
        {/* Front of the card */}
        <Animated.View style={[styles.cardContent, styles.cardSide, frontAnimatedStyle]}>
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
                <Text style={styles.japaneseText}>
                  {flashcard.originalText}
                </Text>
              </View>
              
              {/* Always render the image but conditionally show it */}
              {flashcard.imageUrl && (
                <View style={[
                  styles.imageContainer,
                  !showImage && styles.hiddenImage
                ]}>
                  <Image 
                    source={{ uri: flashcard.imageUrl }} 
                    style={styles.image}
                    resizeMode="contain"
                    onLoad={handleImageLoad}
                  />
                </View>
              )}
            </ScrollView>
          </View>
        </Animated.View>

        {/* Back of the card */}
        <Animated.View style={[styles.cardContent, styles.cardSide, backAnimatedStyle]}>
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
                    {detectedLanguage === 'Japanese' ? 'With Furigana' :
                     detectedLanguage === 'Chinese' ? 'With Pinyin' :
                     detectedLanguage === 'Korean' ? 'With Revised Romanization' :
                     detectedLanguage === 'Russian' ? 'With Practical Romanization' :
                     detectedLanguage === 'Arabic' ? 'With Arabic Chat Alphabet' :
                     detectedLanguage === 'Italian' ? 'With Italian Alphabet' :
                     detectedLanguage === 'Tagalog' ? 'With Tagalog Alphabet' :
                     'With Pronunciation Guide'}
                  </Text>
                  <Text style={styles.furiganaText}>
                    {flashcard.furiganaText}
                  </Text>
                </>
              )}
              
              <Text style={styles.sectionTitle}>{translatedLanguageName} Translation</Text>
              <Text style={styles.translatedText}>
                {flashcard.translatedText}
              </Text>
              
              {/* Always render the image on back side too but conditionally show it */}
              {flashcard.imageUrl && (
                <View style={[
                  styles.imageContainer,
                  !showImage && styles.hiddenImage
                ]}>
                  <Image 
                    source={{ uri: flashcard.imageUrl }} 
                    style={styles.image}
                    resizeMode="contain"
                    onLoad={handleImageLoad}
                  />
                </View>
              )}
              
              {deckName && (
                <View style={styles.deckInfoContainer}>
                  <Text style={styles.deckLabel}>Collection:</Text>
                  <Text style={styles.deckName}>{deckName}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Animated.View>
      </View>
      
      {/* Card Actions */}
      <View style={styles.actionButtonsContainer}>
        {onDelete && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={22} color={COLORS.royalBlue} />
          </TouchableOpacity>
        )}
        
        {onEdit && (
          <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
            <Ionicons name="pencil" size={22} color={COLORS.royalBlue} />
          </TouchableOpacity>
        )}
        
        {onSend && (
          <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
            <MaterialIcons name="drive-file-move-outline" size={22} color={COLORS.royalBlue} />
          </TouchableOpacity>
        )}
      </View>
      
      {/* Bottom right actions for image and flip */}
      <View style={styles.bottomRightActionsContainer}>
        {/* Add image toggle button */}
        {flashcard.imageUrl && (
          <TouchableOpacity style={styles.bottomActionButton} onPress={toggleShowImage}>
            <FontAwesome6 
              name="image" 
              size={20} 
              color={COLORS.royalBlue} />
          </TouchableOpacity>
        )}
        
        {/* Flip button */}
        <TouchableOpacity style={styles.bottomActionButton} onPress={handleFlip}>
          <MaterialIcons name="flip" size={22} color={COLORS.royalBlue} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const { width } = Dimensions.get('window');
const cardWidth = width * 0.9;

const styles = StyleSheet.create({
  cardContainer: {
    position: 'relative',
    width: '100%',
    marginVertical: 10,
    paddingHorizontal: 0, // Removed padding, deckPage now handles horizontal spacing
    borderRadius: 16,
    overflow: 'visible', // Allow overflow for the flip button
  },
  expandedCardContainer: {
    // Additional styles for when card is expanded with image
    marginVertical: 20,
  },
  cardWrapper: {
    width: '100%',
    minHeight: 350, // Increased from 280 to make cards larger
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.darkSurface,
    position: 'relative',
  },
  expandedCardWrapper: {
    // This expands the card height when an image is displayed
    minHeight: 650, // Increased from 550 to accommodate larger base size
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
    borderWidth: 1,
    borderColor: COLORS.royalBlue,
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
  translatedText: {
    fontSize: 20, // Increased from 18 for better visibility on larger cards
    textAlign: 'center', // Center the text
    color: COLORS.text,
    lineHeight: 30, // Increased proportionally
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
    padding: 6,
  },
  flipButton: {
    marginHorizontal: 8,
    padding: 6,
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
  imageButton: {
    marginHorizontal: 8,
    padding: 6,
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
});

export default FlashcardItem; 