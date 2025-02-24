import Constants from 'expo-constants';

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

export async function detectJapaneseText(
  imageUri: string,
  region: { x: number; y: number; width: number; height: number }
): Promise<VisionApiResponse[]> {
  const API_KEY = Constants.expoConfig?.extra?.googleCloudVisionApiKey;
  
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
            // Specify Japanese language hint
            languageHints: ['ja'],
          },
        ],
        imageContext: {
          cropHintsParams: {
            aspectRatios: [region.width / region.height],
          },
        },
      },
    ],
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

    // Filter and transform the response to get Japanese text blocks
    return data.responses[0].textAnnotations
      .filter((annotation: any) => {
        // Skip the first annotation as it contains all text
        if (annotation === data.responses[0].textAnnotations[0]) return false;
        
        // Check if the text contains Japanese characters
        return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(annotation.description);
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