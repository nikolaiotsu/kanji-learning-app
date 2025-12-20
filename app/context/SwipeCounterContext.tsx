import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '../utils/logger';

interface SwipeCounterData {
  rightSwipeCount: number;
  leftSwipeCount: number;
  date: string; // Store as YYYY-MM-DD format for daily reset
}

interface SwipeCounterContextType {
  rightSwipeCount: number;
  leftSwipeCount: number;
  incrementRightSwipe: () => Promise<void>;
  incrementLeftSwipe: () => Promise<void>;
  resetSwipeCounts: () => Promise<void>;
}

const SwipeCounterContext = createContext<SwipeCounterContextType | undefined>(undefined);

// Storage key for swipe counter
const SWIPE_COUNTER_STORAGE_KEY = 'swipe_counter_daily';

// Helper function to get current date in YYYY-MM-DD format
const getCurrentDate = (): string => {
  const now = new Date();
  return now.toISOString().split('T')[0];
};

export const SwipeCounterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rightSwipeCount, setRightSwipeCount] = useState<number>(0);
  const [leftSwipeCount, setLeftSwipeCount] = useState<number>(0);

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
          } else {
            // Reset counter if it's a new day
            setRightSwipeCount(0);
            setLeftSwipeCount(0);
            await AsyncStorage.removeItem(SWIPE_COUNTER_STORAGE_KEY);
          }
        }
      } catch (error) {
        logger.error('Error loading swipe counter from storage:', error);
      }
    };

    loadSwipeCounter();
  }, []);

  // Function to increment right swipe count
  const incrementRightSwipe = async () => {
    try {
      const currentDate = getCurrentDate();
      const newRightCount = rightSwipeCount + 1;
      
      const counterData: SwipeCounterData = {
        rightSwipeCount: newRightCount,
        leftSwipeCount: leftSwipeCount,
        date: currentDate
      };
      
      await AsyncStorage.setItem(SWIPE_COUNTER_STORAGE_KEY, JSON.stringify(counterData));
      setRightSwipeCount(newRightCount);
    } catch (error) {
      logger.error('Error incrementing right swipe counter:', error);
    }
  };

  // Function to increment left swipe count
  const incrementLeftSwipe = async () => {
    try {
      const currentDate = getCurrentDate();
      const newLeftCount = leftSwipeCount + 1;
      
      const counterData: SwipeCounterData = {
        rightSwipeCount: rightSwipeCount,
        leftSwipeCount: newLeftCount,
        date: currentDate
      };
      
      await AsyncStorage.setItem(SWIPE_COUNTER_STORAGE_KEY, JSON.stringify(counterData));
      setLeftSwipeCount(newLeftCount);
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
    } catch (error) {
      logger.error('Error resetting swipe counters:', error);
    }
  };

  return (
    <SwipeCounterContext.Provider
      value={{
        rightSwipeCount,
        leftSwipeCount,
        incrementRightSwipe,
        incrementLeftSwipe,
        resetSwipeCounts,
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

