import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, ActivityIndicator, TextInput, Dimensions } from 'react-native';
import { Flashcard } from './types/Flashcard';
import { Deck } from './types/Deck';
import { 
  getFlashcards, 
  deleteFlashcard, 
  getDecks, 
  getFlashcardsByDeck, 
  deleteDeck,
  updateDeckName,
  moveFlashcardToDeck,
  createDeck,
  updateFlashcard
} from './services/supabaseStorage';
import FlashcardItem from './components/flashcards/FlashcardItem';
import EditFlashcardModal from './components/flashcards/EditFlashcardModal';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './context/AuthContext';
import { supabase } from './services/supabaseClient';
import { COLORS } from './constants/colors';
import { useRouter } from 'expo-router';

export default function SavedFlashcardsScreen() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [selectedDeckIndex, setSelectedDeckIndex] = useState(0);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(true);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedFlashcardId, setSelectedFlashcardId] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [newDeckMode, setNewDeckMode] = useState(false);
  const [newDeckNameForSend, setNewDeckNameForSend] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [flashcardToEdit, setFlashcardToEdit] = useState<Flashcard | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  const flashcardsListRef = useRef<FlatList>(null);
  const deckSelectorRef = useRef<FlatList>(null);
  const screenWidth = Dimensions.get('window').width;

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
      setSelectedDeckIndex(0);
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
      console.error('Error loading collections:', error);
      Alert.alert('Error', 'Failed to load collections. Please try again.');
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
      console.error('Error loading flashcards for collection:', error);
      Alert.alert('Error', 'Failed to load flashcards for this collection. Please try again.');
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
        'You must have at least one collection. Create a new collection before deleting this one.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Delete Collection',
      'Are you sure you want to delete this collection? All flashcards in this collection will also be deleted.',
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
              console.error('Error deleting collection:', error);
              Alert.alert('Error', 'Failed to delete collection. Please try again.');
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
      console.error('Error renaming collection:', error);
      Alert.alert('Error', 'Failed to rename collection. Please try again.');
    } finally {
      setEditingDeckId(null);
      setNewDeckName('');
    }
  };

  // Function to handle long press on deck item
  const handleDeckLongPress = (deckId: string) => {
    Alert.alert(
      'Collection Options',
      'What would you like to do with this collection?',
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

  // Function to handle flashcard sending
  const handleSendFlashcard = (id: string) => {
    setSelectedFlashcardId(id);
    setShowSendModal(true);
  };

  // Function to move flashcard to selected deck
  const moveFlashcard = async (targetDeckId: string) => {
    if (!selectedFlashcardId) return;
    
    try {
      const success = await moveFlashcardToDeck(selectedFlashcardId, targetDeckId);
      if (success) {
        // If moving from the currently viewed deck, remove from local state
        if (selectedDeckId === flashcards.find(f => f.id === selectedFlashcardId)?.deckId) {
          setFlashcards(cards => cards.filter(card => card.id !== selectedFlashcardId));
        }
        Alert.alert('Success', 'Flashcard moved successfully');
      } else {
        Alert.alert('Error', 'Failed to move flashcard');
      }
    } catch (error) {
      console.error('Error moving flashcard:', error);
      Alert.alert('Error', 'Failed to move flashcard');
    } finally {
      closeModal();
    }
  };

  // Function to create a new deck and move flashcard to it
  const createNewDeckAndMove = async () => {
    if (!selectedFlashcardId || !newDeckNameForSend.trim()) {
      Alert.alert('Error', 'Please enter a deck name');
      return;
    }
    
    try {
      // Create new deck
      const newDeck = await createDeck(newDeckNameForSend.trim());
      
      // Move flashcard to new deck
      const success = await moveFlashcardToDeck(selectedFlashcardId, newDeck.id);
      
      if (success) {
        // If moving from the currently viewed deck, remove from local state
        if (selectedDeckId === flashcards.find(f => f.id === selectedFlashcardId)?.deckId) {
          setFlashcards(cards => cards.filter(card => card.id !== selectedFlashcardId));
        }
        Alert.alert('Success', `Flashcard moved to new collection: ${newDeck.name}`);
      } else {
        Alert.alert('Error', 'Failed to move flashcard');
      }
    } catch (error) {
      console.error('Error creating deck and moving flashcard:', error);
      Alert.alert('Error', 'Failed to create deck and move flashcard');
    } finally {
      closeModal();
    }
  };

  // Close modal and reset state
  const closeModal = () => {
    setShowSendModal(false);
    setSelectedFlashcardId(null);
    setNewDeckMode(false);
    setNewDeckNameForSend('');
  };

  // Function to handle deck selection
  const handleDeckSelect = (deckId: string, index: number) => {
    // Update selected deck state
    setSelectedDeckId(deckId);
    setSelectedDeckIndex(index);
    
    // Scroll the deck selector to keep the selected deck visible
    if (deckSelectorRef.current) {
      deckSelectorRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5
      });
    }

    // Scroll the deck pager to show the selected deck
    if (flashcardsListRef.current) {
      flashcardsListRef.current.scrollToIndex({
        index,
        animated: true,
      });
    }
  };
  
  // Function to handle swipe between decks
  const handleDeckSwipe = (index: number) => {
    if (index >= 0 && index < decks.length) {
      const deck = decks[index];
      
      // Set loading state first to prevent showing stale content
      setIsLoadingFlashcards(true);
      
      // Update selected deck ID and index
      setSelectedDeckId(deck.id);
      setSelectedDeckIndex(index);
      
      // Scroll the deck selector to keep the selected deck visible
      if (deckSelectorRef.current) {
        deckSelectorRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5
        });
      }
    }
  };

  // Function to handle editing flashcard
  const handleEditFlashcard = (id: string) => {
    const flashcard = flashcards.find(card => card.id === id);
    if (flashcard) {
      setFlashcardToEdit(flashcard);
      setShowEditModal(true);
    }
  };

  // Function to save edited flashcard
  const handleSaveEditedFlashcard = async (updatedFlashcard: Flashcard) => {
    try {
      const success = await updateFlashcard(updatedFlashcard);
      if (success) {
        // Update the flashcard in the local state
        setFlashcards(currentFlashcards => 
          currentFlashcards.map(card => 
            card.id === updatedFlashcard.id ? updatedFlashcard : card
          )
        );
        setShowEditModal(false);
        Alert.alert('Success', 'Flashcard updated successfully.');
      } else {
        Alert.alert('Error', 'Failed to update flashcard. Please try again.');
      }
    } catch (error) {
      console.error('Error updating flashcard:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  };

  // Render deck selector item
  const renderDeckItem = ({ item, index }: { item: Deck, index: number }) => (
    <TouchableOpacity
      style={[
        styles.deckItem,
        selectedDeckId === item.id && styles.selectedDeckItem,
      ]}
      onPress={() => handleDeckSelect(item.id, index)}
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
      <Text style={styles.emptyTitle}>No Flashcards in This Collection</Text>
      <Text style={styles.emptyText}>
        Flashcards you save to this collection will appear here. Go scan some text and save it as a flashcard!
      </Text>
    </View>
  );

  // Render flashcard item
  const renderFlashcard = ({ item }: { item: Flashcard }) => {
    return (
      <FlashcardItem
        flashcard={item}
        onDelete={handleDeleteFlashcard}
        onSend={handleSendFlashcard}
        onEdit={handleEditFlashcard}
      />
    );
  };

  // Function to render a deck page with its flashcards
  const renderDeckPage = ({ item, index }: { item: Deck, index: number }) => {
    // Return a container with consistent width
    return (
      <View style={[styles.deckPage, { width: screenWidth }]}>
        {selectedDeckId === item.id && (
          <View style={styles.deckContentContainer}>
            {isLoadingFlashcards ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>Loading flashcards...</Text>
              </View>
            ) : (
              <FlatList
                data={flashcards}
                renderItem={renderFlashcard}
                keyExtractor={(flashcardItem) => flashcardItem.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={renderEmptyState}
                showsVerticalScrollIndicator={true}
                scrollEnabled={true}
                initialNumToRender={4}
                windowSize={5}
                removeClippedSubviews={true}
              />
            )}
          </View>
        )}
      </View>
    );
  };

  // Add a useEffect hook to preload content for smoother transitions
  useEffect(() => {
    // Preload flashcards for the current deck
    if (selectedDeckId) {
      loadFlashcardsByDeck(selectedDeckId);
    }
  }, [selectedDeckId]);

  return (
    <View style={styles.container}>
      {isLoadingDecks ? (
        <View style={styles.deckSelectorPlaceholder}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      ) : (
        <View style={styles.deckSelectorContainer}>
          <FlatList
            ref={deckSelectorRef}
            data={decks}
            renderItem={renderDeckItem}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.deckSelector}
            ListEmptyComponent={
              <View style={styles.noDecksContainer}>
                <Text style={styles.noDecksText}>No collections available</Text>
              </View>
            }
          />
        </View>
      )}
      
      {/* Deck rename modal */}
      {editingDeckId && (
        <View style={styles.renameModalContainer}>
          <View style={styles.renameModal}>
            <Text style={styles.renameTitle}>Rename Collection</Text>
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
      
      {/* Send Flashcard Modal */}
      {showSendModal && (
        <View style={styles.renameModalContainer}>
          <View style={styles.sendModal}>
            <Text style={styles.renameTitle}>
              {newDeckMode ? 'Create New Collection' : 'Send to Collection'}
            </Text>
            
            {newDeckMode ? (
              <TextInput
                style={styles.renameInput}
                value={newDeckNameForSend}
                onChangeText={setNewDeckNameForSend}
                placeholder="Enter new collection name"
                placeholderTextColor={COLORS.darkGray}
                autoFocus
                maxLength={30}
              />
            ) : (
              <FlatList
                data={decks.filter(deck => deck.id !== selectedDeckId)}
                keyExtractor={(item) => item.id}
                style={styles.deckList}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={styles.deckListItem}
                    onPress={() => moveFlashcard(item.id)}
                  >
                    <Text style={styles.deckListItemText}>{item.name}</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.darkGray} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.noDeckOptions}>No other collections available</Text>
                }
              />
            )}
            
            <View style={styles.sendModalButtons}>
              {newDeckMode ? (
                <>
                  <TouchableOpacity 
                    style={[styles.renameButton, styles.cancelButton]} 
                    onPress={() => setNewDeckMode(false)}
                  >
                    <Text style={styles.renameButtonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.renameButton, styles.saveButton]} 
                    onPress={createNewDeckAndMove}
                    disabled={!newDeckNameForSend.trim()}
                  >
                    <Text style={[styles.renameButtonText, styles.saveButtonText]}>Create & Move</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity 
                    style={[styles.renameButton, styles.cancelButton]} 
                    onPress={closeModal}
                  >
                    <Text style={styles.renameButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.renameButton, styles.saveButton]} 
                    onPress={() => setNewDeckMode(true)}
                  >
                    <Text style={[styles.renameButtonText, styles.saveButtonText]}>New Collection</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      )}
      
      {/* Deck pages with flashcards */}
      {!isLoadingDecks && decks.length > 0 && (
        <FlatList
          ref={flashcardsListRef}
          data={decks}
          renderItem={renderDeckPage}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={selectedDeckIndex}
          getItemLayout={(_, index) => ({
            length: screenWidth,
            offset: screenWidth * index,
            index,
          })}
          onMomentumScrollEnd={(e) => {
            const newIndex = Math.floor(e.nativeEvent.contentOffset.x / screenWidth);
            if (newIndex !== selectedDeckIndex) {
              handleDeckSwipe(newIndex);
            }
          }}
          scrollEnabled={true}
          style={styles.deckPager}
          removeClippedSubviews={false}
          maxToRenderPerBatch={1}
          windowSize={3}
          decelerationRate="fast"
          snapToAlignment="start"
        />
      )}
      
      {isLoadingDecks && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading flashcards...</Text>
        </View>
      )}

      {/* Edit modal for flashcards */}
      <EditFlashcardModal
        visible={showEditModal}
        flashcard={flashcardToEdit}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveEditedFlashcard}
      />
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
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 80,
    flexGrow: 1,
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
    width: '100%',
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
    width: '80%',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  sendModal: {
    width: '90%',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    maxHeight: '80%',
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: COLORS.text,
    textAlign: 'center',
  },
  renameInput: {
    backgroundColor: COLORS.mediumSurface,
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 16,
  },
  renameButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  renameButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: COLORS.mediumSurface,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  renameButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  saveButtonText: {
    color: COLORS.text,
  },
  deckList: {
    maxHeight: 250,
    marginBottom: 16,
  },
  deckListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.mediumSurface,
  },
  deckListItemText: {
    fontSize: 16,
    color: COLORS.text,
  },
  noDeckOptions: {
    textAlign: 'center',
    color: COLORS.darkGray,
    padding: 16,
  },
  sendModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
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
  deckPage: {
    flex: 1,
    width: '100%',
  },
  deckContentContainer: {
    flex: 1,
    width: '100%',
  },
  deckPager: {
    flex: 1,
  },
}); 