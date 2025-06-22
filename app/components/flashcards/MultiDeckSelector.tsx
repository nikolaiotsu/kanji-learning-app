import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Deck } from '../../types/Deck';
import { getDecks } from '../../services/supabaseStorage';
import { COLORS } from '../../constants/colors';

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

  // Load decks when the component mounts or becomes visible
  useEffect(() => {
    if (visible) {
      loadDecks();
      setSelectedDeckIds(initialSelectedDeckIds);
    }
  }, [visible, initialSelectedDeckIds]);

  // Function to load decks from storage
  const loadDecks = async () => {
    setIsLoading(true);
    try {
      const savedDecks = await getDecks();
      setDecks(savedDecks);
      
      // If no decks are selected initially and we have decks, select all by default
      if (initialSelectedDeckIds.length === 0 && savedDecks.length > 0) {
        setSelectedDeckIds(savedDecks.map(deck => deck.id));
      }
    } catch (error) {
      console.error('Error loading collections:', error);
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

  // Function to handle saving the deck selection
  const handleSaveSelection = () => {
    onSelectDecks(selectedDeckIds);
    onClose();
  };

  // Function to select all decks
  const selectAllDecks = () => {
    setSelectedDeckIds(decks.map(deck => deck.id));
  };

  // Render a deck item with checkbox
  const renderDeckItem = ({ item }: { item: Deck }) => {
    const isSelected = selectedDeckIds.includes(item.id);
    
    return (
      <TouchableOpacity
        style={styles.deckItem}
        onPress={() => toggleDeckSelection(item.id)}
      >
        <View style={styles.checkboxContainer}>
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={16} color={COLORS.text} />}
          </View>
        </View>
        
        <View style={styles.deckInfo}>
          <Text style={styles.deckName}>{item.name}</Text>
          <Text style={styles.deckDate}>
            {t('deck.created', { date: new Date(item.createdAt).toLocaleDateString() })}
          </Text>
        </View>
      </TouchableOpacity>
    );
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
              <Text style={styles.title}>{t('review.selectCollectionsToReview')}</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
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
    marginBottom: 8,
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
  deckDate: {
    fontSize: 12,
    color: COLORS.lightGray,
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
}); 