import Constants from 'expo-constants';
import { EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY } from '@env';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

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
  
  // DEBUG: Log inputs
  console.log('[DEBUG][convertToOriginal] Input region:', JSON.stringify(region));
  console.log('[DEBUG][convertToOriginal] Transform data:', JSON.stringify(transformData));

  // The region passed to this function is ALREADY in un-transformed coordinates 
  // (we removed the scale and translation effects in the component)
  // Now we just need to convert from container size to original image size
  
  // Calculate the ratio between the original image and the container
  const widthRatio = imageWidth / scaledWidth;
  const heightRatio = imageHeight / scaledHeight;
  console.log('[DEBUG][convertToOriginal] Width/height ratios:', { widthRatio, heightRatio });
  
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
  console.log('[DEBUG][convertToOriginal] Output region:', JSON.stringify(resultRegion));

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
    console.error('Error capturing image region:', error);
    throw error;
  }
}

// New helper function to crop image to exact region
export async function cropImageToRegion(imageUri: string, region: Region): Promise<string> {
  try {
    // Only proceed with cropping if we have a valid region
    if (!region || region.width <= 0 || region.height <= 0) {
      console.log('Invalid region for cropping:', region);
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
      console.log('[DEBUG] Source image dimensions:', sourceImage.width, 'x', sourceImage.height);
    } catch (error) {
      console.error('Error getting source image dimensions:', error);
      return imageUri;
    }
    
    // Log the original crop region request
    console.log('[DEBUG] Original crop region request:', {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height
    });
    
    // Validate and adjust the crop region to fit within the image boundaries
    const originX = Math.max(0, Math.min(Math.round(region.x), sourceImage.width - 1));
    const originY = Math.max(0, Math.min(Math.round(region.y), sourceImage.height - 1));
    
    // Calculate maximum possible width and height based on the origin point
    const maxWidth = sourceImage.width - originX;
    const maxHeight = sourceImage.height - originY;
    
    // Ensure width and height are within bounds
    const width = Math.max(1, Math.min(Math.round(region.width), maxWidth));
    const height = Math.max(1, Math.min(Math.round(region.height), maxHeight));
    
    const safeRegion = {
      originX,
      originY,
      width,
      height
    };
    
    console.log('[DEBUG] Safe crop region:', safeRegion);
    
    // If the adjusted crop region is too small, return the original image
    if (safeRegion.width < 1 || safeRegion.height < 1) {
      console.log('[WARNING] Crop region too small after adjustment, returning original image');
      return imageUri;
    }
    
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
    console.log('[DEBUG] Cropped image URI:', result.uri);
    console.log('[DEBUG] Cropped image dimensions:', result.width, 'x', result.height);
    
    return result.uri;
  } catch (error) {
    console.error('Error cropping image:', error);
    // Fall back to original image if cropping fails
    return imageUri;
  }
}

