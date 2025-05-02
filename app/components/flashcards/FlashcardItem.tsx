import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, Animated } from 'react-native';
import { Flashcard } from '../../types/Flashcard';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

interface FlashcardItemProps {
  flashcard: Flashcard;
  onDelete?: (id: string) => void;
  onSend?: (id: string) => void;
  deckName?: string; // Optional deck name to display
  disableTouchHandling?: boolean; // If true, the card won't be flippable via touch
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({ 
  flashcard, 
  onDelete, 
  onSend, 
  deckName,
  disableTouchHandling = false 
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

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

  // Format the date
  const formattedDate = new Date(flashcard.createdAt).toLocaleDateString();
  
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

  // Use a regular View instead of TouchableOpacity if touch handling is disabled
  const CardWrapper = disableTouchHandling ? View : TouchableOpacity;
  const cardWrapperProps = disableTouchHandling 
    ? { style: styles.cardContainer } 
    : { style: styles.cardContainer, activeOpacity: 0.9, onPress: handleFlip };

  return (
    <CardWrapper {...cardWrapperProps}>
      <View style={styles.cardWrapper}>
        {/* Front of the card */}
        <Animated.View style={[styles.cardContent, styles.cardSide, frontAnimatedStyle]}>
          <View style={styles.cardFront}>
            <View style={styles.japaneseTextContainer}>
              <Text style={styles.japaneseText} numberOfLines={0}>
                {flashcard.originalText}
              </Text>
            </View>
            <View style={styles.cardInfo}>
              {deckName && (
                <View style={styles.deckBadge}>
                  <Text style={styles.deckName}>{deckName}</Text>
                </View>
              )}
              <Text style={styles.dateText}>Created: {formattedDate}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Back of the card */}
        <Animated.View style={[styles.cardContent, styles.cardSide, backAnimatedStyle]}>
          <View style={styles.cardBack}>
            <Text style={styles.sectionTitle}>With Furigana</Text>
            <Text style={styles.furiganaText} numberOfLines={0}>
              {flashcard.furiganaText}
            </Text>
            
            <Text style={styles.sectionTitle}>English Translation</Text>
            <Text style={styles.translatedText} numberOfLines={0}>
              {flashcard.translatedText}
            </Text>
            
            <View style={styles.cardInfo}>
              {deckName && (
                <View style={styles.deckBadge}>
                  <Text style={styles.deckName}>{deckName}</Text>
                </View>
              )}
              <Text style={styles.dateText}>Created: {formattedDate}</Text>
            </View>
          </View>
        </Animated.View>
      </View>
      
      <View style={styles.cardActions}>
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

      {!disableTouchHandling && (
        <View style={styles.flipHint}>
          <Ionicons name="sync-outline" size={16} color={COLORS.darkGray} />
          <Text style={styles.flipHintText}>Tap to flip</Text>
        </View>
      )}
    </CardWrapper>
  );
};

const { width } = Dimensions.get('window');
const cardWidth = width * 0.9;

const styles = StyleSheet.create({
  cardContainer: {
    width: cardWidth,
    minHeight: 200,
    backgroundColor: 'transparent',
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 10,
    position: 'relative',
  },
  cardWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
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
  },
  cardFront: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  cardBack: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: COLORS.mediumSurface,
    borderRadius: 12,
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
  cardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  deckBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  deckName: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: COLORS.darkGray,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: COLORS.pastelPurple,
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
  sendButton: {
    padding: 8,
    marginRight: 4,
  },
  deleteButton: {
    padding: 8,
  },
  flipHint: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  flipHintText: {
    fontSize: 12,
    color: COLORS.darkGray,
    marginLeft: 4,
  },
});

export default FlashcardItem; 