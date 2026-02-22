import Constants from 'expo-constants';
import { EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY } from '@env';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import MemoryManager from './memoryManager';
import { apiLogger, logVisionAPI, APIUsageMetrics } from './apiUsageLogger';
import { getImageInfo } from './ProcessImage';

import { logger } from '../utils/logger';

/** Max dimension (long edge) for images sent to Vision OCR. Smaller = faster upload and API time. */
const OCR_MAX_DIMENSION = 1200;

/** Error codes for OCR so UI can show the right message (timeout vs network vs generic). */
export const VISION_OCR_ERROR_CODES = {
  TIMEOUT: 'VISION_TIMEOUT',
  NETWORK: 'VISION_NETWORK',
  API: 'VISION_API',
  IMAGE_PREP: 'VISION_IMAGE_PREP',
} as const;

export type VisionOCRErrorCode = (typeof VISION_OCR_ERROR_CODES)[keyof typeof VISION_OCR_ERROR_CODES];

/** Custom error for Vision OCR so callers can distinguish timeout/network vs other failures. */
export class VisionOCRError extends Error {
  code: VisionOCRErrorCode;
  constructor(message: string, code: VisionOCRErrorCode) {
    super(message);
    this.name = 'VisionOCRError';
    this.code = code;
  }
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /failed to fetch|network request failed|network error|load failed/i.test(msg);
}

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

/** Options for cropImageToRegion. Use exactRegion: true when cropping a user-selected highlight so OCR gets only the selected area. */
export interface CropImageToRegionOptions {
  /** When true, crop exactly the given region with no margin. Use for user highlight → OCR so extra text is not included. */
  exactRegion?: boolean;
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
export async function cropImageToRegion(
  imageUri: string,
  region: Region,
  options?: CropImageToRegionOptions
): Promise<string> {
  const memoryManager = MemoryManager.getInstance();
  const exactRegion = options?.exactRegion === true;

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
      height: region.height,
      exactRegion
    });

    // For user-selected highlight (exactRegion), use the region as-is so OCR output matches what the user highlighted.
    // Otherwise add margin to help capture text at edges (e.g. for other callers).
    let regionToUse: { x: number; y: number; width: number; height: number };
    if (exactRegion) {
      regionToUse = { ...region };
      logger.log('[DEBUG] Using exact region (no margin) for user highlight');
    } else {
      const isLargeRegion = region.width * region.height > 100000;
      const isWideRegion = region.width > region.height * 2;
      const marginPercentage = isLargeRegion ? 0.05 : 0.03;
      const horizontalMarginPercentage = isWideRegion ? 0.08 : marginPercentage;
      const marginX = Math.round(region.width * horizontalMarginPercentage);
      const marginY = Math.round(region.height * marginPercentage);
      logger.log(`[DEBUG] Adding margin to crop region: ${marginX}px horizontal, ${marginY}px vertical${isWideRegion ? ' (wide region detected)' : ''}`);
      regionToUse = {
        x: Math.max(0, region.x - marginX),
        y: Math.max(0, region.y - marginY),
        width: region.width + marginX * 2,
        height: region.height + marginY * 2
      };
      logger.log('[DEBUG] Expanded crop region with margins:', regionToUse);
    }

    // Validate and adjust the crop region to fit within the image boundaries
    const originX = Math.max(0, Math.min(Math.round(regionToUse.x), sourceImage.width - 1));
    const originY = Math.max(0, Math.min(Math.round(regionToUse.y), sourceImage.height - 1));

    const maxWidth = sourceImage.width - originX;
    const maxHeight = sourceImage.height - originY;

    const width = Math.max(1, Math.min(Math.round(regionToUse.width), maxWidth));
    const height = Math.max(1, Math.min(Math.round(regionToUse.height), maxHeight));
    
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

/**
 * Resize image so the long edge is at most maxDimension before sending to OCR.
 * Reduces upload size and Vision API processing time. Returns original URI if already small.
 */
