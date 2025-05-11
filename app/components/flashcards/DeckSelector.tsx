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
import { Ionicons } from '@expo/vector-icons';
import { Deck } from '../../types/Deck';
import { getDecks, createDeck } from '../../services/supabaseStorage';
import { COLORS } from '../../constants/colors';

interface DeckSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectDeck: (deckId: string) => void;
}

export default function DeckSelector({ visible, onClose, onSelectDeck }: DeckSelectorProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [showNewDeckInput, setShowNewDeckInput] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');

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
      Alert.alert('Error', 'Please enter a name for the new collection.');
      return;
    }

    setIsCreatingDeck(true);
    try {
      const newDeck = await createDeck(newDeckName.trim());
      setDecks([...decks, newDeck]);
      setNewDeckName('');
      setShowNewDeckInput(false);
      
      // Select the newly created deck
      handleSelectDeck(newDeck.id);
    } catch (error) {
      console.error('Error creating collection:', error);
      Alert.alert('Error', 'Failed to create new collection. Please try again.');
    } finally {
      setIsCreatingDeck(false);
    }
  };

  // Render a deck item
  const renderDeckItem = ({ item }: { item: Deck }) => (
    <TouchableOpacity
      style={styles.deckItem}
      onPress={() => handleSelectDeck(item.id)}
    >
      <Ionicons name="albums-outline" size={24} color={COLORS.primary} style={styles.deckIcon} />
      <View style={styles.deckInfo}>
        <Text style={styles.deckName}>{item.name}</Text>
        <Text style={styles.deckDate}>
          Created: {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={COLORS.darkGray} />
    </TouchableOpacity>
  );

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
              <Text style={styles.title}>Select Collection</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading collections...</Text>
              </View>
            ) : (
              <>
                <FlatList
                  data={decks}
                  renderItem={renderDeckItem}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.deckList}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>No collections found. Create your first collection!</Text>
                    </View>
                  }
                />

                {showNewDeckInput ? (
                  <View style={styles.newDeckContainer}>
                    <TextInput
                      style={styles.newDeckInput}
                      placeholder="Enter collection name"
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
                        <Text style={styles.cancelButtonText}>Cancel</Text>
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
                          <Text style={styles.createButtonText}>Create</Text>
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
                    <Text style={styles.addDeckButtonText}>Create New Collection</Text>
                  </TouchableOpacity>
                )}
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
    backgroundColor: COLORS.background,
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
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.primary,
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
}); 