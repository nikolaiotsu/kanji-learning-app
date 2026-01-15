// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
// @ts-ignore
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Deck } from '../../types/Deck';
import { getDecks, createDeck } from '../../services/supabaseStorage';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../services/supabaseClient';
import { useNetworkState } from '../../services/networkManager';
import { useSubscription } from '../../context/SubscriptionContext';

import { logger } from '../../utils/logger';
interface DeckSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectDeck: (deckId: string) => void;
}

export default function DeckSelector({ visible, onClose, onSelectDeck }: DeckSelectorProps) {
  const { t } = useTranslation();
  const { isConnected } = useNetworkState();
  const { getMaxDecks, subscription } = useSubscription();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [showNewDeckInput, setShowNewDeckInput] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');

  const [isReordering, setIsReordering] = useState(false);
  const [autoDragDeckId, setAutoDragDeckId] = useState<string | null>(null);

  // Add useEffect to track state changes
  useEffect(() => {
    logger.log(`[State] isReordering changed to: ${isReordering}`);
  }, [isReordering]);

  useEffect(() => {
    logger.log(`[State] autoDragDeckId changed to: ${autoDragDeckId}`);
  }, [autoDragDeckId]);

  // Load decks when the component mounts or becomes visible
  useEffect(() => {
    if (visible) {
      loadDecks();
    }
  }, [visible]);

  // Function to load decks from storage
  const loadDecks = async () => {
    logger.log(`[loadDecks] Loading decks...`);
    setIsLoading(true);
    try {
      const savedDecks = await getDecks();
      logger.log(`[loadDecks] Loaded ${savedDecks.length} decks:`, savedDecks.map(d => `${d.name} (${d.id})`));
      setDecks(savedDecks);
    } catch (error) {
      logger.error('Error loading collections:', error);
      Alert.alert(t('common.error'), t('review.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle deck selection
  const handleSelectDeck = (deckId: string) => {
    onSelectDeck(deckId);
    onClose();
  };

  // Function to handle creating a new deck
  const handleCreateDeck = async () => {
    if (!isConnected) {
      Alert.alert(
        t('offline.title') || 'Offline',
        t('offline.createDeckDisabled') || 'Creating decks requires an internet connection.',
        [{ text: t('common.ok') || 'OK' }]
      );
      return;
    }
    
    if (!newDeckName.trim()) {
      Alert.alert(t('common.error'), t('deck.create.error'));
      return;
    }

    // Check deck limit for free users
    const maxDecks = getMaxDecks();
    if (decks.length >= maxDecks) {
      const isPremium = subscription.plan === 'PREMIUM';
      Alert.alert(
        t('deck.limit.title'),
        isPremium 
          ? t('deck.limit.messagePremium', { maxDecks })
          : t('deck.limit.messageFree', { maxDecks }),
        [{ text: t('common.ok') }]
      );
      return;
    }

    setIsCreatingDeck(true);
    try {
      const newDeck = await createDeck(newDeckName.trim());
      setDecks([...decks, newDeck]);
      setNewDeckName('');
      setShowNewDeckInput(false);
      
      handleSelectDeck(newDeck.id);
    } catch (error) {
      logger.error('Error creating collection:', error);
      Alert.alert(t('common.error'), t('deck.create.failed'));
    } finally {
      setIsCreatingDeck(false);
    }
  };

  // Render a deck item
  interface DeckChipProps {
    item: Deck;
    index: number;
    drag: () => void;
    isActive: boolean;
  }

  const DeckChip: React.FC<DeckChipProps> = ({ item, index, drag, isActive }) => {
    React.useEffect(() => {
      logger.log(`[DeckChip] Effect triggered - isReordering: ${isReordering}, autoDragDeckId: ${autoDragDeckId}, item.id: ${item.id}, item.name: ${item.name}`);
      if (isReordering && autoDragDeckId === item.id) {
        logger.log(`[DeckChip] Auto-dragging deck: ${item.name} (${item.id})`);
        setTimeout(() => {
          logger.log(`[DeckChip] Calling drag() for deck: ${item.name}`);
          drag();
        }, 0);
        setAutoDragDeckId(null);
      }
    }, [isReordering, autoDragDeckId]);

    const handlePress = () => {
      logger.log(`[DeckChip] Press on deck: ${item.name} (${item.id}), isReordering: ${isReordering}`);
      if (!isReordering) {
        handleSelectDeck(item.id);
      }
    };

    const handleLongPress = () => {
      logger.log(`[DeckChip] Long press on deck: ${item.name} (${item.id}), isReordering: ${isReordering}, index: ${index}`);
      if (isReordering) {
        logger.log(`[DeckChip] Calling drag() from long press for deck: ${item.name}`);
        drag();
      } else {
        logger.log(`[DeckChip] Entering reorder mode for deck: ${item.name}`);
        // Enter reorder mode via long press on a deck
        setIsReordering(true);
        setAutoDragDeckId(item.id);
        Haptics.selectionAsync();
      }
    };

    return (
      <TouchableOpacity
        style={[
          styles.deckItem,
          isActive && styles.activeDeckItem,
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressIn={() => logger.log(`[DeckChip] Press IN on deck: ${item.name} (index: ${index})`)}
        onPressOut={() => logger.log(`[DeckChip] Press OUT on deck: ${item.name} (index: ${index})`)}
        delayLongPress={500}
      >
        <Ionicons
          name={isReordering ? 'reorder-three' : 'albums-outline'}
          size={24}
          color={COLORS.primary}
          style={styles.deckIcon}
        />
        <View style={styles.deckInfo}>
          <Text style={styles.deckName}>{item.name}</Text>
          <Text style={styles.deckDate}>
            {t('deck.created', { date: new Date(item.createdAt).toLocaleDateString() })}
          </Text>
        </View>
        {!isReordering && (
          <Ionicons name="chevron-forward" size={24} color={COLORS.darkGray} />
        )}
      </TouchableOpacity>
    );
  };

  // Render function for DraggableFlatList
  const renderDeckItem = ({ item, index, drag, isActive }: RenderItemParams<Deck>) => {
    logger.log(`[renderDeckItem] Rendering deck: ${item.name} (${item.id}), index: ${index}, isActive: ${isActive}, drag function type: ${typeof drag}`);
    return (
      <DeckChip 
        item={item} 
        index={index} 
        drag={drag} 
        isActive={isActive} 
      />
    );
  };

  // Handle drag end – update local state then persist to Supabase
  const handleDragEnd = async ({ data }: { data: Deck[] }) => {
    logger.log(`[handleDragEnd] Drag ended, new order:`, data.map(d => `${d.name} (${d.id})`));
    setDecks(data);
    setAutoDragDeckId(null);

    // Optimistically update order on Supabase
    try {
      // Only update order_index using RPC function for safe batch update
      const updates = data.map((deck, idx) => ({ 
        id: deck.id, 
        order_index: idx 
      }));
      logger.log(`[handleDragEnd] Updating Supabase with new order:`, updates);
      // Batch update via RPC function to match DeckReorderModal approach
      const { error } = await supabase
        .rpc('update_deck_order', {
          deck_updates: updates
        });

      if (error) {
        logger.error('Error updating deck order:', error.message);
        
        // Provide more specific error message if it's a column missing issue
        let errorMessage = t('deck.reorder.failed');
        if (error.message.toLowerCase().includes('order_index') && 
            (error.message.toLowerCase().includes('column') || error.message.toLowerCase().includes('does not exist'))) {
          errorMessage = 'Database needs to be updated. Please contact support or check the migration instructions.';
        }
        
        Alert.alert(t('common.error'), errorMessage);
      } else {
        logger.log(`[handleDragEnd] Successfully updated deck order in Supabase`);
      }
    } catch (error) {
      logger.error('Error updating deck order:', error);
      
      // Provide user feedback for catch block errors too
      let errorMessage = t('deck.reorder.failed');
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMsg = (error as { message: string }).message.toLowerCase();
        if (errorMsg.includes('order_index') && (errorMsg.includes('column') || errorMsg.includes('does not exist'))) {
          errorMessage = 'Database needs to be updated. Please contact support or check the migration instructions.';
        }
      }
      
      Alert.alert(t('common.error'), errorMessage);
    }
  };

  const exitReorderMode = () => {
    logger.log(`[exitReorderMode] Exiting reorder mode`);
    setIsReordering(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('deck.select')}</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {/* Reorder mode header */}
            {isReordering && (
              <View style={styles.reorderHeader}>
                <Text style={styles.reorderText}>{t('deck.reorderHint')}</Text>
                <TouchableOpacity onPress={exitReorderMode}>
                  <Text style={styles.doneText}>{t('common.done')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>{t('deck.loading')}</Text>
              </View>
            ) : (
              <>
                {isReordering ? (
                  <DraggableFlatList
                    data={decks}
                    renderItem={renderDeckItem}
                    keyExtractor={(item) => item.id}
                    onDragEnd={handleDragEnd}
                    onDragBegin={(index) => {
                      logger.log(`[DraggableFlatList] Drag began at index: ${index}, deck: ${decks[index]?.name}`);
                    }}
                    activationDistance={20}
                    contentContainerStyle={styles.deckList}
                  />
                ) : (
                  // @ts-ignore – TS struggles to infer renderItem param type here, but runtime is fine
                  <FlatList<Deck>
                    data={decks}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    renderItem={({ item, index }) => (
                      <DeckChip item={item} index={index} drag={() => {}} isActive={false} />
                    )}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.deckList}
                    ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>{t('deck.empty')}</Text>
                      </View>
                    }
                  />
                )}

                {!isReordering && (showNewDeckInput ? (
                  <View style={styles.newDeckContainer}>
                    <TextInput
                      style={styles.newDeckInput}
                      placeholder={t('deck.create.enterName')}
                      value={newDeckName}
                      onChangeText={setNewDeckName}
                      autoFocus
                      onSubmitEditing={handleCreateDeck}
                    />
                    <View style={styles.newDeckButtons}>
                      <TouchableOpacity
                        style={[styles.newDeckButton, styles.cancelButton]}
                        onPress={() => {
                          setShowNewDeckInput(false);
                          setNewDeckName('');
                        }}
                      >
                        <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.newDeckButton,
                          styles.createButton,
                          isCreatingDeck && styles.disabledButton,
                        ]}
                        onPress={handleCreateDeck}
                        disabled={isCreatingDeck}
                      >
                        {isCreatingDeck ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.createButtonText}>{t('common.create')}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.addDeckButton, !isConnected && styles.disabledButton]}
                    onPress={() => {
                      if (!isConnected) {
                        Alert.alert(
                          t('offline.title') || 'Offline',
                          t('offline.createDeckDisabled') || 'Creating decks requires an internet connection.',
                          [{ text: t('common.ok') || 'OK' }]
                        );
                        return;
                      }
                      
                      // Check deck limit before showing input
                      const maxDecks = getMaxDecks();
                      if (decks.length >= maxDecks) {
                        const isPremium = subscription.plan === 'PREMIUM';
                        Alert.alert(
                          t('deck.limit.title'),
                          isPremium 
                            ? t('deck.limit.messagePremium', { maxDecks })
                            : t('deck.limit.messageFree', { maxDecks }),
                          [{ text: t('common.ok') }]
                        );
                        return;
                      }
                      
                      setShowNewDeckInput(true);
                    }}
                  >
                    <Ionicons 
                      name="add-circle-outline" 
                      size={20} 
                      color={isConnected ? "#ffffff" : COLORS.darkGray} 
                    />
                    <Text style={[styles.addDeckButtonText, !isConnected && { color: COLORS.darkGray }]}>
                      {t('deck.create.new')}
                    </Text>
                  </TouchableOpacity>
                ))}
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
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.darkSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
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
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    marginTop: 12,
    color: COLORS.darkGray,
  },
  deckList: {
    paddingBottom: 16,
  },
  deckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  deckIcon: {
    marginRight: 16,
  },
  deckInfo: {
    flex: 1,
  },
  deckName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
    color: COLORS.text,
  },
  deckDate: {
    fontSize: 12,
    color: COLORS.darkGray,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.darkGray,
    textAlign: 'center',
  },
  addDeckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mediumSurface,
    padding: 16,
    margin: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  addDeckButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginLeft: 8,
  },
  newDeckContainer: {
    padding: 16,
    paddingBottom: 8,
    borderTopWidth: 0,
    marginBottom: 0,
  },
  newDeckInput: {
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: COLORS.darkSurface,
    color: COLORS.text,
  },
  newDeckButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  newDeckButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.lightGray,
    marginRight: 8,
  },
  createButton: {
    backgroundColor: COLORS.mediumSurface,
    marginLeft: 8,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  activeDeckItem: {
    backgroundColor: COLORS.lightGray,
  },
  reorderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.mediumSurface,
  },
  reorderText: {
    color: COLORS.text,
    fontSize: 14,
  },
  doneText: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
}); 