async function resizeImageForOcr(imageUri: string, maxDimension: number = OCR_MAX_DIMENSION): Promise<string> {
  try {
    const info = await getImageInfo(imageUri);
    if (info.width <= maxDimension && info.height <= maxDimension) {
      return imageUri;
    }
    const scale = maxDimension / Math.max(info.width, info.height);
    const width = Math.round(info.width * scale);
    const height = Math.round(info.height * scale);
    logger.log(`[resizeImageForOcr] Resizing ${info.width}x${info.height} -> ${width}x${height} for faster OCR`);
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width, height } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 }
    );
    return result.uri;
  } catch (error) {
    logger.warn('[resizeImageForOcr] Resize failed, using original image:', error);
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

  // Resize image for faster upload and API processing, then encode to base64
  let base64Image: string | null = null;
  try {
    const ocrReadyUri = await resizeImageForOcr(imageUri);
    base64Image = await getBase64ForImage(ocrReadyUri);
  } catch (error) {
    logger.error('Error converting image to base64:', error);
    throw new VisionOCRError('Failed to prepare image for OCR', VISION_OCR_ERROR_CODES.IMAGE_PREP);
  }

  if (!base64Image) {
    throw new Error('Failed to convert image to base64');
  }

  // Determine if the region is complex (large area, likely contains lots of text)
  const aspectRatio = region.width / region.height;
  const isWideRegion = aspectRatio > 3;
  const isLargeRegion = region.width * region.height > 100000;
  const isComplexRegion = isWideRegion || isLargeRegion;
  
  logger.log(`Region complexity assessment: ${isComplexRegion ? 'Complex' : 'Standard'} region (${region.width}x${region.height}, aspect ratio: ${aspectRatio.toFixed(1)}${isWideRegion ? ', wide region' : ''})`);

  // Single feature = faster: DOCUMENT_TEXT_DETECTION is best for blocks of text (e.g. Japanese paragraphs).
  // builtin/stable only for predictable latency; advanced options only for wide regions.
  const requestBody = {
    requests: [
      {
        image: {
          content: (base64Image as string).split(',')[1],
        },
        features: [
          {
            type: 'DOCUMENT_TEXT_DETECTION',
            model: 'builtin/stable',
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
            'it',
            'th',
            'vi'
          ],
          ...(isWideRegion
            ? {
                textDetectionParams: {
                  enableTextDetectionConfidenceScore: true,
                  advancedOcrOptions: [
                    'enable_image_quality_scores',
                    'enable_super_resolution',
                    'enable_dewarping',
                    'enable_dense_text_detection'
                  ]
                }
              }
            : {
                textDetectionParams: {
                  enableTextDetectionConfidenceScore: true,
                  advancedOcrOptions: ['enable_image_quality_scores']
                }
              })
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
      throw new VisionOCRError(
        `Google Cloud Vision API returned status ${response.status}`,
        VISION_OCR_ERROR_CODES.API
      );
    }

    const data = await response.json();
    
    // We only request DOCUMENT_TEXT_DETECTION, so use fullTextAnnotation
    let finalText = data.responses?.[0]?.fullTextAnnotation?.text || '';
    logger.log('Final extracted text:', finalText);

    // If we got no or negligible text and this was a standard (non-wide) region, retry with super
    // resolution in case the image is blurry or low-res. Wide regions already use super resolution.
    const shouldRetryWithEnhancement =
      !isWideRegion &&
      (finalText.trim().length < 2) &&
      (base64Image?.length ?? 0) > 0;

    if (shouldRetryWithEnhancement) {
      logger.log('[detectJapaneseText] No text from first pass, retrying with super resolution for possible blur/low-res');
      const enhancedRequestBody = {
        requests: [
          {
            image: { content: (base64Image as string).split(',')[1] },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', model: 'builtin/stable' }],
            imageContext: {
              languageHints: [
                'ja', 'ja-t-i0-handwrit', 'ja-Hira', 'ja-Kana', 'en', 'zh', 'zh-TW', 'ko',
                'es', 'fr', 'de', 'pt', 'ru', 'ar', 'hi', 'it', 'th', 'vi'
              ],
              textDetectionParams: {
                enableTextDetectionConfidenceScore: true,
                advancedOcrOptions: ['enable_image_quality_scores', 'enable_super_resolution']
              }
            }
          }
        ]
      };
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), timeoutDuration);
      try {
        const retryResponse = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enhancedRequestBody),
          signal: retryController.signal
        });
        clearTimeout(retryTimeoutId);
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryText = retryData.responses?.[0]?.fullTextAnnotation?.text || '';
          if (retryText.trim().length >= 2) {
            finalText = retryText;
            logger.log('[detectJapaneseText] Super-resolution retry returned text:', retryText.substring(0, 80) + (retryText.length > 80 ? '...' : ''));
          }
        }
      } catch (retryErr) {
        clearTimeout(retryTimeoutId);
        logger.warn('[detectJapaneseText] Super-resolution retry failed:', retryErr);
      }
    }
    
    // Build response from final text (first pass or successful retry)
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
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const apiError = error instanceof Error ? error : new Error(String(error));
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const isNetwork = isNetworkError(error);
    await logVisionAPI(metrics, false, undefined, apiError, {
      regionSize: region.width * region.height,
      isComplexRegion,
      isWideRegion,
      errorType: error instanceof Error ? error.name : 'unknown',
      isTimeout,
      isNetwork,
    });

    if (isTimeout) {
      logger.error('Vision API request timed out after', isComplexRegion ? '90' : '30', 'seconds');
      throw new VisionOCRError(
        'Text recognition took too long. Check your connection and try again, or select a smaller area.',
        VISION_OCR_ERROR_CODES.TIMEOUT
      );
    }
    if (isNetwork) {
      logger.error('Vision API network error (slow or no connection):', error);
      throw new VisionOCRError(
        'Connection problem. Check your internet and try again.',
        VISION_OCR_ERROR_CODES.NETWORK
      );
    }
    if (error instanceof VisionOCRError) throw error;
    logger.error('Error calling Vision API:', error);
    throw new VisionOCRError(
      apiError.message || 'Text recognition failed. Please try again.',
      VISION_OCR_ERROR_CODES.API
    );
  }
}

