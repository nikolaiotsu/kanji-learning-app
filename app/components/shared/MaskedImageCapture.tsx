/**
 * Renders a cropped image with stroke-based masking for OCR.
 * Only pixels under the highlight strokes are visible; rest is white.
 * Used with captureRef to produce a masked image for pixel-perfect OCR.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Image, Rect, G, Polygon } from 'react-native-svg';
import type { Point } from '../../services/imageMaskUtils';
import { logger } from '../../utils/logger';

export interface MaskedImageCaptureProps {
  /** Base64 data URI of the cropped image (e.g. data:image/jpeg;base64,...) */
  imageDataUri: string;
  width: number;
  height: number;
  /** Stroke paths in crop-relative coordinates (same scale as width/height) */
  strokes: Point[][];
  strokeWidth: number;
}

/**
 * Convert a stroke (array of points) to a filled polygon that represents the thick stroke area.
 * This creates a "ribbon" shape by offsetting points perpendicular to the stroke direction.
 */
function strokeToFilledPolygon(points: Point[], strokeWidth: number): string {
  if (points.length < 2) return '';
  
  const halfWidth = strokeWidth / 2;
  const topPoints: Point[] = [];
  const bottomPoints: Point[] = [];
  
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    let dx: number, dy: number;
    
    if (i === 0) {
      // First point: use direction to next point
      dx = points[1].x - curr.x;
      dy = points[1].y - curr.y;
    } else if (i === points.length - 1) {
      // Last point: use direction from previous point
      dx = curr.x - points[i - 1].x;
      dy = curr.y - points[i - 1].y;
    } else {
      // Middle points: average direction
      dx = points[i + 1].x - points[i - 1].x;
      dy = points[i + 1].y - points[i - 1].y;
    }
    
    // Normalize and get perpendicular
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len * halfWidth;
    const perpY = dx / len * halfWidth;
    
    topPoints.push({ x: curr.x + perpX, y: curr.y + perpY });
    bottomPoints.push({ x: curr.x - perpX, y: curr.y - perpY });
  }
  
  // Create polygon points string: top points forward, bottom points reversed
  const allPoints = [...topPoints, ...bottomPoints.reverse()];
  return allPoints.map(p => `${p.x},${p.y}`).join(' ');
}

/**
 * Renders an image masked by stroke paths. Areas under strokes are visible; other areas are white.
 * Mount this in a View with a ref and use captureRef to capture the masked result.
 * 
 * Uses clip-path with filled polygons that represent the thick stroke areas.
 */
export default function MaskedImageCapture({
  imageDataUri,
  width,
  height,
  strokes,
  strokeWidth,
}: MaskedImageCaptureProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (imageDataUri && width > 0 && height > 0) {
      setIsReady(true);
      logger.log('[MaskedImageCapture] Ready to render:', {
        width,
        height,
        strokeCount: strokes.length,
        strokeWidth,
        imageDataUriLength: imageDataUri.length,
      });
    } else {
      setIsReady(false);
    }
  }, [imageDataUri, width, height, strokes, strokeWidth]);

  // Convert strokes to filled polygons
  const strokePolygons = useMemo(() => {
    return strokes.map((stroke) => strokeToFilledPolygon(stroke, strokeWidth)).filter(Boolean);
  }, [strokes, strokeWidth]);

  if (!isReady || width <= 0 || height <= 0) {
    return <View style={{ width, height, backgroundColor: 'white' }} />;
  }

  if (strokePolygons.length > 0) {
    logger.log('[MaskedImageCapture] Generated', strokePolygons.length, 'stroke polygons');
    logger.log('[MaskedImageCapture] First polygon (truncated):', strokePolygons[0].substring(0, 100));
  }

  return (
    <View
      style={{
        width,
        height,
        backgroundColor: 'white',
        overflow: 'hidden',
      }}
      collapsable={false}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* White background */}
        <Rect x={0} y={0} width={width} height={height} fill="white" />
        
        {/* Draw the image clipped to each stroke polygon */}
        {strokePolygons.map((polygonPoints, i) => {
          if (!polygonPoints) return null;
          
          const clipId = `strokeClip_${i}`;
          return (
            <G key={i}>
              <ClipPath id={clipId}>
                <Polygon points={polygonPoints} />
              </ClipPath>
              <Image
                href={imageDataUri}
                x={0}
                y={0}
                width={width}
                height={height}
                preserveAspectRatio="none"
                clipPath={`url(#${clipId})`}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
