import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
// @ts-ignore
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Deck } from '../../types/Deck';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../services/supabaseClient';

import { logger } from '../../utils/logger';
interface DeckReorderModalProps {
  visible: boolean;
  onClose: () => void;
  decks: Deck[];
  onReorderComplete: (newDecks: Deck[]) => void;
}

interface ReorderDeckItemProps {
  item: Deck;
  index: number;
  drag: () => void;
  isActive: boolean;
}

const ReorderDeckItem: React.FC<ReorderDeckItemProps> = ({ item, drag, isActive }) => {
  return (
    <TouchableOpacity
      style={[
        styles.deckItem,
        isActive && styles.activeDeckItem,
      ]}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        drag();
      }}
      delayLongPress={150}
    >
      <Ionicons 
        name="reorder-three" 
        size={24} 
        color={COLORS.darkGray} 
        style={styles.dragHandle}
      />
      <View style={styles.deckInfo}>
        <Text style={styles.deckName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.deckDate}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default function DeckReorderModal({ 
  visible, 
  onClose, 
  decks, 
  onReorderComplete 
}: DeckReorderModalProps) {
  const { t } = useTranslation();
  const [reorderedDecks, setReorderedDecks] = useState<Deck[]>(decks);
  const [isLoading, setIsLoading] = useState(false);

  // Update local state when decks prop changes
  useEffect(() => {
    // Validate decks data before setting local state
    if (decks && Array.isArray(decks)) {
      const validDecks = decks.filter(deck => deck && deck.id && deck.name);
      if (validDecks.length === decks.length) {
        setReorderedDecks(decks);
      } else {
        logger.warn(`[DeckReorderModal] Invalid deck data received, filtering out corrupted entries`);
        logger.warn(`[DeckReorderModal] Original count: ${decks.length}, Valid count: ${validDecks.length}`);
        setReorderedDecks(validDecks);
      }
    } else {
      logger.warn(`[DeckReorderModal] Invalid decks prop received:`, decks);
      setReorderedDecks([]);
    }
  }, [decks]);

  const handleDragEnd = ({ data }: { data: Deck[] }) => {
    logger.log(`[DeckReorderModal] Drag ended, new order:`, data.map(d => d.name));
    
    // Validate that all decks have required fields to prevent corruption
    const validatedData = data.filter(deck => deck && deck.id && deck.name);
    
    if (validatedData.length !== data.length) {
      logger.warn(`[DeckReorderModal] Data validation failed - some decks missing required fields`);
      // Reset to original order if data is corrupted
      setReorderedDecks(decks);
      return;
    }
    
    setReorderedDecks(validatedData);
    // Provide subtle haptic feedback when drag ends
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = async () => {
    logger.log(`[DeckReorderModal] Saving new deck order:`, reorderedDecks.map(d => d.name));
    setIsLoading(true);
    try {
      // Final validation before saving to prevent corrupted data
      const validDecks = reorderedDecks.filter(deck => deck && deck.id && deck.name);
      
      if (validDecks.length !== reorderedDecks.length) {
        logger.error(`[DeckReorderModal] Data validation failed before save - corrupted deck data detected`);
        Alert.alert(t('common.error'), 'Data corruption detected. Please try again.');
        return;
      }

      // Update order in database using RPC function for safe batch update
      const updates = validDecks.map((deck, idx) => ({
        id: deck.id,
        order_index: idx
      }));

      logger.log(`[DeckReorderModal] Updating database with:`, updates);
      const { error } = await supabase
        .rpc('update_deck_order', {
          deck_updates: updates
        });

      if (error) {
        throw error;
      }

      logger.log(`[DeckReorderModal] Database update successful, calling onReorderComplete`);
      // Update parent component
      onReorderComplete(validDecks);
      onClose();
      
      // Success feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      logger.error('Error saving deck order:', error);
      
      // Provide more specific error message if it's a column missing issue
      let errorMessage = t('deck.reorder.failed');
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMsg = (error as { message: string }).message.toLowerCase();
        if (errorMsg.includes('order_index') && (errorMsg.includes('column') || errorMsg.includes('does not exist'))) {
          errorMessage = 'Database needs to be updated. Please contact support or check the migration instructions.';
        }
      }
      
      Alert.alert(t('common.error'), errorMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setReorderedDecks(decks); // Reset to original order
    onClose();
  };

  const renderItem = ({ item, index, drag, isActive }: RenderItemParams<Deck>) => (
    <ReorderDeckItem 
      item={item} 
      index={index} 
      drag={drag} 
      isActive={isActive} 
    />
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          
          <Text style={styles.title}>{t('deck.reorder.title')}</Text>
          
          <TouchableOpacity 
            onPress={handleSave} 
            style={[styles.headerButton, isLoading && styles.disabledButton]}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.saveText}>{t('common.save')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>
            {t('deck.reorder.instruction')}
          </Text>
        </View>

        <DraggableFlatList
          data={reorderedDecks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          onDragEnd={handleDragEnd}
          activationDistance={10}
          contentContainerStyle={styles.listContainer}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkSurface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    backgroundColor: COLORS.darkSurface,
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 60,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.darkGray,
  },
  saveText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  instructionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.mediumSurface,
  },
  instructionText: {
    fontSize: 14,
    color: COLORS.darkGray,
    textAlign: 'center',
  },
  listContainer: {
    paddingVertical: 8,
  },
  deckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: COLORS.darkSurface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  activeDeckItem: {
    backgroundColor: COLORS.mediumSurface,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dragHandle: {
    marginRight: 16,
    padding: 4,
  },
  deckInfo: {
    flex: 1,
  },
  deckName: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 4,
  },
  deckDate: {
    fontSize: 12,
    color: COLORS.darkGray,
  },
});