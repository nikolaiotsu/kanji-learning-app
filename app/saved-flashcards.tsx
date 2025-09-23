// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, ActivityIndicator, TextInput, Dimensions, Platform, SafeAreaView } from 'react-native';
import { useTranslation } from 'react-i18next';
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
import DeckReorderModal from './components/flashcards/DeckReorderModal';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './context/AuthContext';
import { supabase } from './services/supabaseClient';
import { COLORS } from './constants/colors';
import { useRouter } from 'expo-router';
import PokedexLayout from './components/shared/PokedexLayout';

const POKEDEX_LAYOUT_HORIZONTAL_REDUCTION = 20; // Updated: (padding 10) * 2

export default function SavedFlashcardsScreen() {
  const { t } = useTranslation();
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
  const [triggerLightAnimation, setTriggerLightAnimation] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  // Reorder modal state
  const [showReorderModal, setShowReorderModal] = useState(false);

  const flashcardsListRef = useRef<FlatList>(null);
  const deckSelectorRef = useRef<FlatList>(null);
  const screenWidth = Dimensions.get('window').width;
  const contentWidth = screenWidth - POKEDEX_LAYOUT_HORIZONTAL_REDUCTION;

  // Reset animation trigger after it's been activated
  useEffect(() => {
    if (triggerLightAnimation) {
      // Instead of directly modifying state inside a timer which might cause issues,
      // we'll use a safe approach with cleanup
      const timer = setTimeout(() => {
        setTriggerLightAnimation(false);
      }, 1500); // Allow more time for the animation to complete
      
      // Clean up timer on unmount or when triggerLightAnimation changes
      return () => clearTimeout(timer);
    }
  }, [triggerLightAnimation]);

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
      Alert.alert(t('common.error'), t('savedFlashcards.loadCollectionsError'));
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
      Alert.alert(t('common.error'), t('savedFlashcards.loadFlashcardsError'));
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
      Alert.alert(t('common.error'), t('savedFlashcards.loadFlashcardsForCollectionError'));
    } finally {
      setIsLoadingFlashcards(false);
    }
  };

  // Function to handle flashcard deletion
  const handleDeleteFlashcard = async (id: string) => {
    Alert.alert(
      t('savedFlashcards.deleteFlashcard'),
      t('savedFlashcards.deleteFlashcardConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
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
                              Alert.alert(t('common.error'), t('savedFlashcards.deleteFlashcardError'));
            }
          },
        },
      ],
    );
  };

  // Function to handle deck deletion
  const handleDeleteDeck = async (deckId: string) => {
    Alert.alert(
      t('savedFlashcards.deleteCollection'),
      t('savedFlashcards.deleteCollectionConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteDeck(deckId);
              if (success) {
                // Update local state if successfully deleted
                const updatedDecks = decks.filter(deck => deck.id !== deckId);
                setDecks(updatedDecks);
                
                // Handle selectedDeckId based on remaining decks
                if (selectedDeckId === deckId) {
                  if (updatedDecks.length > 0) {
                    setSelectedDeckId(updatedDecks[0].id);
                    setSelectedDeckIndex(0);
                  } else {
                    // No decks remaining, clear selection
                    setSelectedDeckId(null);
                    setSelectedDeckIndex(0);
                  }
                }
              }
            } catch (error) {
              console.error('Error deleting collection:', error);
              Alert.alert(t('common.error'), t('savedFlashcards.deleteCollectionError'));
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
      Alert.alert(t('common.error'), t('savedFlashcards.renameCollectionError'));
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
        {
          text: t('deck.reorder.title'),
          onPress: () => {
            setShowReorderModal(true);
            Haptics.selectionAsync();
          },
        },
        {
          text: t('savedFlashcards.renameCollection'),
          onPress: () => handleRenameDeck(deckId)
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => handleDeleteDeck(deckId)
        },
        { text: t('common.cancel'), style: 'cancel' },
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
        Alert.alert(t('common.success'), 'Flashcard moved successfully');
      } else {
        Alert.alert(t('common.error'), t('savedFlashcards.moveFlashcardError'));
      }
    } catch (error) {
      console.error('Error moving flashcard:', error);
      Alert.alert(t('common.error'), t('savedFlashcards.moveFlashcardError'));
    } finally {
      closeModal();
    }
  };

  // Function to create a new deck and move flashcard to it
  const createNewDeckAndMove = async () => {
    if (!selectedFlashcardId || !newDeckNameForSend.trim()) {
      Alert.alert(t('common.error'), t('savedFlashcards.enterDeckName'));
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
        Alert.alert(t('common.success'), t('savedFlashcards.moveSuccess', { name: newDeck.name }));
      } else {
        Alert.alert(t('common.error'), t('savedFlashcards.moveFlashcardError'));
      }
    } catch (error) {
      console.error('Error creating deck and moving flashcard:', error);
      Alert.alert(t('common.error'), t('savedFlashcards.createDeckError'));
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

  // Function to handle going back to the previous screen
  const handleGoBack = () => {
    // Always try to go back first
    router.back();
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
      
      // Trigger the light animation
      setTriggerLightAnimation(true);
      
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
        Alert.alert(t('common.success'), 'Flashcard updated successfully.');
      } else {
        Alert.alert(t('common.error'), t('savedFlashcards.updateFlashcardError'));
      }
    } catch (error) {
      console.error('Error updating flashcard:', error);
      Alert.alert(t('common.error'), t('savedFlashcards.unexpectedError'));
    }
  };

  const DeckChip: React.FC<{ item: Deck; index: number }> = ({ item, index }) => {
    return (
      <TouchableOpacity
        style={[
          styles.deckItem,
          selectedDeckId === item.id && styles.selectedDeckItem,
        ]}
        onPress={() => handleDeckSelect(item.id, index)}
        onLongPress={() => handleDeckLongPress(item.id)}
        delayLongPress={500}
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
  };

  // Handle reorder completion from modal
  const handleReorderComplete = (newDecks: Deck[]) => {
    console.log(`[handleReorderComplete] Updating deck order, current selectedDeckId: ${selectedDeckId}`);
    
    setDecks(newDecks);
    
    // Find the new index of the currently selected deck
    const newIndex = newDecks.findIndex(d => d.id === selectedDeckId);
    
    if (newIndex >= 0) {
      // Current deck still exists, update index and ensure it stays selected
      console.log(`[handleReorderComplete] Current deck found at new index: ${newIndex}`);
      setSelectedDeckIndex(newIndex);
      
      // Force reload flashcards for the selected deck to ensure they appear
      if (selectedDeckId) {
        // Add a small delay to ensure state is fully updated
        setTimeout(() => {
          loadFlashcardsByDeck(selectedDeckId);
        }, 50);
      }
      
      // Scroll both deck selector and flashcard pager to show the selected deck after reordering
      if (newIndex >= 0) {
        // Use setTimeout to ensure the deck list has been updated
        setTimeout(() => {
          // Scroll deck selector
          if (deckSelectorRef.current) {
            deckSelectorRef.current.scrollToIndex({
              index: newIndex,
              animated: true,
              viewPosition: 0.5
            });
          }
          
          // Scroll main flashcard pager
          if (flashcardsListRef.current) {
            flashcardsListRef.current.scrollToIndex({
              index: newIndex,
              animated: true,
            });
          }
        }, 100);
      }
    } else if (newDecks.length > 0) {
      // Current deck no longer exists, select the first deck
      console.log(`[handleReorderComplete] Current deck not found, selecting first deck: ${newDecks[0].name}`);
      setSelectedDeckId(newDecks[0].id);
      setSelectedDeckIndex(0);
    } else {
      // No decks available
      console.log(`[handleReorderComplete] No decks available after reorder`);
      setSelectedDeckId(null);
      setSelectedDeckIndex(0);
      setFlashcards([]);
      setIsLoadingFlashcards(false);
    }
  };

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{t('savedFlashcards.noFlashcardsTitle')}</Text>
      <Text style={styles.emptyText}>
        {t('savedFlashcards.noFlashcardsText')}
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
    const pageKey = `${item.id}_${index}_${selectedDeckId === item.id ? 'selected' : 'idle'}`;
    // Return a container with consistent width
    return (
      <View key={pageKey} style={[styles.deckPage, { width: contentWidth }]}>
        {/* Always render deckContentContainer to stabilize layout */}
        <View style={styles.deckContentContainer}>
          {/* Conditionally render content based on selection and loading state */}
          {selectedDeckId === item.id ? (
            isLoadingFlashcards ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>{t('savedFlashcards.loadingFlashcards')}</Text>
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
                removeClippedSubviews={true} // Keep as true for performance on inner lists
              />
            )
          ) : (
            null 
          )}
        </View>
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
    <PokedexLayout 
      variant="flashcards"
      triggerLightAnimation={triggerLightAnimation}
    >
      <SafeAreaView style={styles.container}>
        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={handleGoBack}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Ionicons name="albums-outline" size={24} color={COLORS.text} style={styles.titleIcon} />
            <Text style={styles.title}>{t('savedFlashcards.title')}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>



        {isLoadingDecks ? (
          <View style={styles.deckSelectorPlaceholder}>
            <ActivityIndicator size="small" color="#007AFF" />
          </View>
        ) : (
          <View style={styles.deckSelectorContainer}>
            <FlatList
              ref={deckSelectorRef}
              data={decks}
              renderItem={({ item, index }) => (
                <DeckChip item={item} index={index} />
              )}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.deckSelector}
              ListEmptyComponent={
                <View style={styles.noDecksContainer}>
                  <Text style={styles.noDecksText}>{t('savedFlashcards.noCollections')}</Text>
                </View>
              }
            />
          </View>
        )}
        
        {/* Deck rename modal */}
        {editingDeckId && (
          <View style={styles.renameModalContainer}>
            <View style={styles.renameModal}>
              <Text style={styles.renameTitle}>{t('savedFlashcards.renameCollection')}</Text>
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
                  <Text style={styles.renameButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.renameButton, styles.saveButton]} 
                  onPress={saveRenamedDeck}
                >
                  <Text style={[styles.renameButtonText, styles.saveButtonText]}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        
        {/* Send Flashcard Modal */}
        {showSendModal && (
          <View style={styles.sendModalContainer}>
            <View style={styles.sendModalContent}>
              <Text style={styles.sendModalTitle}>
                {newDeckMode ? t('savedFlashcards.createNewCollection') : t('savedFlashcards.sendToCollection')}
              </Text>
              
              {newDeckMode ? (
                <TextInput
                  style={styles.newDeckInput}
                  value={newDeckNameForSend}
                  onChangeText={setNewDeckNameForSend}
                  placeholder={t('savedFlashcards.enterNewCollectionName')}
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
                      style={styles.deckOptionButton}
                      onPress={() => moveFlashcard(item.id)}
                    >
                      <Text style={styles.deckOptionText}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.noDeckOptions}>{t('savedFlashcards.noOtherCollections')}</Text>
                  }
                />
              )}
              
              <View style={styles.modalButtonContainer}>
                {newDeckMode ? (
                  <>
                    <TouchableOpacity 
                      style={[styles.renameButton, styles.cancelButton]} 
                      onPress={() => setNewDeckMode(false)}
                    >
                      <Text style={styles.renameButtonText}>{t('savedFlashcards.back')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.renameButton, styles.saveButton]} 
                      onPress={createNewDeckAndMove}
                      disabled={!newDeckNameForSend.trim()}
                    >
                      <Text style={[styles.renameButtonText, styles.saveButtonText]}>{t('savedFlashcards.createAndMove')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity 
                      style={[styles.renameButton, styles.cancelButton]} 
                      onPress={closeModal}
                    >
                      <Text style={styles.renameButtonText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.renameButton, styles.saveButton]} 
                      onPress={() => setNewDeckMode(true)}
                    >
                      <Text style={[styles.renameButtonText, styles.saveButtonText]}>{t('savedFlashcards.newCollection')}</Text>
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
              length: contentWidth,
              offset: contentWidth * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const newIndex = Math.round(e.nativeEvent.contentOffset.x / contentWidth);
              if (newIndex !== selectedDeckIndex) {
                handleDeckSwipe(newIndex);
              }
            }}
            scrollEnabled={true}
            style={styles.deckPager}
            removeClippedSubviews={false}
            maxToRenderPerBatch={5}
            windowSize={11}
            decelerationRate="fast"
            snapToAlignment="start"
          />
        )}
        
        {isLoadingDecks && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
                          <Text style={styles.loadingText}>{t('savedFlashcards.loadingFlashcards')}</Text>
          </View>
        )}

        {/* Edit modal for flashcards */}
        <EditFlashcardModal
          visible={showEditModal}
          flashcard={flashcardToEdit}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveEditedFlashcard}
        />

        {/* Deck reorder modal */}
        <DeckReorderModal
          visible={showReorderModal}
          onClose={() => setShowReorderModal(false)}
          decks={decks}
          onReorderComplete={handleReorderComplete}
        />
      </SafeAreaView>
    </PokedexLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.flashcardScreenBackground,
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
    minHeight: 40,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  noDecksText: {
    fontSize: 14,
    color: COLORS.darkGray,
  },
  listContent: {
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 80,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.flashcardScreenBackground,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: COLORS.text,
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
    textAlign: 'center',
  },
  renameButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
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
  deckPager: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.darkGray,
    backgroundColor: COLORS.pokedexBlack,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: COLORS.darkSurface,
  },
  headerSpacer: {
    width: 40, // Match the approximate width of the back button to center the title
  },
  deckPage: {
    alignItems: 'center', 
    justifyContent: 'center',
    paddingHorizontal: 8, 
  },
  deckContentContainer: {
    flex: 1,
    width: '100%',
  },
  deckOptionButton: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.mediumSurface,
    width: '100%',
    alignItems: 'center',
  },
  deckOptionText: {
    fontSize: 16,
    color: COLORS.text,
  },
  newDeckInputContainer: {
    marginTop: 10,
    width: '100%',
  },
  newDeckInput: {
    backgroundColor: COLORS.darkSurface,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    textAlign: 'center',
    marginBottom: 10,
  },
  sendModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sendModalContent: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
  },
  sendModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  deckList: {
    maxHeight: 250,
    marginBottom: 16,
  },
  noDeckOptions: {
    textAlign: 'center',
    color: COLORS.darkGray,
    padding: 16,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },

}); 