/** A text block with bounding box, returned by detectTextBlocks for OCR scan mode. */
export interface TextBlock {
  id: string;
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/** Vertex from Google Vision API boundingBox.vertices */
interface Vertex {
  x?: number;
  y?: number;
}

/**
 * Converts vertices array to { x, y, width, height } in the given coordinate space.
 * Vertices are typically [topLeft, topRight, bottomRight, bottomLeft].
 */
function verticesToRect(vertices: Vertex[]): { x: number; y: number; width: number; height: number } | null {
  if (!vertices || vertices.length < 2) return null;
  const xs = vertices.map((v) => v.x ?? 0).filter((x) => !isNaN(x));
  const ys = vertices.map((v) => v.y ?? 0).filter((y) => !isNaN(y));
  if (xs.length === 0 || ys.length === 0) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * Scans the full image with Google Vision OCR and returns text blocks/paragraphs
 * with their bounding boxes. Used for OCR scan mode (long-press on highlight button).
 * Coordinates are scaled to match the original image dimensions.
 */
export async function detectTextBlocks(imageUri: string): Promise<TextBlock[]> {
  const API_KEY = EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
  if (!API_KEY) {
    throw new VisionOCRError('Google Cloud Vision API key not found', VISION_OCR_ERROR_CODES.API);
  }

  const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

  const info = await getImageInfo(imageUri);
  const originalWidth = info.width;
  const originalHeight = info.height;

  let base64Image: string | null = null;
  let resizedWidth = originalWidth;
  let resizedHeight = originalHeight;

  try {
    const ocrReadyUri = await resizeImageForOcr(imageUri);
    base64Image = await getBase64ForImage(ocrReadyUri);

    const maxDim = OCR_MAX_DIMENSION;
    if (originalWidth > maxDim || originalHeight > maxDim) {
      const scale = maxDim / Math.max(originalWidth, originalHeight);
      resizedWidth = Math.round(originalWidth * scale);
      resizedHeight = Math.round(originalHeight * scale);
    }
  } catch (error) {
    logger.error('[detectTextBlocks] Error preparing image:', error);
    throw new VisionOCRError('Failed to prepare image for OCR', VISION_OCR_ERROR_CODES.IMAGE_PREP);
  }

  if (!base64Image) {
    throw new VisionOCRError('Failed to convert image to base64', VISION_OCR_ERROR_CODES.IMAGE_PREP);
  }

  const requestBody = {
    requests: [
      {
        image: { content: (base64Image as string).split(',')[1] },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', model: 'builtin/stable' }],
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
            'it',
            'th',
            'vi',
          ],
          textDetectionParams: {
            enableTextDetectionConfidenceScore: true,
            advancedOcrOptions: ['enable_image_quality_scores', 'enable_super_resolution'],
          },
        },
      },
    ],
  };

