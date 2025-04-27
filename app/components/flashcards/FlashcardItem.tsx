import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { Flashcard } from '../../types/Flashcard';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

interface FlashcardItemProps {
  flashcard: Flashcard;
  onDelete?: (id: string) => void;
  deckName?: string; // Optional deck name to display
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({ flashcard, onDelete, deckName }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(flashcard.id);
    }
  };

  // Format the date
  const formattedDate = new Date(flashcard.createdAt).toLocaleDateString();

  return (
    <TouchableOpacity
      style={[styles.cardContainer, isFlipped ? styles.cardFlipped : null]}
      activeOpacity={0.9}
      onPress={handleFlip}
    >
      <View style={styles.cardContent}>
        {!isFlipped ? (
          // Front of card
          <View style={styles.cardFront}>
            <Text style={styles.japaneseText} numberOfLines={0}>
              {flashcard.originalText}
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
        ) : (
          // Back of card
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
        )}
      </View>
      
      {onDelete && (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
        </TouchableOpacity>
      )}

      <View style={styles.flipHint}>
        <Ionicons name="sync-outline" size={16} color={COLORS.darkGray} />
        <Text style={styles.flipHintText}>Tap to flip</Text>
      </View>
    </TouchableOpacity>
  );
};

const { width } = Dimensions.get('window');
const cardWidth = width * 0.9;

const styles = StyleSheet.create({
  cardContainer: {
    width: cardWidth,
    minHeight: 200,
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    position: 'relative',
  },
  cardFlipped: {
    backgroundColor: COLORS.mediumSurface,
  },
  cardContent: {
    padding: 16,
    width: '100%',
  },
  cardFront: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  cardBack: {
    padding: 16,
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
  deleteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
  },
  flipHint: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  flipHintText: {
    fontSize: 12,
    color: COLORS.darkGray,
    marginLeft: 4,
  },
});

export default FlashcardItem; 