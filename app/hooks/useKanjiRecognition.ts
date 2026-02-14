import { useState } from 'react';
import { detectJapaneseText, VisionOCRError, VISION_OCR_ERROR_CODES } from '../services/visionApi';
import { Region, VisionApiResponse } from '../../types';

import { logger } from '../utils/logger';

function getUserMessage(err: unknown): string {
  if (err instanceof VisionOCRError) {
    if (err.code === VISION_OCR_ERROR_CODES.TIMEOUT || err.code === VISION_OCR_ERROR_CODES.NETWORK) {
      return 'Text recognition took too long or connection failed. Check your internet and try again.';
    }
  }
  return 'Failed to recognize text. Please try again.';
}

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

      const detectedText = await detectJapaneseText(imageUri, region, isVisibleRegion);
      setDetectedRegions(detectedText);

      if (!detectedText || detectedText.length === 0) {
        return '';
      }

      const japaneseText = detectedText.map(item => item.text).join('\n');
      return japaneseText;
    } catch (err) {
      logger.error('Error detecting text:', err);
      setDetectedRegions([]);
      setError(getUserMessage(err));
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