import Constants from 'expo-constants';
import { EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY } from '@env';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import MemoryManager from './memoryManager';
import { apiLogger, logVisionAPI, APIUsageMetrics } from './apiUsageLogger';

import { logger } from '../utils/logger';
interface VisionApiResponse {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TransformData {
  scale: number;
  translateX: number;
  translateY: number;
  imageWidth: number;
  imageHeight: number;
  scaledWidth: number;
  scaledHeight: number;
}

// Function to convert visual coordinates to original image coordinates
export function convertToOriginalImageCoordinates(
  region: Region,
  transformData: TransformData
): Region {
  // Extract all the transform data
  const { scale, translateX, translateY, imageWidth, imageHeight, scaledWidth, scaledHeight } = transformData;
  
  // Removed debug logs for production build

  // The region passed to this function is ALREADY in un-transformed coordinates 
  // (we removed the scale and translation effects in the component)
  // Now we just need to convert from container size to original image size
  
  // Calculate the ratio between the original image and the container
  const widthRatio = imageWidth / scaledWidth;
  const heightRatio = imageHeight / scaledHeight;
  // Width/height ratios calculated for coordinate conversion
  
  // Simply apply the ratio to convert to original image coordinates
  // We clamp the values to ensure they stay within image bounds
  const x = Math.max(0, Math.round(region.x * widthRatio));
  const y = Math.max(0, Math.round(region.y * heightRatio));
  const width = Math.min(
    Math.round(region.width * widthRatio),
    imageWidth - x
  );
  const height = Math.min(
    Math.round(region.height * heightRatio),
    imageHeight - y
  );
  
  const resultRegion = { x, y, width, height };
  return resultRegion;
}

// Function to capture the current visual state of the image including any zoom/transformations
export async function captureVisibleRegion(imageRef: any, region: Region): Promise<string> {
  try {
    // Capture the current visual state of the image view
    const uri = await captureRef(imageRef, {
      format: 'jpg',
      quality: 0.9,
    });

    // If running on iOS, we need to convert the file:// URI to a base64 string immediately
    if (Platform.OS === 'ios') {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/jpeg;base64,${base64}`;
    }

    return uri;
  } catch (error) {
    logger.error('Error capturing image region:', error);
    throw error;
  }
}

// New helper function to crop image to exact region - Memory-aware version
export async function cropImageToRegion(imageUri: string, region: Region): Promise<string> {
  const memoryManager = MemoryManager.getInstance();
  
  try {
    // Only proceed with cropping if we have a valid region
    if (!region || region.width <= 0 || region.height <= 0) {
      logger.log('Invalid region for cropping:', region);
      return imageUri;
    }
    
    // Simple cleanup check before cropping
    if (await memoryManager.shouldCleanup()) {
      logger.log('[cropImageToRegion] Performing cleanup before cropping');
      await memoryManager.cleanupPreviousImages(imageUri);
    }
    
    // First, get the dimensions of the source image to validate crop boundaries
    let sourceImage;
    try {
      sourceImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [],
        { format: ImageManipulator.SaveFormat.JPEG }
      );
      logger.log('[DEBUG] Source image dimensions:', sourceImage.width, 'x', sourceImage.height);
    } catch (error) {
      logger.error('Error getting source image dimensions:', error);
      return imageUri;
    }
    
    // Log the original crop region request
    logger.log('[DEBUG] Original crop region request:', {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height
    });
    
    // Add a margin around the region to ensure we capture all text
    // Calculate margin based on region size (larger for bigger regions)
    const isLargeRegion = region.width * region.height > 100000;
    // Use a larger margin for wider selections to ensure text on the right side is captured
    const isWideRegion = region.width > region.height * 2; // If width is more than twice the height
    
    // Adjust margins based on region characteristics
    const marginPercentage = isLargeRegion ? 0.05 : 0.03; // 5% margin for large regions, 3% for smaller ones
    const horizontalMarginPercentage = isWideRegion ? 0.08 : marginPercentage; // Larger horizontal margin for wide regions
    
    // Calculate margin in pixels
    const marginX = Math.round(region.width * horizontalMarginPercentage);
    const marginY = Math.round(region.height * marginPercentage);
    
    logger.log(`[DEBUG] Adding margin to crop region: ${marginX}px horizontal, ${marginY}px vertical${isWideRegion ? ' (wide region detected)' : ''}`);
    
    // Apply margin to the region (expanding it)
    const expandedRegion = {
      x: Math.max(0, region.x - marginX),
      y: Math.max(0, region.y - marginY),
      width: region.width + (marginX * 2),
      height: region.height + (marginY * 2)
    };
    
    logger.log('[DEBUG] Expanded crop region with margins:', expandedRegion);
    
    // Special handling for very wide regions - ensure they're fully captured
    if (isWideRegion) {
      logger.log('[DEBUG] Wide region handling: ensuring full width capture');
      // Make sure we don't cut off the right side of the region
      const rightEdge = expandedRegion.x + expandedRegion.width;
      if (rightEdge > sourceImage.width) {
        logger.log('[DEBUG] Right edge adjustment needed:', 
                   { rightEdge, imageWidth: sourceImage.width, overflow: rightEdge - sourceImage.width });
      }
    }
    
    // Validate and adjust the crop region to fit within the image boundaries
    const originX = Math.max(0, Math.min(Math.round(expandedRegion.x), sourceImage.width - 1));
    const originY = Math.max(0, Math.min(Math.round(expandedRegion.y), sourceImage.height - 1));
    
    // Calculate maximum possible width and height based on the origin point
    const maxWidth = sourceImage.width - originX;
    const maxHeight = sourceImage.height - originY;
    
    // Ensure width and height are within bounds
    const width = Math.max(1, Math.min(Math.round(expandedRegion.width), maxWidth));
    const height = Math.max(1, Math.min(Math.round(expandedRegion.height), maxHeight));
    
    const safeRegion = {
      originX,
      originY,
      width,
      height
    };
    
    logger.log('[DEBUG] Safe crop region:', safeRegion);
    logger.log('[DEBUG] Crop region as percentage of original image:', {
      x: (originX / sourceImage.width * 100).toFixed(1) + '%',
      y: (originY / sourceImage.height * 100).toFixed(1) + '%',
      width: (width / sourceImage.width * 100).toFixed(1) + '%',
      height: (height / sourceImage.height * 100).toFixed(1) + '%'
    });
    
    // If the adjusted crop region is too small, return the original image
    if (safeRegion.width < 1 || safeRegion.height < 1) {
      logger.log('[WARNING] Crop region too small after adjustment, returning original image');
      return imageUri;
    }
    
    // Get standard compression settings
    const standardConfig = memoryManager.getStandardImageConfig();
    
    logger.log('[DEBUG] Using standard compression for crop:', standardConfig.compress);
    
    // Use ImageManipulator to crop the image with standard settings
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        {
          crop: safeRegion
        },
      ],
      { 
        format: ImageManipulator.SaveFormat.JPEG, 
        compress: standardConfig.compress // Use standard compression
      }
    );
    
    // DEBUG: Log cropped image details
    logger.log('[DEBUG] Cropped image URI:', result.uri);
    logger.log('[DEBUG] Cropped image dimensions:', result.width, 'x', result.height, 
               `(${(result.width / sourceImage.width * 100).toFixed(1)}% x ${(result.height / sourceImage.height * 100).toFixed(1)}% of original)`);
    
    // Track the processed image
    memoryManager.trackProcessedImage(result.uri);
    
    return result.uri;
  } catch (error) {
    logger.error('Error cropping image:', error);
    
    // Attempt recovery by forcing cleanup
    await memoryManager.forceCleanup();
    
    // Fall back to original image if cropping fails
    return imageUri;
  }
}

// New function that only crops the image without text detection
export async function resizeImageToRegion(imageUri: string, region: Region): Promise<string> {
  try {
    logger.log('[resizeImageToRegion] Starting with region:', region);
    
    // Only proceed with cropping if we have a valid region
    if (!region || region.width <= 0 || region.height <= 0) {
      logger.log('[resizeImageToRegion] Invalid region for cropping:', region);
      return imageUri;
    }
    
    // First, get the dimensions of the source image to validate crop boundaries
    let sourceImage;
    try {
      sourceImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [],
        { format: ImageManipulator.SaveFormat.JPEG }
      );
      logger.log('[DEBUG] Source image dimensions:', sourceImage.width, 'x', sourceImage.height);
    } catch (error) {
      logger.error('[resizeImageToRegion] Error getting source image dimensions:', error);
      return imageUri;
    }
    
    // Log the original crop region request
    logger.log('[DEBUG] Original crop region request:', {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height
    });
    
    // Check if the region is already pre-scaled for the original image
    // We can detect this by seeing if the coordinates are beyond image dimensions by a large factor
    let adjustedRegion = { ...region };
    const isOverscaled = region.width > sourceImage.width * 1.5 || region.height > sourceImage.height * 1.5;
    
    if (isOverscaled) {
      // The region appears to be already scaled for the original image dimensions
      // Let's scale it down to match the actual image dimensions
      logger.log('[resizeImageToRegion] Detected over-scaled coordinates, adjusting...');
      const widthRatio = sourceImage.width / region.width;
      const heightRatio = sourceImage.height / region.height; 
      
      // Use the minimum ratio to ensure everything fits
      const minRatio = Math.min(widthRatio, heightRatio) * 0.8; // Use 80% to ensure we get a bit of margin
      
      adjustedRegion = {
        x: Math.round(region.x * minRatio),
        y: Math.round(region.y * minRatio),
        width: Math.round(region.width * minRatio),
        height: Math.round(region.height * minRatio)
      };
      
      logger.log('[resizeImageToRegion] Adjusted to match image dimensions:', adjustedRegion);
    }
    
    // Validate and adjust the crop region to fit within the image boundaries
    const originX = Math.max(0, Math.min(Math.round(adjustedRegion.x), sourceImage.width - 1));
    const originY = Math.max(0, Math.min(Math.round(adjustedRegion.y), sourceImage.height - 1));
    
    // Calculate maximum possible width and height based on the origin point
    const maxWidth = sourceImage.width - originX;
    const maxHeight = sourceImage.height - originY;
    
    // Ensure width and height are within bounds
    const width = Math.max(1, Math.min(Math.round(adjustedRegion.width), maxWidth));
    const height = Math.max(1, Math.min(Math.round(adjustedRegion.height), maxHeight));
    
    const safeRegion = {
      originX,
      originY,
      width,
      height
    };
    
    logger.log('[DEBUG] Safe crop region:', safeRegion);
    
    // If the adjusted crop region is too small, return the original image
    if (safeRegion.width < 1 || safeRegion.height < 1) {
      logger.log('[WARNING] Crop region too small after adjustment, returning original image');
      return imageUri;
    }
    
    logger.log('[resizeImageToRegion] Attempting to manipulate image with crop:', safeRegion);
    
    // Use ImageManipulator to crop the image with the validated region
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        {
          crop: safeRegion
        },
      ],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
    );
    
    // DEBUG: Log cropped image details
    logger.log('[DEBUG] Cropped image URI:', result.uri);
    logger.log('[DEBUG] Cropped image dimensions:', result.width, 'x', result.height);
    logger.log('[resizeImageToRegion] Successfully cropped image');
    
    return result.uri;
  } catch (error) {
    logger.error('[resizeImageToRegion] Error cropping image:', error);
    // Fall back to original image if cropping fails
    return imageUri;
  }
}

export async function detectJapaneseText(
  imageUri: string,
  region: Region,
  isVisibleRegion: boolean = false
): Promise<VisionApiResponse[]> {
  // Start logging metrics
  const metrics: APIUsageMetrics = apiLogger.startAPICall('https://vision.googleapis.com/v1/images:annotate', {
    regionSize: region.width * region.height,
    isVisibleRegion,
    imageUri: imageUri.substring(0, 50) // Log first 50 chars for debugging
  });

  // Use the imported environment variable
  const API_KEY = EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
  
  // Debug log - remove in production
  logger.log('API Key available:', !!API_KEY);
  
  if (!API_KEY) {
    throw new Error('Google Cloud Vision API key not found');
  }

  const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

  // SIMPLIFICATION: Pre-crop the image to the region if a region is specified
  // This ensures we only send the exact area of interest to the API
  // Implement the actual cropping logic
  let base64Image: string | null = null;

  try {
    base64Image = await getBase64ForImage(imageUri);
  } catch (error) {
    logger.error('Error converting image to base64:', error);
    throw new Error('Failed to prepare image for OCR');
  }

  if (!base64Image) {
    throw new Error('Failed to convert image to base64');
  }

  // Determine if the region is complex (large area, likely contains lots of text)
  // Calculate aspect ratio to detect wide regions specifically
  const aspectRatio = region.width / region.height;
  const isWideRegion = aspectRatio > 3; // If width is more than 3x the height
  const isLargeRegion = region.width * region.height > 100000;
  
  // Combine criteria - complex if either wide or large
  const isComplexRegion = isWideRegion || isLargeRegion;
  
  logger.log(`Region complexity assessment: ${isComplexRegion ? 'Complex' : 'Standard'} region (${region.width}x${region.height}, aspect ratio: ${aspectRatio.toFixed(1)}${isWideRegion ? ', wide region' : ''})`);

  // Create request body with parameters tuned for region complexity
  const requestBody = {
    requests: [
      {
        image: {
          content: (base64Image as string).split(',')[1],
        },
        features: [
          {
            type: 'TEXT_DETECTION',
            // For complex regions, we can adjust model parameters
            model: isComplexRegion ? 'builtin/latest' : 'builtin/stable',
          },
          {
            type: 'DOCUMENT_TEXT_DETECTION',
            model: isComplexRegion ? 'builtin/latest' : 'builtin/stable',
          }
        ],
        imageContext: {
          languageHints: [
            'ja',
            'ja-t-i0-handwrit',
            'ja-Hira',
            'ja-Kana',
            'en',
            'zh',
            'zh-TW',
            'ko',
            'es',
            'fr',
            'de',
            'pt',
            'ru',
            'ar',
            'hi',
            'it'
          ],
          textDetectionParams: {
            enableTextDetectionConfidenceScore: true,
            // For wide regions, enhance parameters to ensure text on edges is captured
            advancedOcrOptions: isWideRegion ? 
              [
                "enable_image_quality_scores",
                "enable_super_resolution",
                "enable_dewarping",
                "enable_dense_text_detection"
              ] : 
              [
                "enable_image_quality_scores",
                "enable_super_resolution"
              ]
          }
        }
      }
    ]
  };

  logger.log('Setting API request parameters for', isWideRegion ? 'wide region' : (isComplexRegion ? 'complex region' : 'standard region'));

  // Set longer timeout for complex regions
  const timeoutDuration = isComplexRegion ? 90000 : 30000; // 90 seconds for complex, 30 for standard
  logger.log('Setting API request timeout to', isComplexRegion ? '90' : '30', 'seconds');

  // Create AbortController for fetch timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Google Cloud Vision API returned status ${response.status}`);
    }

    const data = await response.json();
    
    // Process API response
    
    // For complex regions, check if we have document text results (from DOCUMENT_TEXT_DETECTION)
    const textDetectionResults = data.responses?.[0]?.textAnnotations?.length 
      ? data.responses[0].textAnnotations[0].description 
      : null;
    
    const documentTextResults = data.responses?.[0]?.fullTextAnnotation?.text || null;
    
    // For wide regions, preferentially use document text results if available
    let finalText;
    if (isWideRegion && documentTextResults) {
      logger.log('Using document text detection result for wide region');
      finalText = documentTextResults;
    } else if (textDetectionResults && documentTextResults) {
      // For regular regions, combine results, preferring the longer one
      logger.log('Using combined OCR result');
      finalText = textDetectionResults.length > documentTextResults.length 
        ? textDetectionResults 
        : documentTextResults;
    } else {
      // Fall back to whichever result is available
      finalText = textDetectionResults || documentTextResults || '';
    }
    
    logger.log('Final extracted text:', finalText);
    
    // Analyze the results to extract Japanese text and create responses
    const visionApiResponse: VisionApiResponse[] = [];
    
    if (finalText) {
      visionApiResponse.push({
        text: finalText,
        boundingBox: {
          x: 0,
          y: 0,
          width: region.width,
          height: region.height
        },
        confidence: 0.9 // Default confidence value
      });
    }
    
    // Log successful API call
    await logVisionAPI(metrics, true, visionApiResponse, undefined, {
      regionSize: region.width * region.height,
      isComplexRegion,
      isWideRegion,
      extractedTextLength: finalText?.length || 0,
      responseCount: visionApiResponse.length
    });
    
    return visionApiResponse;
  } catch (error: any) {
    // Log failed API call
    const apiError = error instanceof Error ? error : new Error(String(error));
    await logVisionAPI(metrics, false, undefined, apiError, {
      regionSize: region.width * region.height,
      isComplexRegion,
      isWideRegion,
      errorType: error.name || 'unknown',
      isTimeout: error.name === 'AbortError'
    });

    if (error.name === 'AbortError') {
      logger.error('Vision API request timed out after', isComplexRegion ? '90' : '30', 'seconds');
      throw new Error('Text recognition timed out. The selected region may be too complex.');
    }
    logger.error('Error calling Vision API:', error);
    throw error;
  }
}