// New function that only crops the image without text detection
export async function resizeImageToRegion(imageUri: string, region: Region): Promise<string> {
  try {
    console.log('[resizeImageToRegion] Starting with region:', region);
    
    // Only proceed with cropping if we have a valid region
    if (!region || region.width <= 0 || region.height <= 0) {
      console.log('[resizeImageToRegion] Invalid region for cropping:', region);
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
      console.log('[DEBUG] Source image dimensions:', sourceImage.width, 'x', sourceImage.height);
    } catch (error) {
      console.error('[resizeImageToRegion] Error getting source image dimensions:', error);
      return imageUri;
    }
    
    // Log the original crop region request
    console.log('[DEBUG] Original crop region request:', {
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
      console.log('[resizeImageToRegion] Detected over-scaled coordinates, adjusting...');
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
      
      console.log('[resizeImageToRegion] Adjusted to match image dimensions:', adjustedRegion);
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
    
    console.log('[DEBUG] Safe crop region:', safeRegion);
    
    // If the adjusted crop region is too small, return the original image
    if (safeRegion.width < 1 || safeRegion.height < 1) {
      console.log('[WARNING] Crop region too small after adjustment, returning original image');
      return imageUri;
    }
    
    console.log('[resizeImageToRegion] Attempting to manipulate image with crop:', safeRegion);
    
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
    console.log('[DEBUG] Cropped image URI:', result.uri);
    console.log('[DEBUG] Cropped image dimensions:', result.width, 'x', result.height);
    console.log('[resizeImageToRegion] Successfully cropped image');
    
    return result.uri;
  } catch (error) {
    console.error('[resizeImageToRegion] Error cropping image:', error);
    // Fall back to original image if cropping fails
    return imageUri;
  }
}

export async function detectJapaneseText(
  imageUri: string,
  region: Region,
  isVisibleRegion: boolean = false
): Promise<VisionApiResponse[]> {
  // Use the imported environment variable
  const API_KEY = EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
  
  // Debug log - remove in production
  console.log('API Key available:', !!API_KEY);
  
  if (!API_KEY) {
    throw new Error('Google Cloud Vision API key not found');
  }

  const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

  // SIMPLIFICATION: Pre-crop the image to the region if a region is specified
  // This ensures we only send the exact area of interest to the API
  let processedImageUri = imageUri;
  if (region && region.width > 0 && region.height > 0 && !isVisibleRegion) {
    processedImageUri = await cropImageToRegion(imageUri, region);
    console.log('Image cropped to region before API call');
  }

  // Convert image URI to base64
  let base64Image;
  if (processedImageUri.startsWith('data:image')) {
    // Already a base64 image
    base64Image = processedImageUri;
  } else {
    const response = await fetch(processedImageUri);
    const blob = await response.blob();
    base64Image = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  // DEBUG: Log the base64 of the image being sent
  console.log('[DEBUG] Cropped Image Base64 (copy and paste to a viewer):', base64Image);

  const requestBody = {
    requests: [
      {
        image: {
          content: (base64Image as string).split(',')[1],
        },
        features: [
          {
            type: 'TEXT_DETECTION',
          },
        ],
        imageContext: {
          languageHints: ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt', 'ru', 'ar'],
        },
      },
    ],
  };

  // DEBUG: Log the request body before sending
  console.log('[DEBUG] Vision API Request Body:', JSON.stringify(requestBody, null, 2));

  try {
    const result = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await result.json();
    
    // Debug logs - remove in production
    console.log('API Response:', data);
    
    // Add more detailed logging of the response
    if (data.responses?.[0]?.textAnnotations) {
      console.log('Text annotations found:', data.responses[0].textAnnotations.length);
      // Log the first few annotations to help with debugging
      data.responses[0].textAnnotations.slice(0, 3).forEach((annotation: any, idx: number) => {
        console.log(`Annotation ${idx}:`, annotation.description);
      });
    } else {
      console.log('No text annotations found in API response');
    }
    
    if (!data.responses?.[0]?.textAnnotations || data.responses[0].textAnnotations.length === 0) {
      return [];
    }

    // Get results - first, try getting all annotations
    const allAnnotations = data.responses[0].textAnnotations;
    
    // Check if we have any Japanese text in the first annotation (which contains all text)
    if (allAnnotations.length > 0) {
      const firstAnnotation = allAnnotations[0];
      // Include Korean Unicode ranges in the regex pattern
      const hasTextContent = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0030-\u0039\u0041-\u005A\u0061-\u007A\uFF65-\uFF9F\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u2010-\u2015\u2018-\u201D\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC]/.test(firstAnnotation.description);
      
      console.log('First annotation (all text):', firstAnnotation.description);
      console.log('Contains text content:', hasTextContent);
      
      // If we don't have any text content in the full text, return empty
      if (!hasTextContent && allAnnotations.length === 1) {
        console.log('No text found in the image');
        return [];
      }
    }
    
    // If we have more than one annotation, process individual characters/words
    const results = allAnnotations
      .filter((annotation: any, index: number) => {
        // Skip the first annotation as it contains all text
        if (index === 0) return false;
        
        // Include Korean Unicode ranges in this regex pattern too
        const hasTextContent = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0030-\u0039\u0041-\u005A\u0061-\u007A\uFF65-\uFF9F\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u2010-\u2015\u2018-\u201D\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC]/.test(annotation.description);
        
        // Log each annotation for debugging
        console.log(`Annotation ${index}: "${annotation.description}" - Has text: ${hasTextContent}`);
        
        return hasTextContent;
      })
      .map((annotation: any) => ({
        text: annotation.description,
        boundingBox: {
          x: annotation.boundingPoly.vertices[0].x,
          y: annotation.boundingPoly.vertices[0].y,
          width: annotation.boundingPoly.vertices[2].x - annotation.boundingPoly.vertices[0].x,
          height: annotation.boundingPoly.vertices[2].y - annotation.boundingPoly.vertices[0].y,
        },
        confidence: annotation.confidence || 0.9, // Some annotations might not have confidence
      }));
    
    console.log('Processed results:', results.length > 0 ? results.map((r: VisionApiResponse) => r.text).join(', ') : 'No results');
    
    // If no individual annotations with text were found,
    // but the first annotation has text, use it as a fallback
    if (results.length === 0 && allAnnotations.length > 0) {
      const firstAnnotation = allAnnotations[0];
      // Include Korean Unicode ranges in this regex pattern as well
      if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0030-\u0039\u0041-\u005A\u0061-\u007A\uFF65-\uFF9F\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u2010-\u2015\u2018-\u201D\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC]/.test(firstAnnotation.description)) {
        console.log('Using first annotation as fallback');
        return [{
          text: firstAnnotation.description,
          boundingBox: {
            x: firstAnnotation.boundingPoly.vertices[0].x,
            y: firstAnnotation.boundingPoly.vertices[0].y,
            width: firstAnnotation.boundingPoly.vertices[2].x - firstAnnotation.boundingPoly.vertices[0].x,
            height: firstAnnotation.boundingPoly.vertices[2].y - firstAnnotation.boundingPoly.vertices[0].y,
          },
          confidence: firstAnnotation.confidence || 0.9,
        }];
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error calling Vision API:', error);
    throw error;
  }
}

export async function analyzeImage(imageUri: string, region?: Region) {
  const apiKey = EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
  console.log('API Key available:', !!apiKey);

  // If region is specified, crop the image before analysis
  let processedImageUri = imageUri;
  if (region && region.width > 0 && region.height > 0) {
    processedImageUri = await cropImageToRegion(imageUri, region);
    console.log('Image cropped to region before analysis');
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
              languageHints: ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt', 'ru', 'ar'],
            },
          }],
        }),
      }
    );

    const data = await result.json();
    console.log('API Response:', data);

    // Since we've pre-cropped the image, we can return all text annotations
    return data.responses[0];
  } catch (error) {
    console.error('Error calling Vision API:', error);
    throw error;
  }
}

// Add this default export to satisfy Expo Router
const VisionApi = { detectJapaneseText, captureVisibleRegion, cropImageToRegion };
export default VisionApi; 