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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Deck } from '../../types/Deck';
import { getDecks, createDeck } from '../../services/supabaseStorage';

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
      console.error('Error loading decks:', error);
      Alert.alert('Error', 'Failed to load decks. Please try again.');
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
      Alert.alert('Error', 'Please enter a name for the new deck.');
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
      console.error('Error creating deck:', error);
      Alert.alert('Error', 'Failed to create new deck. Please try again.');
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
      <Ionicons name="albums-outline" size={24} color="#007AFF" style={styles.deckIcon} />
      <View style={styles.deckInfo}>
        <Text style={styles.deckName}>{item.name}</Text>
        <Text style={styles.deckDate}>
          Created: {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color="#CCCCCC" />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Deck</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#007AFF" />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading decks...</Text>
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
                    <Text style={styles.emptyText}>No decks found. Create your first deck!</Text>
                  </View>
                }
              />

              {showNewDeckInput ? (
                <View style={styles.newDeckContainer}>
                  <TextInput
                    style={styles.newDeckInput}
                    placeholder="Enter deck name"
                    value={newDeckName}
                    onChangeText={setNewDeckName}
                    autoFocus
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
                        <ActivityIndicator size="small" color="#FFFFFF" />
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
                  <Ionicons name="add-circle-outline" size={24} color="#FFFFFF" />
                  <Text style={styles.addDeckButtonText}>Create New Deck</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    height: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666666',
  },
  deckList: {
    flexGrow: 1,
  },
  deckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  deckIcon: {
    marginRight: 12,
  },
  deckInfo: {
    flex: 1,
  },
  deckName: {
    fontSize: 16,
    fontWeight: '500',
  },
  deckDate: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
  },
  addDeckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    padding: 16,
    margin: 16,
    borderRadius: 8,
  },
  addDeckButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  newDeckContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  newDeckInput: {
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  newDeckButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  newDeckButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#EEEEEE',
  },
  cancelButtonText: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '500',
  },
  createButton: {
    backgroundColor: '#007AFF',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
  },
}); 