export async function analyzeImage(imageUri: string, region?: Region) {
  const apiKey = EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
  logger.log('API Key available:', !!apiKey);

  // If region is specified, crop the image before analysis
  let processedImageUri = imageUri;
  if (region && region.width > 0 && region.height > 0) {
    processedImageUri = await cropImageToRegion(imageUri, region);
    logger.log('Image cropped to region before analysis');
  }

  const response = await fetch(processedImageUri);
  const blob = await response.blob();
  const base64Image = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  try {
    const result = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            image: {
              content: (base64Image as string).split(',')[1],
            },
            features: [{
              type: 'TEXT_DETECTION',
              // You might want to adjust model settings here if needed
            }],
            imageContext: {
              languageHints: ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt', 'ru', 'ar', 'hi'],
            },
          }],
        }),
      }
    );

    const data = await result.json();
    logger.log('API Response:', data);

    // Since we've pre-cropped the image, we can return all text annotations
    return data.responses[0];
  } catch (error) {
    logger.error('Error calling Vision API:', error);
    throw error;
  }
}

// Add the getBase64ForImage function
export async function getBase64ForImage(imageUri: string): Promise<string | null> {
  try {
    if (imageUri.startsWith('data:image')) {
      // Already a base64 image
      return imageUri;
    } else {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch (error) {
    logger.error('Error converting image to base64:', error);
    return null;
  }
}

// Add this default export to satisfy Expo Router
const VisionApi = { detectJapaneseText, captureVisibleRegion, cropImageToRegion };
export default VisionApi; 