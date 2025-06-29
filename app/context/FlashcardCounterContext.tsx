import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubscription } from './SubscriptionContext';

interface FlashcardCounterData {
  count: number;
  timestamp: number;
}

interface FlashcardCounterContextType {
  flashcardCount: number;
  maxFlashcards: number;
  canCreateFlashcard: boolean;
  remainingFlashcards: number;
  incrementFlashcardCount: () => Promise<void>;
  resetFlashcardCount: () => Promise<void>;
}

const FlashcardCounterContext = createContext<FlashcardCounterContextType | undefined>(undefined);

// Storage key for flashcard counter
const FLASHCARD_COUNTER_STORAGE_KEY = 'flashcard_counter_24h';
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const FlashcardCounterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flashcardCount, setFlashcardCount] = useState<number>(0);
  const { getMaxFlashcards } = useSubscription();

  // Get subscription-aware limits
  const maxFlashcards = getMaxFlashcards();
  const canCreateFlashcard = flashcardCount < maxFlashcards;
  const remainingFlashcards = Math.max(0, maxFlashcards - flashcardCount);

  // Load flashcard counter from AsyncStorage on mount
  useEffect(() => {
    const loadFlashcardCounter = async () => {
      try {
        const storedData = await AsyncStorage.getItem(FLASHCARD_COUNTER_STORAGE_KEY);
        if (storedData) {
          const data: FlashcardCounterData = JSON.parse(storedData);
          const now = Date.now();
          
          // Check if the stored data is within the last 24 hours
          if (now - data.timestamp < TWENTY_FOUR_HOURS) {
            setFlashcardCount(data.count);
          } else {
            // Reset counter if it's older than 24 hours
            setFlashcardCount(0);
            await AsyncStorage.removeItem(FLASHCARD_COUNTER_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error('Error loading flashcard counter from storage:', error);
      }
    };

    loadFlashcardCounter();
  }, []);

  // Function to increment flashcard count
  const incrementFlashcardCount = async () => {
    try {
      const now = Date.now();
      let newCount = 1;
      
      // Check existing data
      const storedData = await AsyncStorage.getItem(FLASHCARD_COUNTER_STORAGE_KEY);
      if (storedData) {
        const data: FlashcardCounterData = JSON.parse(storedData);
        
        // If the data is within 24 hours, increment the count
        if (now - data.timestamp < TWENTY_FOUR_HOURS) {
          newCount = data.count + 1;
        }
      }
      
      const counterData: FlashcardCounterData = {
        count: newCount,
        timestamp: now
      };
      
      await AsyncStorage.setItem(FLASHCARD_COUNTER_STORAGE_KEY, JSON.stringify(counterData));
      setFlashcardCount(newCount);
    } catch (error) {
      console.error('Error incrementing flashcard counter:', error);
    }
  };

  // Function to reset flashcard count
  const resetFlashcardCount = async () => {
    try {
      await AsyncStorage.removeItem(FLASHCARD_COUNTER_STORAGE_KEY);
      setFlashcardCount(0);
    } catch (error) {
      console.error('Error resetting flashcard counter:', error);
    }
  };

  return (
    <FlashcardCounterContext.Provider
      value={{
        flashcardCount,
        maxFlashcards,
        canCreateFlashcard,
        remainingFlashcards,
        incrementFlashcardCount,
        resetFlashcardCount,
      }}
    >
      {children}
    </FlashcardCounterContext.Provider>
  );
};

// Custom hook to use the flashcard counter context
export const useFlashcardCounter = (): FlashcardCounterContextType => {
  const context = useContext(FlashcardCounterContext);
  if (!context) {
    throw new Error('useFlashcardCounter must be used within a FlashcardCounterProvider');
  }
  return context;
}; 