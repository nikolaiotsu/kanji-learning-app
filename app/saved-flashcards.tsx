import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Flashcard } from './types/Flashcard';
import { getFlashcards, deleteFlashcard } from './services/flashcardStorage';
import FlashcardItem from './components/flashcards/FlashcardItem';

export default function SavedFlashcardsScreen() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load flashcards on mount
  useEffect(() => {
    loadFlashcards();
  }, []);

  // Function to load flashcards from storage
  const loadFlashcards = async () => {
    setIsLoading(true);
    try {
      const savedFlashcards = await getFlashcards();
      // Sort by creation date (newest first)
      savedFlashcards.sort((a, b) => b.createdAt - a.createdAt);
      setFlashcards(savedFlashcards);
    } catch (error) {
      console.error('Error loading flashcards:', error);
      Alert.alert('Error', 'Failed to load flashcards. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle flashcard deletion
  const handleDeleteFlashcard = async (id: string) => {
    Alert.alert(
      'Delete Flashcard',
      'Are you sure you want to delete this flashcard?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteFlashcard(id);
              if (success) {
                // Update local state if successfully deleted
                setFlashcards(cards => cards.filter(card => card.id !== id));
              }
            } catch (error) {
              console.error('Error deleting flashcard:', error);
              Alert.alert('Error', 'Failed to delete flashcard. Please try again.');
            }
          },
        },
      ],
    );
  };

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No Flashcards Saved</Text>
      <Text style={styles.emptyText}>
        Flashcards you save will appear here. Go scan some Japanese text and save it as a flashcard!
      </Text>
    </View>
  );

  // Render flashcard item
  const renderFlashcard = ({ item }: { item: Flashcard }) => (
    <FlashcardItem flashcard={item} onDelete={handleDeleteFlashcard} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Saved Flashcards</Text>
      
      <FlatList
        data={flashcards}
        renderItem={renderFlashcard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        showsVerticalScrollIndicator={true}
        scrollEnabled={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    margin: 16,
    textAlign: 'center',
  },
  listContent: {
    padding: 8,
    paddingBottom: 30,
    flexGrow: 0,
  },
  emptyContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#424242',
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    lineHeight: 22,
  },
}); 