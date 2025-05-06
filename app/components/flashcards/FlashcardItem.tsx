import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, Animated, ScrollView, LayoutChangeEvent } from 'react-native';
import { Flashcard } from '../../types/Flashcard';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { 
  containsJapanese, 
  containsChinese, 
  containsKoreanText, 
  containsRussianText, 
  containsArabicText 
} from '../../utils/textFormatting';

interface FlashcardItemProps {
  flashcard: Flashcard;
  onDelete?: (id: string) => void;
  onSend?: (id: string) => void;
  onEdit?: (id: string) => void;
  deckName?: string; // Optional deck name to display
  disableTouchHandling?: boolean; // If true, the card won't be flippable via touch
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({ 
  flashcard, 
  onDelete, 
  onSend, 
  onEdit,
  deckName,
  disableTouchHandling = false 
}) => {
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

  // Detect language of the text
  useEffect(() => {
    const originalText = flashcard.originalText;
    const hasJapanese = containsJapanese(originalText);
    const hasChinese = containsChinese(originalText);
    const hasKorean = containsKoreanText(originalText);
    const hasRussian = containsRussianText(originalText);
    const hasArabic = containsArabicText(originalText);
    
    // Determine language
    let language = 'unknown';
    if (hasJapanese && !hasChinese && !hasKorean) language = 'Japanese';
    else if (hasChinese) language = 'Chinese';
    else if (hasKorean) language = 'Korean';
    else if (hasRussian) language = 'Russian';
    else if (hasArabic) language = 'Arabic';
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

  return (
    <View style={styles.cardContainer}>
      <View style={styles.cardWrapper}>
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
                    layoutMeasurement: { height: 300 } // Approximate card height
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
                    layoutMeasurement: { height: 300 } // Approximate card height
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
                     'With Romanization'}
                  </Text>
                  <Text style={styles.furiganaText}>
                    {flashcard.furiganaText}
                  </Text>
                </>
              )}
              
              <Text style={styles.sectionTitle}>English Translation</Text>
              <Text style={styles.translatedText}>
                {flashcard.translatedText}
              </Text>
            </ScrollView>
          </View>
        </Animated.View>
      </View>
      
      {/* Card actions and flip button */}
      <View style={styles.cardActions}>
        {onEdit && (
          <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
            <MaterialIcons name="edit" size={25} color={COLORS.primary} />
          </TouchableOpacity>
        )}
        
        {onSend && (
          <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
            <MaterialIcons name="move-up" size={25} color={COLORS.primary} />
          </TouchableOpacity>
        )}
        
        {onDelete && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={25} color={COLORS.danger} />
          </TouchableOpacity>
        )}
      </View>
      
      {/* Flip button - separate from the content to avoid conflicts with scrolling */}
      {!disableTouchHandling && (
        <TouchableOpacity 
          style={styles.flipButton} 
          onPress={handleFlip}
          activeOpacity={0.8}
        >
          <MaterialIcons name="flip" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const { width } = Dimensions.get('window');
const cardWidth = width * 0.9;

const styles = StyleSheet.create({
  cardContainer: {
    width: cardWidth,
    minHeight: 200,
    maxHeight: 350,
    backgroundColor: 'transparent',
    borderRadius: 12,
    marginVertical: 10,
    marginHorizontal: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  cardWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    minHeight: 200,
  },
  cardSide: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    borderRadius: 12,
  },
  cardContent: {
    paddingTop: 48, // Add extra padding to the top for action buttons
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    height: '100%',
    flexDirection: 'column',
  },
  cardFront: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 16,
    flex: 1,
    width: '100%',
  },
  cardBack: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    flex: 1,
    width: '100%',
  },
  japaneseTextContainer: {
    width: '100%',
    paddingHorizontal: 16, 
    alignItems: 'center',
  },
  japaneseText: {
    fontSize: 24,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
    letterSpacing: 0.5,
    lineHeight: 32,
    flexWrap: 'wrap',
    marginBottom: 16,
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: COLORS.accentMedium,
    marginTop: 12,
  },
  furiganaText: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
    lineHeight: 28,
    flexWrap: 'wrap',
    color: COLORS.text,
  },
  translatedText: {
    fontSize: 16,
    lineHeight: 22,
    flexWrap: 'wrap',
    marginBottom: 24,
    color: COLORS.text,
  },
  cardActions: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 8,
    padding: 4,
    zIndex: 10,
  },
  editButton: {
    padding: 8,
    marginRight: 5,
  },
  sendButton: {
    padding: 8,
    marginRight: 5,
  },
  deleteButton: {
    padding: 8,
  },
  scrollContainer: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 4,
  },
  scrollContentContainer: {
    paddingBottom: 24,
    paddingTop: 8,
  },
  scrollIndicator: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(30, 30, 30, 0.7)',
    borderRadius: 12,
    padding: 4,
    opacity: 0.7,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  flipButton: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    padding: 10,
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deckNameContainer: {
    padding: 8,
    marginLeft: 5,
  },
  deckNameText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.accentMedium,
  },
});

export default FlashcardItem; 