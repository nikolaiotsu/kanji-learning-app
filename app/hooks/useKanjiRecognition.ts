import { useState } from 'react';
import { detectJapaneseText } from '../services/visionApi';
import { Region, VisionApiResponse } from '../../types';

import { logger } from '../utils/logger';
export function useKanjiRecognition() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedRegions, setDetectedRegions] = useState<VisionApiResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recognizeKanji = async (
    imageUri: string, 
    region: Region, 
    isVisibleRegion: boolean = false
  ): Promise<string> => {
    try {
      setIsProcessing(true);
      setError(null);
      
      // Processing OCR request
      
      const detectedText = await detectJapaneseText(imageUri, region, isVisibleRegion);
      setDetectedRegions(detectedText);
      
      // If no text was detected, return empty string
      if (!detectedText || detectedText.length === 0) {
        return '';
      }
      
      // Get all detected Japanese text
      const japaneseText = detectedText.map(item => item.text).join('\n');
      return japaneseText;
    } catch (err) {
      logger.error('Error detecting text:', err);
      setDetectedRegions([]);
      setError('Failed to recognize text. Please try again.');
      return '';
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    recognizeKanji,
    isProcessing,
    detectedRegions,
    error,
  };
}

// Add this default export to satisfy Expo Router
const KanjiRecognitionHook = { useKanjiRecognition };
export default KanjiRecognitionHook; 