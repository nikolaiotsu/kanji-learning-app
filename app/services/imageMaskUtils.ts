/**
 * Utilities for applying stroke-based masking to images.
 * Used to ensure OCR only processes pixels directly under highlight strokes.
 */

import * as FileSystem from 'expo-file-system';
import { logger } from '../utils/logger';

export interface Point {
  x: number;
  y: number;
}

/**
 * Convert stroke points to SVG path string (matches ImageHighlighter's pointsToSVGPath logic).
 */
export function pointsToSVGPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x + 1} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  if (points.length === 2) {
    path += ` L ${points[1].x} ${points[1].y}`;
    return path;
  }

  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x} ${current.y}, ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;

  return path;
}

/**
 * Convert stroke paths from display/image-relative coordinates to crop-relative coordinates.
 * Strokes are in the same coordinate space as the region (display pixels).
 * Crop image has dimensions (cropWidth, cropHeight) in original image pixels.
 */
export function convertStrokesToCropRelative(
  strokes: Point[][],
  regionDisplay: { x: number; y: number; width: number; height: number },
  cropWidth: number,
  cropHeight: number
): Point[][] {
  const widthScale = cropWidth / regionDisplay.width;
  const heightScale = cropHeight / regionDisplay.height;

  logger.log('[imageMaskUtils] Converting strokes to crop-relative:', {
    regionDisplay,
    cropWidth,
    cropHeight,
    widthScale,
    heightScale,
    strokeCount: strokes.length,
  });

  const result = strokes
    .map((stroke, idx) => {
      const converted = stroke.map((p) => ({
        x: (p.x - regionDisplay.x) * widthScale,
        y: (p.y - regionDisplay.y) * heightScale,
      }));
      if (idx === 0 && converted.length > 0) {
        logger.log('[imageMaskUtils] First stroke sample (first 3 points):', converted.slice(0, 3));
      }
      return converted;
    })
    .filter((s) => s.length > 0);

  return result;
}

/**
 * Read image file as base64 data URI for use in SVG Image href.
 */
export async function imageUriToBase64DataUri(uri: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const lower = uri.toLowerCase();
    const mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch (error) {
    logger.error('[imageMaskUtils] Failed to read image as base64:', error);
    throw error;
  }
}
