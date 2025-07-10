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

interface DeckSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectDeck: (deckId: string) => void;
}

export default function DeckSelector({ visible, onClose, onSelectDeck }: DeckSelectorProps) {
  const { t } = useTranslation();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [showNewDeckInput, setShowNewDeckInput] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');

  const [isReordering, setIsReordering] = useState(false);
  const [autoDragDeckId, setAutoDragDeckId] = useState<string | null>(null);

  // Load decks when the component mounts or becomes visible
  useEffect(() => {
    if (visible) {
      loadDecks();
    }
  }, [visible]);

  // Function to load decks from storage
  const loadDecks = async () => {
    setIsLoading(true);
    try {
      const savedDecks = await getDecks();
      setDecks(savedDecks);
    } catch (error) {
      console.error('Error loading collections:', error);
      Alert.alert('Error', 'Failed to load collections. Please try again.');
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
    if (!newDeckName.trim()) {
      Alert.alert(t('common.error'), t('deck.create.error'));
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
      console.error('Error creating collection:', error);
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
      if (isReordering && autoDragDeckId === item.id) {
        setTimeout(() => drag(), 0);
        setAutoDragDeckId(null);
      }
    }, [isReordering, autoDragDeckId]);

    return (
      <TouchableOpacity
        style={[
          styles.deckItem,
          isActive && styles.activeDeckItem,
        ]}
        onPress={() => !isReordering && handleSelectDeck(item.id)}
        onLongPress={() => {
          if (isReordering) {
            drag();
          } else {
            // Enter reorder mode via long press on a deck
            setIsReordering(true);
            setAutoDragDeckId(item.id);
            Haptics.selectionAsync();
          }
        }}
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

  // Handle drag end – update local state then persist to Supabase
  const handleDragEnd = async ({ data }: { data: Deck[] }) => {
    setDecks(data);
    setAutoDragDeckId(null);

    // Optimistically update order on Supabase
    try {
      const updates = data.map((deck, idx) => ({ id: deck.id, name: deck.name, order_index: idx }));
      // Batch update via upsert
      const { error } = await supabase
        .from('decks')
        .upsert(updates);

      if (error) {
        console.error('Error updating deck order:', error.message);
        Alert.alert(t('common.error'), t('deck.reorder.failed'));
      }
    } catch (error) {
      console.error('Error updating deck order:', error);
    }
  };

  const exitReorderMode = () => {
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
                    style={styles.addDeckButton}
                    onPress={() => setShowNewDeckInput(true)}
                  >
                    <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
                    <Text style={styles.addDeckButtonText}>{t('deck.create.new')}</Text>
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