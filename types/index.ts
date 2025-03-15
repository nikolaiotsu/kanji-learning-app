export interface CapturedImage {
  uri: string;
  width: number;
  height: number;
}

export interface TextAnnotation {
  description: string;
  // other fields if needed
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionApiResponse {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
} 