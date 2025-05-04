import Constants from 'expo-constants';
import { EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY } from '@env';

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

export async function detectText(
  imageUri: string,
  region: { x: number; y: number; width: number; height: number }
): Promise<VisionApiResponse[]> {
  // Use the imported environment variable
  const API_KEY = EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
  
  // Debug log - remove in production
  console.log('API Key available:', !!API_KEY);
  
  if (!API_KEY) {
    throw new Error('Google Cloud Vision API key not found');
  }

  const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

  // Convert image URI to base64
  const response = await fetch(imageUri);
  const blob = await response.blob();
  const base64Image = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

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
          cropHintsParams: {
            aspectRatios: [region.width / region.height],
          },
          languageHints: ['ja', 'en', 'es', 'fr', 'de', 'zh', 'ko', 'pt', 'ru', 'ar'],
        },
      },
    ],
  };

  const isPointInRegion = (point: { x: number, y: number }) => {
    return point.x >= region.x && 
           point.x <= (region.x + region.width) &&
           point.y >= region.y && 
           point.y <= (region.y + region.height);
  };

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
    console.log('Text Annotations:', data.responses?.[0]?.textAnnotations);
    
    if (!data.responses?.[0]?.textAnnotations) {
      return [];
    }

    // Filter and transform the response to get text blocks within the selected region
    return data.responses[0].textAnnotations
      .filter((annotation: any) => {
        // Skip the first annotation as it contains all text
        if (annotation === data.responses[0].textAnnotations[0]) return false;
        
        // Check if the text contains content and is within the region
        const vertices = annotation.boundingPoly.vertices;
        const isInRegion = vertices.some((vertex: { x: number; y: number }) => isPointInRegion(vertex));
        return isInRegion && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0030-\u0039\u0041-\u005A\u0061-\u007A\uFF65-\uFF9F\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u2010-\u2015\u2018-\u201D\u3000-\u303F]/.test(annotation.description);
      })
      .map((annotation: any) => ({
        text: annotation.description,
        boundingBox: {
          x: annotation.boundingPoly.vertices[0].x,
          y: annotation.boundingPoly.vertices[0].y,
          width: annotation.boundingPoly.vertices[2].x - annotation.boundingPoly.vertices[0].x,
          height: annotation.boundingPoly.vertices[2].y - annotation.boundingPoly.vertices[0].y,
        },
        confidence: annotation.confidence,
      }));
  } catch (error) {
    console.error('Error calling Vision API:', error);
    throw error;
  }
}

// For backward compatibility, maintain the original function name
export const detectJapaneseText = detectText;

export async function analyzeImage(imageUri: string, region?: Region) {
  const apiKey = EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY;
  console.log('API Key available:', !!apiKey);

  const response = await fetch(imageUri);
  const blob = await response.blob();
  const base64Image = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const isPointInRegion = (point: { x: number, y: number }, region: Region) => {
    return point.x >= region.x && 
           point.x <= (region.x + region.width) &&
           point.y >= region.y && 
           point.y <= (region.y + region.height);
  };

  const isAnnotationInRegion = (annotation: any, region: Region) => {
    // Check if any vertex of the bounding polygon falls within the region
    const vertices = annotation.boundingPoly.vertices;
    return vertices.some((vertex: { x: number; y: number }) => 
      isPointInRegion(vertex, region)
    );
  };

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
              content: base64Image,
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

    if (region) {
      // Filter annotations to only include text within the selected region
      const filteredAnnotations = data.responses[0].textAnnotations.filter(
        (annotation: any, index: number) => {
          // Skip the first annotation as it contains the full text
          if (index === 0) return false;
          return isAnnotationInRegion(annotation, region);
        }
      );

      return {
        ...data.responses[0],
        textAnnotations: filteredAnnotations,
      };
    }

    return data.responses[0];
  } catch (error) {
    console.error('Error calling Vision API:', error);
    throw error;
  }
}

// Add default export to satisfy Expo Router's requirement
export default {
  detectText,
  detectJapaneseText,
  analyzeImage
}; 