  const timeoutDuration = 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new VisionOCRError(
        `Google Cloud Vision API returned status ${response.status}`,
        VISION_OCR_ERROR_CODES.API
      );
    }

    const data = await response.json();
    const response0 = data.responses?.[0];
    const fullText = response0?.fullTextAnnotation;
    const textAnnotations = response0?.textAnnotations;
    const scaleX = originalWidth / resizedWidth;
    const scaleY = originalHeight / resizedHeight;

    /** Extract vertices from either boundingBox or boundingPoly (API uses both in different contexts). */
    const getVertices = (obj: unknown): Vertex[] => {
      const o = obj as { boundingBox?: { vertices?: Vertex[] }; boundingPoly?: { vertices?: Vertex[] } };
      return o?.boundingBox?.vertices ?? o?.boundingPoly?.vertices ?? [];
    };

    const blocks: TextBlock[] = [];
    let blockIndex = 0;

    // Primary: parse fullTextAnnotation hierarchical structure (pages -> blocks -> paragraphs)
    if (fullText?.pages?.length) {
      for (const page of fullText.pages) {
        for (const block of page.blocks ?? []) {
          const paras = block.paragraphs ?? [];
          if (paras.length === 0) {
            const blockText = block.text ?? '';
            if (blockText.trim()) {
              const rect = verticesToRect(getVertices(block));
              if (rect) {
                blocks.push({
                  id: `block-${blockIndex++}`,
                  text: blockText.trim(),
                  boundingBox: {
                    x: Math.round(rect.x * scaleX),
                    y: Math.round(rect.y * scaleY),
                    width: Math.round(rect.width * scaleX),
                    height: Math.round(rect.height * scaleY),
                  },
                });
              }
            }
          } else {
            for (const para of paras) {
              const paraText = para.text ?? '';
              if (paraText.trim()) {
                const rect = verticesToRect(getVertices(para));
                if (rect) {
                  blocks.push({
                    id: `block-${blockIndex++}`,
                    text: paraText.trim(),
                    boundingBox: {
                      x: Math.round(rect.x * scaleX),
                      y: Math.round(rect.y * scaleY),
                      width: Math.round(rect.width * scaleX),
                      height: Math.round(rect.height * scaleY),
                    },
                  });
                }
              }
            }
          }
        }
      }
    }

    // Fallback 1: use textAnnotations (word-level with boundingPoly) when fullText hierarchy yields no blocks
    if (blocks.length === 0 && Array.isArray(textAnnotations) && textAnnotations.length > 0) {
      for (let i = 0; i < textAnnotations.length; i++) {
        const ann = textAnnotations[i];
        const desc = (ann as { description?: string }).description ?? '';
        if (!desc.trim()) continue;
        const rect = verticesToRect((ann as { boundingPoly?: { vertices?: Vertex[] } }).boundingPoly?.vertices ?? []);
        if (rect) {
          blocks.push({
            id: `block-${blockIndex++}`,
            text: desc.trim(),
            boundingBox: {
              x: Math.round(rect.x * scaleX),
              y: Math.round(rect.y * scaleY),
              width: Math.round(rect.width * scaleX),
              height: Math.round(rect.height * scaleY),
            },
          });
        }
      }
      logger.log('[detectTextBlocks] Used textAnnotations fallback, found', blocks.length, 'blocks');
    }

    // Fallback 2: fullText.text exists but no blocks - create single block for whole image
    if (blocks.length === 0 && fullText?.text?.trim()) {
      blocks.push({
        id: 'block-0',
        text: fullText.text.trim(),
        boundingBox: { x: 0, y: 0, width: originalWidth, height: originalHeight },
      });
      logger.log('[detectTextBlocks] Used fullText.text fallback (single block)');
    }

    if (blocks.length === 0) {
      logger.log('[detectTextBlocks] No text detected in image');
    }
    return blocks;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const isNetwork = isNetworkError(error);

    if (isTimeout) {
      throw new VisionOCRError(
        'Text recognition took too long. Check your connection and try again.',
        VISION_OCR_ERROR_CODES.TIMEOUT
      );
    }
    if (isNetwork) {
      throw new VisionOCRError(
        'Connection problem. Check your internet and try again.',
        VISION_OCR_ERROR_CODES.NETWORK
      );
    }
    if (error instanceof VisionOCRError) throw error;
    logger.error('[detectTextBlocks] Error:', error);
    throw new VisionOCRError(
      error instanceof Error ? error.message : 'Text recognition failed. Please try again.',
      VISION_OCR_ERROR_CODES.API
    );
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

  // Use getBase64ForImage for reliable file:// URI handling (especially on iOS)
  const base64Image = await getBase64ForImage(processedImageUri);
  if (!base64Image) {
    throw new Error('Failed to convert image to base64');
  }

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
              languageHints: ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt', 'ru', 'ar', 'hi', 'th', 'vi'],
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
      logger.log('[getBase64ForImage] Using existing base64 data URI');
      return imageUri;
    } else if (imageUri.startsWith('file://') || imageUri.startsWith('/')) {
      // Use expo-file-system for local file URIs (more reliable on iOS, especially for captureRef files)
      const normalizedUri = imageUri.startsWith('/') ? `file://${imageUri}` : imageUri;
      logger.log('[getBase64ForImage] Reading local file with FileSystem:', normalizedUri.substring(0, 80) + '...');
      const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Detect image type from URI extension
      const isJpeg = normalizedUri.toLowerCase().includes('.jpg') || normalizedUri.toLowerCase().includes('.jpeg');
      const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
      logger.log('[getBase64ForImage] Successfully read file, base64 length:', base64.length);
      return `data:${mimeType};base64,${base64}`;
    } else {
      // For remote URLs, use fetch
      logger.log('[getBase64ForImage] Fetching remote URL:', imageUri.substring(0, 80) + '...');
      const response = await fetch(imageUri);
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch (error) {
    logger.error('[getBase64ForImage] Error converting image to base64:', error);
    return null;
  }
}

// Add this default export to satisfy Expo Router
const VisionApi = { detectJapaneseText, captureVisibleRegion, cropImageToRegion };
export default VisionApi; 