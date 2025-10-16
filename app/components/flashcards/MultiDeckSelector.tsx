import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Swipeable } from 'react-native-gesture-handler';
import { Deck } from '../../types/Deck';
import { getDecks, deleteDeck } from '../../services/supabaseStorage';
import { COLORS } from '../../constants/colors';

import { logger } from '../../utils/logger';
interface MultiDeckSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectDecks: (deckIds: string[]) => void;
  initialSelectedDeckIds: string[];
}

export default function MultiDeckSelector({ 
  visible, 
  onClose, 
  onSelectDecks, 
  initialSelectedDeckIds 
}: MultiDeckSelectorProps) {
  const { t } = useTranslation();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>(initialSelectedDeckIds);
  const [isLoading, setIsLoading] = useState(true);
  const [longPressedDeckId, setLongPressedDeckId] = useState<string | null>(null);
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const swipeableRefs = useRef<{ [key: string]: Swipeable | null }>({});

  // Load decks when the component mounts or becomes visible
  useEffect(() => {
    if (visible) {
      loadDecks();
      setSelectedDeckIds(initialSelectedDeckIds);
    }
  }, [visible, initialSelectedDeckIds]);

  // Ensure at least one deck is always selected
  useEffect(() => {
    if (decks.length > 0 && selectedDeckIds.length === 0) {
      // Force select the first deck if no decks are selected
      setSelectedDeckIds([decks[0].id]);
    }
  }, [decks, selectedDeckIds]);

  // Function to load decks from storage
  const loadDecks = async () => {
    setIsLoading(true);
    try {
      const savedDecks = await getDecks();
      setDecks(savedDecks);
      
      // Filter out any invalid deck IDs from initial selection
      const validSelectedIds = initialSelectedDeckIds.filter(id => 
        savedDecks.some(deck => deck.id === id)
      );
      
      // If no valid decks are selected and we have decks, select the first one
      if (validSelectedIds.length === 0 && savedDecks.length > 0) {
        setSelectedDeckIds([savedDecks[0].id]);
      } else if (validSelectedIds.length > 0) {
        setSelectedDeckIds(validSelectedIds);
      }
    } catch (error) {
      logger.error('Error loading collections:', error);
      Alert.alert(t('common.error'), t('review.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle deck selection
  const toggleDeckSelection = (deckId: string) => {
    setSelectedDeckIds(prev => {
      if (prev.includes(deckId)) {
        // If this is the last selected deck, don't allow deselection
        if (prev.length === 1) {
          Alert.alert(t('review.required'), t('review.atLeastOneCollection'));
          return prev;
        }
        return prev.filter(id => id !== deckId);
      } else {
        return [...prev, deckId];
      }
    });
  };

  // Function to close all swipeable actions
  const closeAllSwipeables = () => {
    Object.values(swipeableRefs.current).forEach(ref => {
      if (ref) {
        ref.close();
      }
    });
  };

  // Function to handle saving the deck selection
  const handleSaveSelection = () => {
    closeAllSwipeables();
    
    // Safety check: ensure at least one deck is selected
    if (selectedDeckIds.length === 0 && decks.length > 0) {
      setSelectedDeckIds([decks[0].id]);
      onSelectDecks([decks[0].id]);
    } else {
      onSelectDecks(selectedDeckIds);
    }
    
    onClose();
  };

  // Function to handle closing the modal
  const handleCloseModal = () => {
    closeAllSwipeables();
    onClose();
  };

  // Function to select all decks
  const selectAllDecks = () => {
    setSelectedDeckIds(decks.map(deck => deck.id));
  };

  // Function to select only one deck (deselect all others)
  const selectOnlyThisDeck = (deckId: string) => {
    // Provide haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedDeckIds([deckId]);
    
    // Clear the long press state after a short delay
    setTimeout(() => {
      setLongPressedDeckId(null);
    }, 150);
  };

  // Handle long press start
  const handleLongPressStart = (deckId: string) => {
    setLongPressedDeckId(deckId);
  };

  // Handle long press end
  const handleLongPressEnd = () => {
    setLongPressedDeckId(null);
  };

  // Function to handle deck deletion
  const handleDeleteDeck = async (deckId: string, deckName: string) => {
    Alert.alert(
      t('savedFlashcards.deleteCollection'),
      t('savedFlashcards.deleteCollectionConfirm'),
      [
        {
          text: t('settings.cancel'),
          style: 'cancel',
          onPress: () => {
            // Close the swipeable after cancel
            const swipeableRef = swipeableRefs.current[deckId];
            if (swipeableRef) {
              swipeableRef.close();
            }
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteDeck(deckId, true);
              
              if (success) {
                // Provide haptic feedback
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                
                // Remove from local state immediately - this will cause the item to disappear
                setDecks(prevDecks => prevDecks.filter(deck => deck.id !== deckId));
                
                // Remove from selected decks if it was selected
                setSelectedDeckIds(prevSelected => {
                  const newSelected = prevSelected.filter(id => id !== deckId);
                  const remainingDecks = decks.filter(deck => deck.id !== deckId);
                  
                  // If no decks remain, return empty array
                  if (remainingDecks.length === 0) {
                    return [];
                  }
                  
                  // ALWAYS ensure at least one deck is selected
                  // If no decks would be selected after deletion, select the first remaining deck
                  if (newSelected.length === 0) {
                    return [remainingDecks[0].id];
                  }
                  
                  // Otherwise, keep the current selection
                  return newSelected;
                });
                
                // Show success message (no alert needed, visual feedback is sufficient)
                logger.log('Collection deleted successfully:', deckName);
              } else {
                Alert.alert(
                  'Error',
                  t('savedFlashcards.deleteCollectionError')
                );
              }
            } catch (error) {
              logger.error('Error deleting deck:', error);
              Alert.alert(
                'Error',
                t('savedFlashcards.deleteCollectionError')
              );
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Function to handle swipe completion (triggers delete confirmation)
  const handleSwipeOpen = (deckId: string, deckName: string) => {
    // Provide haptic feedback when swipe completes
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Trigger delete confirmation
    handleDeleteDeck(deckId, deckName);
  };

  // Function to render the delete action
  const renderDeleteAction = (deckId: string, deckName: string) => {
    const isDeleting = deletingDeckId === deckId;
    
    return (
      <View style={styles.deleteActionContainer}>
        <View style={[styles.deleteAction, isDeleting && styles.deleteActionDisabled]}>
          {isDeleting ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="trash" size={24} color="white" />
          )}
        </View>
      </View>
    );
  };

  // Render a deck item with checkbox
  const renderDeckItem = ({ item }: { item: Deck }) => {
    const isSelected = selectedDeckIds.includes(item.id);
    const isLongPressed = longPressedDeckId === item.id;
    const isDeleting = deletingDeckId === item.id;
    
    return (
      <Swipeable
        key={item.id}
        ref={(ref) => (swipeableRefs.current[item.id] = ref)}
        renderRightActions={() => renderDeleteAction(item.id, item.name)}
        rightThreshold={40}
        friction={2}
        overshootRight={false}
        enabled={!isDeleting}
        containerStyle={styles.swipeableContainer}
        onSwipeableWillOpen={() => handleSwipeOpen(item.id, item.name)}
      >
        <TouchableOpacity
          style={[
            styles.deckItem,
            isLongPressed && styles.deckItemLongPressed,
            isDeleting && styles.deckItemDeleting
          ]}
          onPress={() => !isDeleting && toggleDeckSelection(item.id)}
          onLongPress={() => !isDeleting && selectOnlyThisDeck(item.id)}
          onPressIn={() => !isDeleting && handleLongPressStart(item.id)}
          onPressOut={() => handleLongPressEnd()}
          delayLongPress={500}
          disabled={isDeleting}
        >
          <View style={styles.checkboxContainer}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Ionicons name="checkmark" size={16} color={COLORS.text} />}
            </View>
          </View>
          
          <View style={styles.deckInfo}>
            <Text style={[styles.deckName, isDeleting && styles.deckNameDeleting]}>
              {item.name}
            </Text>
            <Text style={[styles.deckDate, isDeleting && styles.deckDateDeleting]}>
              {t('deck.created', { date: new Date(item.createdAt).toLocaleDateString() })}
            </Text>
          </View>
          
          {isDeleting && (
            <View style={styles.deletingIndicator}>
              <ActivityIndicator size="small" color={COLORS.lightGray} />
            </View>
          )}
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
          <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('review.selectCollectionsToReview')}</Text>
              <TouchableOpacity style={styles.closeButton} onPress={handleCloseModal}>
                <Ionicons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>{t('review.loadingCollections')}</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.selectAllButton}
                  onPress={selectAllDecks}
                >
                  <Text style={styles.selectAllText}>{t('review.selectAll')}</Text>
                </TouchableOpacity>
                
                <FlatList
                  data={decks}
                  renderItem={renderDeckItem}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.deckList}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>{t('review.noCollectionsFound')}</Text>
                    </View>
                  }
                />

                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={handleSaveSelection}
                >
                  <Text style={styles.saveButtonText}>
                    {t('review.saveSelection', { 
                      count: selectedDeckIds.length, 
                      type: selectedDeckIds.length === 1 ? t('review.collection') : t('review.collections_plural')
                    })}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.text,
  },
  deckList: {
    paddingVertical: 8,
  },
  deckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.darkSurface,
  },
  deckItemLongPressed: {
    backgroundColor: COLORS.primary,
    transform: [{ scale: 0.98 }],
    opacity: 0.8,
  },
  deckItemDeleting: {
    backgroundColor: COLORS.darkSurface,
    transform: [{ scale: 0.98 }],
    opacity: 0.6,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  checkboxSelected: {
    backgroundColor: COLORS.primary,
  },
  deckIcon: {
    marginRight: 12,
  },
  deckInfo: {
    flex: 1,
  },
  deckName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  deckNameDeleting: {
    color: COLORS.lightGray,
  },
  deckDate: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  deckDateDeleting: {
    color: COLORS.lightGray,
    opacity: 0.6,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  selectAllButton: {
    padding: 8,
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  selectAllText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  deleteActionContainer: {
    flex: 1,
    backgroundColor: '#FF4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    borderRadius: 8,
    minWidth: 80,
    marginTop: 2,
    marginBottom: 2,
    marginRight: 2,
    paddingRight: 20,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  deleteActionDisabled: {
    opacity: 0.5,
  },
  deletingIndicator: {
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeableContainer: {
    marginBottom: 8,
  },
}); 