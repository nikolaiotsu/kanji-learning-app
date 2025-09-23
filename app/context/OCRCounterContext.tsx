import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubscription } from './SubscriptionContext';
import { logOCRScan } from '../services/apiUsageLogger';

interface OCRCounterData {
  count: number;
  timestamp: number;
}

interface OCRCounterContextType {
  ocrCount: number;
  maxOCRScans: number;
  canPerformOCR: boolean;
  remainingScans: number;
  incrementOCRCount: () => Promise<void>;
  resetOCRCount: () => Promise<void>;
}

const OCRCounterContext = createContext<OCRCounterContextType | undefined>(undefined);

// Storage key for OCR counter
const OCR_COUNTER_STORAGE_KEY = 'ocr_counter_24h';
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const OCRCounterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ocrCount, setOcrCount] = useState<number>(0);
  const { getMaxOCRScans } = useSubscription();

  // Get subscription-aware limits
  const maxOCRScans = getMaxOCRScans();
  const canPerformOCR = ocrCount < maxOCRScans;
  const remainingScans = Math.max(0, maxOCRScans - ocrCount);

  // Load OCR counter from AsyncStorage on mount
  useEffect(() => {
    const loadOCRCounter = async () => {
      try {
        const storedData = await AsyncStorage.getItem(OCR_COUNTER_STORAGE_KEY);
        if (storedData) {
          const data: OCRCounterData = JSON.parse(storedData);
          const now = Date.now();
          
          // Check if the stored data is within the last 24 hours
          if (now - data.timestamp < TWENTY_FOUR_HOURS) {
            setOcrCount(data.count);
          } else {
            // Reset counter if it's older than 24 hours
            setOcrCount(0);
            await AsyncStorage.removeItem(OCR_COUNTER_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error('Error loading OCR counter from storage:', error);
      }
    };

    loadOCRCounter();
  }, []);

  // Function to increment OCR count
  const incrementOCRCount = async () => {
    try {
      const now = Date.now();
      let newCount = 1;
      
      // Check existing data
      const storedData = await AsyncStorage.getItem(OCR_COUNTER_STORAGE_KEY);
      if (storedData) {
        const data: OCRCounterData = JSON.parse(storedData);
        
        // If the data is within 24 hours, increment the count
        if (now - data.timestamp < TWENTY_FOUR_HOURS) {
          newCount = data.count + 1;
        }
      }
      
      const counterData: OCRCounterData = {
        count: newCount,
        timestamp: now
      };
      
      await AsyncStorage.setItem(OCR_COUNTER_STORAGE_KEY, JSON.stringify(counterData));
      setOcrCount(newCount);

      // Log successful OCR scan
      await logOCRScan(true, {
        ocrCount: newCount,
        maxOCRScans,
        remainingScans: Math.max(0, maxOCRScans - newCount)
      });
    } catch (error) {
      console.error('Error incrementing OCR counter:', error);
      
      // Log failed OCR scan tracking
      await logOCRScan(false, {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Function to reset OCR count
  const resetOCRCount = async () => {
    try {
      await AsyncStorage.removeItem(OCR_COUNTER_STORAGE_KEY);
      setOcrCount(0);
    } catch (error) {
      console.error('Error resetting OCR counter:', error);
    }
  };

  return (
    <OCRCounterContext.Provider
      value={{
        ocrCount,
        maxOCRScans,
        canPerformOCR,
        remainingScans,
        incrementOCRCount,
        resetOCRCount,
      }}
    >
      {children}
    </OCRCounterContext.Provider>
  );
};

// Custom hook to use the OCR counter context
export const useOCRCounter = (): OCRCounterContextType => {
  const context = useContext(OCRCounterContext);
  if (!context) {
    throw new Error('useOCRCounter must be used within an OCRCounterProvider');
  }
  return context;
}; 