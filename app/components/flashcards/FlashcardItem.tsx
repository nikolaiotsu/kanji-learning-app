import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { Flashcard } from '../../types/Flashcard';
import { Ionicons } from '@expo/vector-icons';

interface FlashcardItemProps {
  flashcard: Flashcard;
  onDelete?: (id: string) => void;
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({ flashcard, onDelete }) => {
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
            <Text style={styles.dateText}>Created: {formattedDate}</Text>
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
          </View>
        )}
      </View>
      
      {onDelete && (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color="#D32F2F" />
        </TouchableOpacity>
      )}

      <View style={styles.flipHint}>
        <Ionicons name="sync-outline" size={16} color="#757575" />
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
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginVertical: 10,
    marginHorizontal: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    position: 'relative',
  },
  cardFlipped: {
    backgroundColor: '#f8f9fa',
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
  },
  dateText: {
    fontSize: 12,
    color: '#757575',
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#0D47A1',
    marginTop: 12,
  },
  furiganaText: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'HiraginoSans-W3' : undefined,
    lineHeight: 28,
    flexWrap: 'wrap',
  },
  translatedText: {
    fontSize: 16,
    lineHeight: 22,
    flexWrap: 'wrap',
    marginBottom: 24,
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
    color: '#757575',
    marginLeft: 4,
  },
});

export default FlashcardItem; 