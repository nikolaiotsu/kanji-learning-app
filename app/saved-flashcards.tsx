import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Flashcard } from './types/Flashcard';
import { Deck } from './types/Deck';
import { 
  getFlashcards, 
  deleteFlashcard, 
  getDecks, 
  getFlashcardsByDeck, 
  deleteDeck,
  updateDeckName
} from './services/supabaseStorage';
import FlashcardItem from './components/flashcards/FlashcardItem';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './context/AuthContext';
import { supabase } from './services/supabaseClient';
import { COLORS } from './constants/colors';
import { useRouter } from 'expo-router';

export default function SavedFlashcardsScreen() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(true);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const { user } = useAuth();
  const router = useRouter();

  // Load decks and flashcards on mount
  useEffect(() => {
    if (user) {
      // Just load decks directly, don't initialize 
      loadDecks();
    }
  }, [user]);

  // Set up real-time subscription to deck changes
  useEffect(() => {
    if (!user) return;

    // Subscribe to changes in the decks table
    const decksSubscription = supabase
      .channel('decks-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'decks' 
      }, () => {
        // Reload decks when changes occur
        loadDecks();
      })
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(decksSubscription);
    };
  }, [user]);

  // Set up real-time subscription to flashcard changes
  useEffect(() => {
    if (!user || !selectedDeckId) return;

    // Subscribe to changes in the flashcards table for the selected deck
    const flashcardsSubscription = supabase
      .channel('flashcards-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'flashcards',
        filter: `deck_id=eq.${selectedDeckId}`
      }, () => {
        // Reload flashcards when changes occur
        loadFlashcardsByDeck(selectedDeckId);
      })
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(flashcardsSubscription);
    };
  }, [user, selectedDeckId]);

  // Load flashcards when selected deck changes
  useEffect(() => {
    if (selectedDeckId) {
      loadFlashcardsByDeck(selectedDeckId);
    } else if (decks.length > 0) {
      // If no deck is selected but decks are loaded, select the first deck
      setSelectedDeckId(decks[0].id);
    } else {
      // If no decks are available, show empty state
      setFlashcards([]);
      setIsLoadingFlashcards(false);
    }
  }, [selectedDeckId, decks]);

  // Function to load decks from storage
  const loadDecks = async () => {
    setIsLoadingDecks(true);
    try {
      // Pass true to create a default deck if no decks exist
      const savedDecks = await getDecks(true);
      setDecks(savedDecks);
      
      // If there are decks, select the first one by default
      if (savedDecks.length > 0 && !selectedDeckId) {
        setSelectedDeckId(savedDecks[0].id);
      }
    } catch (error) {
      console.error('Error loading decks:', error);
      Alert.alert('Error', 'Failed to load decks. Please try again.');
    } finally {
      setIsLoadingDecks(false);
    }
  };

  // Function to load all flashcards from storage
  const loadAllFlashcards = async () => {
    setIsLoadingFlashcards(true);
    try {
      const savedFlashcards = await getFlashcards();
      // Sort by creation date (newest first)
      savedFlashcards.sort((a, b) => b.createdAt - a.createdAt);
      setFlashcards(savedFlashcards);
    } catch (error) {
      console.error('Error loading flashcards:', error);
      Alert.alert('Error', 'Failed to load flashcards. Please try again.');
    } finally {
      setIsLoadingFlashcards(false);
    }
  };

  // Function to load flashcards for a specific deck
  const loadFlashcardsByDeck = async (deckId: string) => {
    setIsLoadingFlashcards(true);
    try {
      const deckFlashcards = await getFlashcardsByDeck(deckId);
      // Sort by creation date (newest first)
      deckFlashcards.sort((a, b) => b.createdAt - a.createdAt);
      setFlashcards(deckFlashcards);
    } catch (error) {
      console.error('Error loading flashcards for deck:', error);
      Alert.alert('Error', 'Failed to load flashcards for this deck. Please try again.');
    } finally {
      setIsLoadingFlashcards(false);
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

  // Function to handle deck deletion
  const handleDeleteDeck = async (deckId: string) => {
    // Don't allow deleting the last deck
    if (decks.length <= 1) {
      Alert.alert(
        'Cannot Delete',
        'You must have at least one deck. Create a new deck before deleting this one.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Delete Deck',
      'Are you sure you want to delete this deck? All flashcards in this deck will also be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteDeck(deckId);
              if (success) {
                // Update local state if successfully deleted
                const updatedDecks = decks.filter(deck => deck.id !== deckId);
                setDecks(updatedDecks);
                
                // If the deleted deck was selected, select another deck
                if (selectedDeckId === deckId && updatedDecks.length > 0) {
                  setSelectedDeckId(updatedDecks[0].id);
                }
              }
            } catch (error) {
              console.error('Error deleting deck:', error);
              Alert.alert('Error', 'Failed to delete deck. Please try again.');
            }
          },
        },
      ],
    );
  };

  // Function to handle deck rename
  const handleRenameDeck = (deckId: string) => {
    // Find the current deck name
    const deck = decks.find(d => d.id === deckId);
    if (deck) {
      setNewDeckName(deck.name);
      setEditingDeckId(deckId);
    }
  };

  // Function to save the renamed deck
  const saveRenamedDeck = async () => {
    if (!editingDeckId || !newDeckName.trim()) {
      setEditingDeckId(null);
      return;
    }

    try {
      const updatedDeck = await updateDeckName(editingDeckId, newDeckName.trim());
      if (updatedDeck) {
        // Update local state if successfully renamed
        setDecks(decks.map(deck => 
          deck.id === editingDeckId ? updatedDeck : deck
        ));
      }
    } catch (error) {
      console.error('Error renaming deck:', error);
      Alert.alert('Error', 'Failed to rename deck. Please try again.');
    } finally {
      setEditingDeckId(null);
      setNewDeckName('');
    }
  };

  // Function to handle long press on deck item
  const handleDeckLongPress = (deckId: string) => {
    Alert.alert(
      'Deck Options',
      'What would you like to do with this deck?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Rename', 
          onPress: () => handleRenameDeck(deckId) 
        },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: () => handleDeleteDeck(deckId) 
        },
      ]
    );
  };

  // Render deck selector item
  const renderDeckItem = ({ item }: { item: Deck }) => (
    <TouchableOpacity
      style={[
        styles.deckItem,
        selectedDeckId === item.id && styles.selectedDeckItem,
      ]}
      onPress={() => setSelectedDeckId(item.id)}
      onLongPress={() => handleDeckLongPress(item.id)}
      delayLongPress={500} // 500ms long press to trigger
    >
      <Text
        style={[
          styles.deckName,
          selectedDeckId === item.id && styles.selectedDeckName,
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No Flashcards in This Deck</Text>
      <Text style={styles.emptyText}>
        Flashcards you save to this deck will appear here. Go scan some text and save it as a flashcard!
      </Text>
    </View>
  );

  // Render flashcard item
  const renderFlashcard = ({ item }: { item: Flashcard }) => {
    // Find the deck name for this flashcard
    const deck = decks.find(d => d.id === item.deckId);
    const deckName = deck ? deck.name : 'Unknown Deck';
    
    return (
      <FlashcardItem 
        flashcard={item} 
        onDelete={handleDeleteFlashcard} 
        deckName={deckName}
      />
    );
  };

  // Render loading state
  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading flashcards...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {isLoadingDecks ? (
        <View style={styles.deckSelectorPlaceholder}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      ) : (
        <View style={styles.deckSelectorContainer}>
          <FlatList
            data={decks}
            renderItem={renderDeckItem}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.deckSelector}
            ListEmptyComponent={
              <View style={styles.noDecksContainer}>
                <Text style={styles.noDecksText}>No decks available</Text>
              </View>
            }
          />
        </View>
      )}
      
      {/* Deck rename modal */}
      {editingDeckId && (
        <View style={styles.renameModalContainer}>
          <View style={styles.renameModal}>
            <Text style={styles.renameTitle}>Rename Deck</Text>
            <TextInput
              style={styles.renameInput}
              value={newDeckName}
              onChangeText={setNewDeckName}
              autoFocus
              selectTextOnFocus
              maxLength={30}
            />
            <View style={styles.renameButtonsContainer}>
              <TouchableOpacity 
                style={[styles.renameButton, styles.cancelButton]} 
                onPress={() => setEditingDeckId(null)}
              >
                <Text style={styles.renameButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.renameButton, styles.saveButton]} 
                onPress={saveRenamedDeck}
              >
                <Text style={[styles.renameButtonText, styles.saveButtonText]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      
      {isLoadingFlashcards ? (
        renderLoading()
      ) : (
        <View style={styles.flashcardsContainer}>
          <FlatList
            data={flashcards}
            renderItem={renderFlashcard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyState}
            showsVerticalScrollIndicator={true}
            scrollEnabled={true}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 0,
  },
  deckSelectorPlaceholder: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 0,
  },
  deckSelectorContainer: {
    marginTop: 10,
    marginBottom: 0,
    paddingBottom: 0,
  },
  deckSelector: {
    paddingHorizontal: 8,
    marginBottom: 0,
    height: 40,
    paddingBottom: 0,
  },
  deckItem: {
    paddingHorizontal: 16,
    paddingVertical: 0,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: COLORS.darkSurface,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
    height: 36,
  },
  selectedDeckItem: {
    backgroundColor: COLORS.primary,
  },
  deckName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    textAlignVertical: 'center',
  },
  selectedDeckName: {
    color: COLORS.text,
  },
  noDecksContainer: {
    padding: 16,
    alignItems: 'center',
  },
  noDecksText: {
    fontSize: 14,
    color: COLORS.darkGray,
  },
  listContent: {
    padding: 8,
    paddingTop: 0,
    paddingBottom: 30,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.darkGray,
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
    color: COLORS.text,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.darkGray,
    textAlign: 'center',
    lineHeight: 22,
  },
  flashcardsContainer: {
    flex: 1,
    marginTop: 0,
  },
  renameModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  renameModal: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: COLORS.text,
  },
  renameInput: {
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.mediumSurface,
  },
  renameButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  renameButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.lightGray,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  renameButtonText: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  saveButtonText: {
    color: COLORS.text,
  },
  backButtonContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 1000,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginLeft: 8,
  },
  customHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 60,
    backgroundColor: '#1e293b',
    paddingHorizontal: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  placeholderRight: {
    width: 35,
  },
}); 