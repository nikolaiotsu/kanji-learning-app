import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '../utils/logger';
import { getLocalDateString } from '../utils/dateUtils';

interface SwipeCounterData {
  rightSwipeCount: number;
  leftSwipeCount: number;
  swipedRightCardIds: string[]; // Track unique card IDs swiped right today
  date: string; // Store as YYYY-MM-DD format for daily reset
}

interface SwipeCounterContextType {
  rightSwipeCount: number;
  leftSwipeCount: number;
  /** Streak: 1 if user has swiped right on 3+ cards in a review session today (once per day), else 0 */
  streakCount: number;
  /** Returns the new right swipe count after increment (or current count if card already swiped today). */
  incrementRightSwipe: (cardId: string) => Promise<number>;
  incrementLeftSwipe: () => Promise<void>;
  resetSwipeCounts: () => Promise<void>;
  deckTotalCards: number;
  currentDeckSwipedCount: number;
  setDeckCardIds: (cardIds: string[]) => void;
}

const SwipeCounterContext = createContext<SwipeCounterContextType | undefined>(undefined);

// Storage key for swipe counter
const SWIPE_COUNTER_STORAGE_KEY = 'swipe_counter_daily';

// Use local date so daily reset happens at user's midnight, not UTC
const getCurrentDate = (): string => getLocalDateString();

export const SwipeCounterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rightSwipeCount, setRightSwipeCount] = useState<number>(0);
  const [leftSwipeCount, setLeftSwipeCount] = useState<number>(0);
  const [swipedRightCardIds, setSwipedRightCardIds] = useState<string[]>([]);
  const [currentDeckCardIds, setCurrentDeckCardIds] = useState<string[]>([]);
  const [deckTotalCards, setDeckTotalCards] = useState<number>(0);
  const [currentDeckSwipedCount, setCurrentDeckSwipedCount] = useState<number>(0);

  // Load swipe counter from AsyncStorage on mount
  useEffect(() => {
    const loadSwipeCounter = async () => {
      try {
        const storedData = await AsyncStorage.getItem(SWIPE_COUNTER_STORAGE_KEY);
        if (storedData) {
          const data: SwipeCounterData = JSON.parse(storedData);
          const currentDate = getCurrentDate();
          
          // Check if the stored data is from today
          if (data.date === currentDate) {
            setRightSwipeCount(data.rightSwipeCount);
            setLeftSwipeCount(data.leftSwipeCount);
            setSwipedRightCardIds(data.swipedRightCardIds || []);
          } else {
            // Reset counter if it's a new day
            setRightSwipeCount(0);
            setLeftSwipeCount(0);
            setSwipedRightCardIds([]);
            await AsyncStorage.removeItem(SWIPE_COUNTER_STORAGE_KEY);
          }
        }
      } catch (error) {
        logger.error('Error loading swipe counter from storage:', error);
      }
    };

    loadSwipeCounter();
  }, []);

  // Function to increment right swipe count; returns new right count (for streak overlay when === 3).
  const incrementRightSwipe = (cardId: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      try {
        const currentDate = getCurrentDate();

        setSwipedRightCardIds((prevSwipedIds) => {
          if (prevSwipedIds.includes(cardId)) {
            logger.info('Card already swiped right today, skipping increment:', cardId);
            setRightSwipeCount((c) => {
              resolve(c);
              return c;
            });
            return prevSwipedIds;
          }

          const newSwipedIds = [...prevSwipedIds, cardId];

          setRightSwipeCount((prevCount) => {
            const newRightCount = prevCount + 1;

            const counterData: SwipeCounterData = {
              rightSwipeCount: newRightCount,
              leftSwipeCount: leftSwipeCount,
              swipedRightCardIds: newSwipedIds,
              date: currentDate
            };

            AsyncStorage.setItem(SWIPE_COUNTER_STORAGE_KEY, JSON.stringify(counterData)).catch((error) => {
              logger.error('Error saving right swipe counter to storage:', error);
            });

            resolve(newRightCount);
            return newRightCount;
          });

          return newSwipedIds;
        });
      } catch (error) {
        logger.error('Error incrementing right swipe counter:', error);
        reject(error);
      }
    });
  };

  // Function to increment left swipe count
  const incrementLeftSwipe = async () => {
    try {
      const currentDate = getCurrentDate();
      
      // Use functional setState to get the current value
      setLeftSwipeCount((prevCount) => {
        const newLeftCount = prevCount + 1;
        
        // Save to AsyncStorage using rightSwipeCount and swipedRightCardIds from closure
        const counterData: SwipeCounterData = {
          rightSwipeCount: rightSwipeCount,
          leftSwipeCount: newLeftCount,
          swipedRightCardIds: swipedRightCardIds,
          date: currentDate
        };
        
        AsyncStorage.setItem(SWIPE_COUNTER_STORAGE_KEY, JSON.stringify(counterData)).catch((error) => {
          logger.error('Error saving left swipe counter to storage:', error);
        });
        
        return newLeftCount;
      });
    } catch (error) {
      logger.error('Error incrementing left swipe counter:', error);
    }
  };

  // Function to reset swipe counts
  const resetSwipeCounts = async () => {
    try {
      await AsyncStorage.removeItem(SWIPE_COUNTER_STORAGE_KEY);
      setRightSwipeCount(0);
      setLeftSwipeCount(0);
      setSwipedRightCardIds([]);
      setCurrentDeckSwipedCount(0);
    } catch (error) {
      logger.error('Error resetting swipe counters:', error);
    }
  };

  // Function to set current deck card IDs and calculate stats
  const setDeckCardIds = useCallback((cardIds: string[]) => {
    // Handle edge case: null/undefined safety
    const safeCardIds = cardIds || [];
    setCurrentDeckCardIds(safeCardIds);
    setDeckTotalCards(safeCardIds.length);
  }, []);

  // Recalculate current deck swiped count when swipedRightCardIds or currentDeckCardIds changes
  useEffect(() => {
    if (currentDeckCardIds.length === 0) {
      setCurrentDeckSwipedCount(0);
      return;
    }

    // O(1) lookup performance with Set instead of O(n*m) with includes()
    const deckCardIdsSet = new Set(currentDeckCardIds);
    const deckSwipedCount = swipedRightCardIds.filter(swipedId => 
      deckCardIdsSet.has(swipedId)
    ).length;
    
    setCurrentDeckSwipedCount(deckSwipedCount);
    
    logger.log('[SwipeCounter] Deck stats updated:', {
      totalCards: currentDeckCardIds.length,
      swipedInDeck: deckSwipedCount,
      totalSwipedToday: swipedRightCardIds.length
    });
  }, [swipedRightCardIds, currentDeckCardIds]);

  // Streak: 1 only the first time user reaches 3 right swipes in a review session that day (24h); else 0
  const streakCount = rightSwipeCount >= 3 ? 1 : 0;

  return (
    <SwipeCounterContext.Provider
      value={{
        rightSwipeCount,
        leftSwipeCount,
        streakCount,
        incrementRightSwipe,
        incrementLeftSwipe,
        resetSwipeCounts,
        deckTotalCards,
        currentDeckSwipedCount,
        setDeckCardIds,
      }}
    >
      {children}
    </SwipeCounterContext.Provider>
  );
};

// Custom hook to use the swipe counter context
export const useSwipeCounter = (): SwipeCounterContextType => {
  const context = useContext(SwipeCounterContext);
  if (!context) {
    throw new Error('useSwipeCounter must be used within a SwipeCounterProvider');
  }
  return context;
};

