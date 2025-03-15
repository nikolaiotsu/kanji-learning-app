import { useState } from 'react';
import { detectJapaneseText } from '../services/visionApi';
import { Region, VisionApiResponse } from '../../types';

export function useKanjiRecognition() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedRegions, setDetectedRegions] = useState<VisionApiResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recognizeKanji = async (imageUri: string, region: Region): Promise<string> => {
    try {
      setIsProcessing(true);
      setError(null);
      
      const detectedText = await detectJapaneseText(imageUri, region);
      setDetectedRegions(detectedText);
      
      // Get all detected Japanese text
      const japaneseText = detectedText.map(item => item.text).join('\n');
      return japaneseText;
    } catch (err) {
      console.error('Error detecting text:', err);
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