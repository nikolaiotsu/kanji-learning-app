import { useState } from 'react';
import { detectJapaneseText } from '../services/visionApi';
import { Region, VisionApiResponse } from '../../types';

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
      
      console.log('Sending image for OCR processing with region:', region);
      
      const detectedText = await detectJapaneseText(imageUri, region, isVisibleRegion);
      setDetectedRegions(detectedText);
      
      // If no text was detected, return empty string
      if (!detectedText || detectedText.length === 0) {
        console.log('No Japanese text detected in the region');
        return '';
      }
      
      // Log each detected text item for debugging
      detectedText.forEach((item, index) => {
        console.log(`Detected text ${index + 1}: "${item.text}" at (${item.boundingBox.x},${item.boundingBox.y})`);
      });
      
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