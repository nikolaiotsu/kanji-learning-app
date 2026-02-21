import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Image,
  StyleSheet,
  PanResponder,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  GestureResponderEvent,
  PanResponderGestureState,
  Animated,
  Easing,
} from 'react-native';
import Svg, { Path, Rect, G, ClipPath, Polygon, Image as SvgImage } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import * as ImageManipulator from 'expo-image-manipulator';
import { detectJapaneseText } from '../../services/visionApi';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';
import { processImage } from '../../services/ProcessImage';
import { captureRef } from 'react-native-view-shot';

import { logger } from '../../utils/logger';
import { imageUriToBase64DataUri } from '../../services/imageMaskUtils';
import * as Haptics from 'expo-haptics';

// Create animated SVG components
const AnimatedPath = Animated.createAnimatedComponent(Path);
// Define the type for the forwarded ref handle
export interface ImageHighlighterRef {
  getView: () => View | null;
  getTransformData: () => {
    originalImageWidth: number;
    originalImageHeight: number;
    displayImageViewWidth: number;
    displayImageViewHeight: number;
    displayImageOffsetX: number;
    displayImageOffsetY: number;
    imageContainerWidth: number;
    imageContainerHeight: number;
    rotation: number;
  };
  toggleCropMode: () => void;
  toggleRotateMode: () => void;
  applyCrop: () => void;
  hasCropRegion: boolean;
  clearHighlightBox: () => void;
  clearCropBox: () => void;
  /** Capture a masked image showing only the highlighted regions (white bg, image visible only under strokes) */
  captureMaskedHighlight: () => Promise<{ uri: string; width: number; height: number } | null>;
  /** Get current strokes data for external use */
  getStrokes: () => Point[][];
  /** Get stroke bounding boxes in original image pixel coordinates */
  getStrokeBoundsInOriginalCoords: () => Array<{ x: number; y: number; width: number; height: number }>;
  /** Capture a single composite image: white background with only stroke regions showing. One OCR-ready image. */
  captureCompositeStrokeImage: () => Promise<{ uri: string; width: number; height: number } | null>;

  // New rotation methods
  undoRotationChange: () => boolean;
  redoRotationChange: () => boolean;
  confirmCurrentRotation: () => Promise<{ uri: string, width: number, height: number } | null>;
  cancelRotationChanges: () => void;
  getRotationState: () => {
    currentRotation: number;
    initialRotationOnEnter: number;
    canUndo: boolean;
    canRedo: boolean;
    hasRotated: boolean;
  };
}

// Export the type for the rotation state object
export type ImageHighlighterRotationState = ReturnType<ImageHighlighterRef['getRotationState']>;

// Export Point for use in mask utilities
export interface Point {
  x: number;
  y: number;
}

interface ImageHighlighterProps {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  /** When true and on iPad, uses a larger highlighter stroke for faster word selection on cropped/zoomed images */
  imageIsCropped?: boolean;
  highlightModeActive?: boolean;
  onActivateHighlightMode?: () => void;
  onRegionSelected?: (region: {
    x: number;
    y: number;
    width: number;
    height: number;
    detectedText?: string[];
    rotation?: number;
    /** Stroke paths in image-relative coordinates (same space as x,y,width,height) for mask generation */
    strokes?: Point[][];
    /** Width of the highlighter stroke in display pixels */
    strokeWidth?: number;
  }) => void;
  onRotationStateChange?: (state: ImageHighlighterRotationState) => void;
  onImageLoaded?: () => void; // Called when the image has finished loading and is visible
  /** Called when the user starts or stops drawing a highlight stroke (so parent can hide hint animation). */
  onHighlightDrawingChange?: (drawing: boolean) => void;
}

// Let's define a type for our crop box to ensure type consistency
interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Constants for layout calculations
const CROP_HANDLE_SIZE = 30;
const CROP_HANDLE_TOUCH_AREA = 40;
const ROTATION_SMOOTHING_FACTOR = 0.4; // New, for smoothing rotation during drag
const EDGE_TOLERANCE = 50; // pixels outside image boundary for starting highlights/crops
const STROKE_WIDTH = 20; // Width of the highlighter stroke
/** Larger stroke on iPad when image is cropped—faster to highlight words on the larger display */
const STROKE_WIDTH_IPAD_CROPPED = 36;
/** Inset (px) for the green frame; highlightable area is inside this frame—deadzone is outside. Must match SCREEN_FRAME_INSET in styles. */
const HIGHLIGHT_FRAME_INSET = 14;
/** Extra width when building composite mask polygons so adjacent strokes overlap (no white streaks). Keep moderate to avoid including adjacent text. */
const COMPOSITE_MASK_STROKE_INFLATION = 10;
/** Pixels to expand each composite polygon outward (minimal—prioritize accuracy over capturing edge chars) */
const COMPOSITE_MASK_EDGE_PADDING = 0;
/** Horizontal padding (in original image pixels) added to each row rect to prevent edge character clipping (e.g. "p" in pensé, "a" in autre) */
const ROW_HORIZONTAL_PADDING = 28;
/** Vertical padding (in original image pixels) added above/below original stroke bounds. 
 * Must be enough to capture full text height (characters extend above/below stroke line).
 * ~30px works well for typical text sizes while avoiding adjacent lines. */
const ROW_VERTICAL_PADDING = 30;
const POINT_THROTTLE_MS = 16; // ~60fps for point collection
/** Interval (ms) between haptic ticks during highlight/crop drag for "vibrating" feedback */
const HAPTIC_DRAG_INTERVAL_MS = 80;

// Ref for the PanResponder View - MOVED INSIDE COMPONENT
// const panResponderViewRef = React.useRef<View>(null); // REMOVE FROM HERE

const ImageHighlighter = forwardRef<ImageHighlighterRef, ImageHighlighterProps>(({ 
  imageUri,
  imageWidth,
  imageHeight,
  imageIsCropped = false,
  highlightModeActive = false,
  onActivateHighlightMode,
  onRegionSelected,
  onRotationStateChange,
  onImageLoaded,
  onHighlightDrawingChange,
}, ref) => {
  const { t } = useTranslation();
  const effectiveStrokeWidth = (Platform.OS === 'ios' && Platform.isPad && imageIsCropped)
    ? STROKE_WIDTH_IPAD_CROPPED
    : STROKE_WIDTH;
  const panResponderViewRef = React.useRef<View>(null); // ADDED HERE
  const maskCaptureRef = useRef<View>(null);
  const compositeCaptureRef = useRef<View>(null);
  const [isCompositeCaptureReady, setIsCompositeCaptureReady] = useState(false);
  const [compositeCaptureParams, setCompositeCaptureParams] = useState<{
    strokeBounds: Array<{ x: number; y: number; width: number; height: number }>;
    /** Row-based rectangles for accurate staircase mask (no diagonal cuts, no extraneous corners) */
    rowRects: Array<{ x: number; y: number; width: number; height: number }>;
    /** Base64 data URI for SVG Image href (file:// not reliable in react-native-svg on iOS) */
    imageDataUri: string;
    mergedMinX: number;
    mergedMinY: number;
    mergedWidth: number;
    mergedHeight: number;
  } | null>(null);
  const compositeImagesLoadedRef = useRef(0);
  const [isMaskCaptureReady, setIsMaskCaptureReady] = useState(false);
  const [maskImageLoaded, setMaskImageLoaded] = useState(false);
  const maskImageLoadedRef = useRef(false);
  const maskCaptureResolveRef = useRef<((result: { uri: string; width: number; height: number } | null) => void) | null>(null);
  const [measuredLayout, setMeasuredLayout] = useState<{width: number, height: number} | null>(null);
  const [containerScreenOffset, setContainerScreenOffset] = useState<{x: number, y: number} | null>(null);

  // Stroke-based highlighting state (replaces highlightBox)
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const lastPointTimeRef = useRef<number>(0);
  const lastHapticDragTimeRef = useRef<number>(0);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedRegions, setDetectedRegions] = useState<Array<{
    text: string;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    id?: string;
  }>>([]);
  
  // State for crop mode
  const [cropMode, setCropMode] = useState(false);
  const [cropBox, setCropBox] = useState<CropBox>({
    x: 0,
    y: 0,
    width: 0,
    height: 0
  });
  const [activeCropHandle, setActiveCropHandle] = useState<string | null>(null);
  const [isCropDrawing, setIsCropDrawing] = useState(false);
  
  // State for rotate mode
  const [rotateMode, setRotateMode] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [initialRotation, setInitialRotation] = useState(0);
  
  // Animated value for visual rotation - synced with rotation state for smooth native updates
  const rotationAnimatedValue = useRef(new Animated.Value(0)).current;
  
  // Sync animated value with rotation state - this ensures the visual rotation updates
  useEffect(() => {
    rotationAnimatedValue.setValue(rotation);
  }, [rotation, rotationAnimatedValue]);
  
  // Refs to store state values for PanResponder callbacks (prevents stale closure issues)
  const rotateModeRef = useRef(false);
  const highlightModeActiveRef = useRef(highlightModeActive);
  const cropModeRef = useRef(false);
  const rotationRef = useRef(0);
  const containerScreenOffsetRef = useRef<{x: number, y: number} | null>(null);
  const measuredLayoutRef = useRef<{width: number, height: number} | null>(null);
  const cropBoxRef = useRef<CropBox>({ x: 0, y: 0, width: 0, height: 0 });
  const activeCropHandleRef = useRef<string | null>(null);
  const isCropDrawingRef = useRef(false);
  const isDrawingRef = useRef(false);
  
  // Refs for gesture calculation
  // imageRotationAtGestureStartRef: Stores the image's rotation at the very beginning of a PanResponder Grant event.
  // This is the baseline rotation *before* the current gesture starts.
  const imageRotationAtGestureStartRef = useRef<number>(0); 
  const previousFingerAngleRef = useRef<number | null>(null);
  // accumulatedAngleDeltaForGestureRef: Stores the *total* accumulated angular change OF THE FINGER MOVEMENT ITSELF since onPanResponderGrant.
  const accumulatedAngleDeltaForGestureRef = useRef<number>(0); 
  // lastVisuallyAppliedRotationRef: Stores the actual rotation value that was last commanded via setRotation (smoothed value).
  const lastVisuallyAppliedRotationRef = useRef<number>(0);
  
  // Refs for calculated layout values (computed from measuredLayout and image dimensions)
  const scaledContainerWidthRef = useRef(0);
  const scaledContainerHeightRef = useRef(0);
  const displayImageOffsetXRef = useRef(0);
  const displayImageOffsetYRef = useRef(0);
  
  // Keep refs in sync with state values - this ensures PanResponder callbacks have current values
  useEffect(() => { rotateModeRef.current = rotateMode; }, [rotateMode]);
  useEffect(() => { highlightModeActiveRef.current = highlightModeActive; }, [highlightModeActive]);
  useEffect(() => { cropModeRef.current = cropMode; }, [cropMode]);
  useEffect(() => { rotationRef.current = rotation; }, [rotation]);
  useEffect(() => { containerScreenOffsetRef.current = containerScreenOffset; }, [containerScreenOffset]);
  useEffect(() => { measuredLayoutRef.current = measuredLayout; }, [measuredLayout]);
  useEffect(() => { cropBoxRef.current = cropBox; }, [cropBox]);
  useEffect(() => { activeCropHandleRef.current = activeCropHandle; }, [activeCropHandle]);
  useEffect(() => { isCropDrawingRef.current = isCropDrawing; }, [isCropDrawing]);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
  useEffect(() => { maskImageLoadedRef.current = maskImageLoaded; }, [maskImageLoaded]);

  // Reference to the image view for capturing screenshots
  const imageViewRef = useRef<View>(null);
  
  // Previous imageUri ref to detect changes
  const prevImageUriRef = useRef<string | null>(null);
  
  // Rainbow animation for highlight and crop box borders
  const rainbowAnim = useRef(new Animated.Value(0)).current;
  const animationLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  
  // Fade-in animation for images
  const imageOpacity = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rainbowAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    animationLoopRef.current = loop;
    const listenerId = rainbowAnim.addListener(() => {
      // Animation value listener (needed to keep animation running)
    });
    loop.start();
    
    return () => {
      rainbowAnim.removeListener(listenerId);
      if (animationLoopRef.current) {
        animationLoopRef.current.stop();
        animationLoopRef.current = null;
      }
    };
  }, []);
  
  const rainbowColor = rainbowAnim.interpolate({
    inputRange: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1],
    outputRange: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF', '#FF0000'],
  });
  
  // Helper function to restart animation loop
  const restartAnimationLoop = () => {
    if (animationLoopRef.current) {
      // Stop existing loop and restart to ensure it's running
      animationLoopRef.current.stop();
      const newLoop = Animated.loop(
        Animated.timing(rainbowAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      );
      animationLoopRef.current = newLoop;
      newLoop.start();
    }
  };

  // Effect to track highlightModeActive changes and ensure animation is running
  useEffect(() => {
    // Restart animation when highlight mode becomes active to ensure rainbow effect works
    if (highlightModeActive) {
      restartAnimationLoop();
    }
  }, [highlightModeActive, rainbowAnim]);

  // Effect to track cropMode changes and ensure animation is running
  useEffect(() => {
    // Restart animation when crop mode becomes active to ensure rainbow effect works
    if (cropMode) {
      restartAnimationLoop();
    }
  }, [cropMode, rainbowAnim]);
  
  // Effect to track image changes: reset processing, highlight strokes, and crop state.
  // Keeps accuracy high when the image changes (e.g. after crop, restore original, or fresh load).
  useEffect(() => {
    if (prevImageUriRef.current !== imageUri) {
      setIsProcessing(false);
      imageOpacity.setValue(0);
      setCropMode(false);
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      setStrokes([]);
      setCurrentStroke([]);
      setDetectedRegions([]);
      prevImageUriRef.current = imageUri;
    }
  }, [imageUri, imageOpacity]);
  
  // Calculate scaled dimensions for the image container (pan responder view)
  // This will now depend on measuredLayout, so calculations move into the return or useEffect after layout is measured
  let scaledContainerWidth = 0;
  let scaledContainerHeight = 0;
  let finalDisplayImageWidth = 0;
  let finalDisplayImageHeight = 0;
  let displayImageOffsetX = 0;
  let displayImageOffsetY = 0;

  if (measuredLayout && imageWidth > 0 && imageHeight > 0) {
    // IMPORTANT CHANGE: Ensure the image container fits within the wrapper bounds
    // The wrapper dimensions are what we measured in onLayout
    const maxContainerWidth = measuredLayout.width;
    const maxContainerHeight = measuredLayout.height;
    
    // Calculate the aspect ratio of the original image
    const aspectRatio = imageWidth / imageHeight;
    
    // Scale the image to fit within the wrapper while maintaining aspect ratio
    const containerAspectRatio = maxContainerWidth / maxContainerHeight;
    
    if (aspectRatio > containerAspectRatio) {
      // Image is wider relative to container - constrain by width
      scaledContainerWidth = maxContainerWidth;
      scaledContainerHeight = scaledContainerWidth / aspectRatio;
    } else {
      // Image is taller relative to container - constrain by height  
      scaledContainerHeight = maxContainerHeight;
      scaledContainerWidth = scaledContainerHeight * aspectRatio;
    }
    
    // Ensure we don't exceed the wrapper bounds
    scaledContainerWidth = Math.min(scaledContainerWidth, maxContainerWidth);
    scaledContainerHeight = Math.min(scaledContainerHeight, maxContainerHeight);
    
    // Update these values for other calculations in the component
    finalDisplayImageWidth = scaledContainerWidth;
    finalDisplayImageHeight = scaledContainerHeight;
    
    // Calculate the offset of the image container within the wrapper
    // The image container is centered within the wrapper
    displayImageOffsetX = (measuredLayout.width - scaledContainerWidth) / 2;
    displayImageOffsetY = (measuredLayout.height - scaledContainerHeight) / 2;
  }
  
  // Update layout refs for use in PanResponder callbacks (prevents stale closure issues)
  scaledContainerWidthRef.current = scaledContainerWidth;
  scaledContainerHeightRef.current = scaledContainerHeight;
  displayImageOffsetXRef.current = displayImageOffsetX;
  displayImageOffsetYRef.current = displayImageOffsetY;

  // useEffect for logging rotation state changes
  useEffect(() => {
    if (rotateMode) {
      // logger.log(`[DEBUG ImageHighlighter] rotation state CHANGED to: ${rotation.toFixed(2)}`); // Removed
    }
  }, [rotation, rotateMode]);

  // Helper to get current rotation state for notifier
  const getCurrentRotationStateForNotifier = (): ImageHighlighterRotationState => {
    const EPSILON = 0.01;
    return {
      currentRotation: rotation,
      initialRotationOnEnter: initialRotation,
      canUndo: Math.abs(rotation - initialRotation) > EPSILON,
      canRedo: false,
      hasRotated: Math.abs(rotation - initialRotation) > 0.1,
    };
  };

  // Helper to notify parent about rotation state changes
  const _notifyRotationStateChanged = () => {
    if (onRotationStateChange) {
      onRotationStateChange(getCurrentRotationStateForNotifier());
    }
  };

  // Effect to notify parent about rotation state changes
  useEffect(() => {
    if (rotateMode && onRotationStateChange) {
      _notifyRotationStateChanged();
    }
    // If exiting rotate mode, parent might want to know too, but it will know 'rotateMode' is false.
    // Parent can clear its own stored rotation state when it toggles rotateMode off.
  }, [
    rotation,
    initialRotation,
    rotateMode, 
  ]);

  // Use a useEffect to handle remeasuring when containerScreenOffset is missing
  useEffect(() => {
    if (!containerScreenOffset && panResponderViewRef.current && measuredLayout) {
      // logger.log('[ImageHighlighter] containerScreenOffset is null, attempting to remeasure...'); // Removed
      // Small delay to ensure the component is fully rendered
      const timeoutId = setTimeout(() => {
        if (panResponderViewRef.current) {
          panResponderViewRef.current.measure((fx, fy, w, h, px, py) => {
            // logger.log(`[ImageHighlighter] Delayed remeasure: screenX:${px}, screenY:${py}, width:${w}, height:${h}`); // Removed
            setContainerScreenOffset({ x: px, y: py });
          });
        }
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [containerScreenOffset, measuredLayout]);

  // Forward the imageViewRef and transform data to parent component
  useImperativeHandle(ref, () => ({
    getView: () => imageViewRef.current,
    getTransformData: () => ({
      originalImageWidth: imageWidth,
      originalImageHeight: imageHeight,
      // Actual dimensions of the visible image content on screen
      displayImageViewWidth: finalDisplayImageWidth,
      displayImageViewHeight: finalDisplayImageHeight,
      // Offsets of the visible image content from the top-left of the pan responder view
      displayImageOffsetX,
      displayImageOffsetY,
      // Dimensions of the pan responder view itself
      imageContainerWidth: scaledContainerWidth,
      imageContainerHeight: scaledContainerHeight,
      rotation,
    }),
    toggleCropMode: () => {
      const newCropMode = !cropMode;
      setCropMode(newCropMode);
      
      if (newCropMode) {
        // Exit other modes if they're active
        if (highlightModeActive && onActivateHighlightMode) {
          onActivateHighlightMode();
        }
        if (rotateMode) {
          setRotateMode(false);
          // If rotating, and crop is activated, cancel current rotation session
          setRotation(initialRotation); // Revert to rotation at start of mode
        }
        // Reset crop box to empty state
        setCropBox({ x: 0, y: 0, width: 0, height: 0 });
        setIsCropDrawing(false);
      }
    },
    toggleRotateMode: () => {
      const newRotateMode = !rotateMode;
      setRotateMode(newRotateMode);
      
      if (newRotateMode) { // ---- Entering Rotate Mode ----
        if (highlightModeActive && onActivateHighlightMode) {
          onActivateHighlightMode();
        }
        if (cropMode) {
          setCropMode(false);
        }
        // Initialize rotation session
        setInitialRotation(rotation); // Capture the rotation state *before* this session starts
        // logger.log('[ImageHighlighter] Entered rotate mode. Initial session rotation:', rotation); // Removed
      } else { // ---- Exiting Rotate Mode (if toggled off directly by this call) ----
        // This implies a cancellation if not preceded by a confirm/ API call.
        // logger.log('[ImageHighlighter] Exited rotate mode via toggle. Reverting to initial session rotation:', initialRotation); // Removed
        setRotation(initialRotation); // initialRotation holds the value from when mode was entered
      }
    },
    applyCrop: () => {
      if (!cropMode || !onRegionSelected || cropBox.width === 0 || cropBox.height === 0) return;
      
      try {
        // logger.log('[ImageHighlighter] applyCrop called - Starting crop operation'); // Removed
        setIsProcessing(true);
        
        // Normalize the crop box coordinates (ensure positive width/height)
        const { x, y, width, height } = cropBox;
        const normalizedX = width < 0 ? x + width : x;
        const normalizedY = height < 0 ? y + height : y;
        const normalizedWidth = Math.abs(width);
        const normalizedHeight = Math.abs(height);
        
        logger.log('[ImageHighlighter] Normalized crop box (wrapper coordinates):', {
          x: normalizedX, y: normalizedY, width: normalizedWidth, height: normalizedHeight
        });
        
        // Convert crop box coordinates from wrapper coordinates to image container coordinates
        const imageContainerX = normalizedX - displayImageOffsetX;
        const imageContainerY = normalizedY - displayImageOffsetY;
        const imageContainerEndX = imageContainerX + normalizedWidth;
        const imageContainerEndY = imageContainerY + normalizedHeight;
        
        logger.log('[ImageHighlighter] Image container coordinates:', {
          startX: imageContainerX, startY: imageContainerY,
          endX: imageContainerEndX, endY: imageContainerEndY,
          containerWidth: scaledContainerWidth, containerHeight: scaledContainerHeight
        });
        
        // Clamp the crop region to the actual image container bounds
        const clampedStartX = Math.max(0, imageContainerX);
        const clampedStartY = Math.max(0, imageContainerY);
        const clampedEndX = Math.min(scaledContainerWidth, imageContainerEndX);
        const clampedEndY = Math.min(scaledContainerHeight, imageContainerEndY);
        
        // Calculate the clamped dimensions
        const clampedWidth = clampedEndX - clampedStartX;
        const clampedHeight = clampedEndY - clampedStartY;
        
        logger.log('[ImageHighlighter] Clamped to image bounds:', {
          x: clampedStartX, y: clampedStartY, width: clampedWidth, height: clampedHeight
        });
        
        // Ensure we have a valid crop region after clamping
        if (clampedWidth <= 0 || clampedHeight <= 0) {
          logger.warn('[ImageHighlighter] Crop region is completely outside image bounds, ignoring');
          return;
        }
        
        // Convert the clamped coordinates to original image coordinates
        const originalRegion = {
          x: Math.round((clampedStartX / scaledContainerWidth) * imageWidth),
          y: Math.round((clampedStartY / scaledContainerHeight) * imageHeight),
          width: Math.round((clampedWidth / scaledContainerWidth) * imageWidth),
          height: Math.round((clampedHeight / scaledContainerHeight) * imageHeight),
          rotation: rotation // Include current rotation
        };
        logger.log('[ImageHighlighter] Original image coordinates:', originalRegion);
        
        // Final safety check to ensure coordinates are within image bounds
        const safeRegion = {
          x: Math.max(0, Math.min(originalRegion.x, imageWidth - 1)),
          y: Math.max(0, Math.min(originalRegion.y, imageHeight - 1)),
          width: Math.max(1, Math.min(originalRegion.width, imageWidth - Math.max(0, originalRegion.x))),
          height: Math.max(1, Math.min(originalRegion.height, imageHeight - Math.max(0, originalRegion.y))),
          rotation: originalRegion.rotation
        };
        
        logger.log('[ImageHighlighter] Final safe region:', safeRegion);
        
        // Validate that the final region is within bounds
        if (safeRegion.x + safeRegion.width > imageWidth || safeRegion.y + safeRegion.height > imageHeight) {
          logger.error('[ImageHighlighter] Final region still exceeds image bounds, this should not happen');
          return;
        }
        
        // Use the existing onRegionSelected callback to process the crop
        logger.log('[ImageHighlighter] Calling onRegionSelected with safeRegion');
        onRegionSelected(safeRegion);
        logger.log('[ImageHighlighter] onRegionSelected callback completed');
        
        // Exit crop mode after applying
        setCropMode(false);
      } finally {
        setIsProcessing(false);
      }
    },
    // Computed property to check if a crop region exists
    get hasCropRegion() {
      // Check if there's a valid crop box with meaningful dimensions (at least 10x10 pixels)
      return cropMode && cropBox.width !== 0 && cropBox.height !== 0 && 
             Math.abs(cropBox.width) > 10 && Math.abs(cropBox.height) > 10;
    },
    clearHighlightBox: () => {
      setIsDrawing(false);
      onHighlightDrawingChange?.(false);
      setStrokes([]);
      setCurrentStroke([]);
      // Also reset any detected regions that might be displayed
      setDetectedRegions([]);
    },
    clearCropBox: () => {
      logger.log('[ImageHighlighter] clearCropBox called');
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      setIsCropDrawing(false);
      setActiveCropHandle(null);
    },
    getStrokes: () => strokes,
    getStrokeBoundsInOriginalCoords: () => {
      if (strokes.length === 0 || !measuredLayout || scaledContainerWidth === 0) {
        return [];
      }
      
      // Scale factors from display to original image
      const scaleX = imageWidth / scaledContainerWidth;
      const scaleY = imageHeight / scaledContainerHeight;
      
      const rawBounds: Array<{ x: number; y: number; width: number; height: number }> = [];
      
      for (const stroke of strokes) {
        if (stroke.length < 2) continue;
        
        // Convert stroke to image-relative coordinates
        const imageRelativeStroke = stroke.map(p => ({
          x: p.x - displayImageOffsetX,
          y: p.y - displayImageOffsetY,
        }));
        
        // Get polygon points for this stroke (includes stroke width)
        const polygonPoints = strokeToFilledPolygon(imageRelativeStroke, effectiveStrokeWidth);
        if (!polygonPoints) continue;
        
        // Parse polygon points to find bounds in display coordinates
        const pairs = polygonPoints.split(' ').filter(p => p.includes(','));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pair of pairs) {
          const [x, y] = pair.split(',').map(Number);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        
        if (minX < Infinity) {
          // Clamp to display bounds
          minX = Math.max(0, minX);
          minY = Math.max(0, minY);
          maxX = Math.min(scaledContainerWidth, maxX);
          maxY = Math.min(scaledContainerHeight, maxY);
          
          // Convert to original image coordinates
          const origX = Math.round(minX * scaleX);
          const origY = Math.round(minY * scaleY);
          const origWidth = Math.round((maxX - minX) * scaleX);
          const origHeight = Math.round((maxY - minY) * scaleY);
          
          // Filter out very small strokes (accidental touches) - must be at least 10px in both dims
          if (origWidth < 10 || origHeight < 10) {
            logger.log('[ImageHighlighter] Filtering out small stroke:', origWidth, 'x', origHeight);
            continue;
          }
          
          // Clamp to original image bounds
          rawBounds.push({
            x: Math.max(0, Math.min(origX, imageWidth - 1)),
            y: Math.max(0, Math.min(origY, imageHeight - 1)),
            width: Math.max(1, Math.min(origWidth, imageWidth - origX)),
            height: Math.max(1, Math.min(origHeight, imageHeight - origY)),
          });
        }
      }
      
      // Merge overlapping bounds to avoid duplicate OCR
      const mergedBounds = mergeOverlappingBounds(rawBounds);
      
      logger.log('[ImageHighlighter] getStrokeBoundsInOriginalCoords:', rawBounds.length, 'raw ->', mergedBounds.length, 'merged');
      return mergedBounds;
    },
    captureCompositeStrokeImage: async () => {
      if (strokes.length === 0 || !measuredLayout || scaledContainerWidth === 0) return null;
      
      const scaleX = imageWidth / scaledContainerWidth;
      const scaleY = imageHeight / scaledContainerHeight;
      const rawBounds: Array<{ x: number; y: number; width: number; height: number }> = [];
      
      for (const stroke of strokes) {
        if (stroke.length < 2) continue;
        const imageRelativeStroke = stroke.map(p => ({
          x: p.x - displayImageOffsetX,
          y: p.y - displayImageOffsetY,
        }));
        const polygonPoints = strokeToFilledPolygon(imageRelativeStroke, effectiveStrokeWidth);
        if (!polygonPoints) continue;
        
        const pairs = polygonPoints.split(' ').filter(p => p.includes(','));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pair of pairs) {
          const [x, y] = pair.split(',').map(Number);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        if (minX >= Infinity) continue;
        
        minX = Math.max(0, minX);
        minY = Math.max(0, minY);
        maxX = Math.min(scaledContainerWidth, maxX);
        maxY = Math.min(scaledContainerHeight, maxY);
        
        const origX = Math.round(minX * scaleX);
        const origY = Math.round(minY * scaleY);
        const origWidth = Math.round((maxX - minX) * scaleX);
        const origHeight = Math.round((maxY - minY) * scaleY);
        
        if (origWidth < 10 || origHeight < 10) continue;
        
        rawBounds.push({
          x: Math.max(0, Math.min(origX, imageWidth - 1)),
          y: Math.max(0, Math.min(origY, imageHeight - 1)),
          width: Math.max(1, Math.min(origWidth, imageWidth - origX)),
          height: Math.max(1, Math.min(origHeight, imageHeight - origY)),
        });
      }
      
      if (rawBounds.length === 0) return null;
      
      let mergedMinX = Infinity, mergedMinY = Infinity, mergedMaxX = -Infinity, mergedMaxY = -Infinity;
      for (const b of rawBounds) {
        mergedMinX = Math.min(mergedMinX, b.x);
        mergedMinY = Math.min(mergedMinY, b.y);
        mergedMaxX = Math.max(mergedMaxX, b.x + b.width);
        mergedMaxY = Math.max(mergedMaxY, b.y + b.height);
      }
      const mergedWidth = Math.round(mergedMaxX - mergedMinX);
      const mergedHeight = Math.round(mergedMaxY - mergedMinY);
      
      // ROW-BASED BOUNDING BOXES: Group strokes by their ORIGINAL center Y (not inflated)
      // This prevents strokes on different text lines from merging into one row
      const compositeStrokeWidth = effectiveStrokeWidth + COMPOSITE_MASK_STROKE_INFLATION;
      
      // Build per-stroke data: original centerY for grouping, asymmetric bounds for masking
      // HORIZONTAL: Use inflated bounds (captures full character width)
      // VERTICAL: Use original stroke bounds + small padding (avoids barely-touched adjacent text)
      const strokeData: Array<{
        originalCenterY: number; // From raw stroke points - for row grouping
        minX: number; minY: number; maxX: number; maxY: number; // Asymmetric bounds - for masking
      }> = [];
      
      for (const stroke of strokes) {
        if (stroke.length < 2) continue;
        const imageRelativeStroke = stroke.map(p => ({
          x: p.x - displayImageOffsetX,
          y: p.y - displayImageOffsetY,
        }));
        
        // Compute ORIGINAL stroke vertical bounds (tight, from raw points)
        const rawYs = imageRelativeStroke.map(p => p.y * scaleY - mergedMinY);
        const originalMinY = Math.min(...rawYs);
        const originalMaxY = Math.max(...rawYs);
        const originalCenterY = (originalMinY + originalMaxY) / 2;
        
        // Compute INFLATED horizontal bounds (from polygon, captures full char width)
        const polygonPointsStr = strokeToFilledPolygon(imageRelativeStroke, compositeStrokeWidth);
        if (!polygonPointsStr) continue;
        
        const pairs = polygonPointsStr.split(' ').filter(p => p.includes(','));
        let sMinX = Infinity, sMaxX = -Infinity;
        for (const pair of pairs) {
          const [px] = pair.split(',').map(Number);
          const vx = px * scaleX - mergedMinX;
          sMinX = Math.min(sMinX, vx);
          sMaxX = Math.max(sMaxX, vx);
        }
        
        if (sMinX < Infinity) {
          // Use TIGHT vertical bounds (original stroke + small padding) to avoid barely-touched text
          const tightMinY = Math.max(0, originalMinY - ROW_VERTICAL_PADDING);
          const tightMaxY = Math.min(mergedHeight, originalMaxY + ROW_VERTICAL_PADDING);
          strokeData.push({ originalCenterY, minX: sMinX, minY: tightMinY, maxX: sMaxX, maxY: tightMaxY });
        }
      }
      
      if (strokeData.length === 0) return null;
      
      // Group strokes into rows based on ORIGINAL centerY (tight threshold)
      // Strokes are on the same row only if their original centers are very close
      const ROW_CENTER_THRESHOLD = 15; // pixels - strokes with centers within this distance = same row
      strokeData.sort((a, b) => a.originalCenterY - b.originalCenterY);
      
      const rows: Array<Array<typeof strokeData[0]>> = [];
      for (const sd of strokeData) {
        // Find a row with similar centerY
        let foundRow = false;
        for (const row of rows) {
          const rowAvgCenterY = row.reduce((sum, r) => sum + r.originalCenterY, 0) / row.length;
          if (Math.abs(sd.originalCenterY - rowAvgCenterY) <= ROW_CENTER_THRESHOLD) {
            row.push(sd);
            foundRow = true;
            break;
          }
        }
        if (!foundRow) {
          rows.push([sd]);
        }
      }
      
      // Compute bounding rectangle for each row (using inflated bounds)
      // Also track the original centerY for later clipping
      const rowRectsWithCenter: Array<{ x: number; y: number; width: number; height: number; centerY: number }> = [];
      for (const row of rows) {
        const rMinX = Math.max(0, Math.round(Math.min(...row.map(r => r.minX))));
        const rMinY = Math.max(0, Math.round(Math.min(...row.map(r => r.minY))));
        const rMaxX = Math.min(mergedWidth, Math.round(Math.max(...row.map(r => r.maxX))));
        const rMaxY = Math.min(mergedHeight, Math.round(Math.max(...row.map(r => r.maxY))));
        const avgCenterY = row.reduce((sum, r) => sum + r.originalCenterY, 0) / row.length;
        rowRectsWithCenter.push({ x: rMinX, y: rMinY, width: rMaxX - rMinX, height: rMaxY - rMinY, centerY: avgCenterY });
      }
      
      // Sort rows top-to-bottom by centerY
      rowRectsWithCenter.sort((a, b) => a.centerY - b.centerY);
      
      // Clip adjacent rows to prevent overlap: split at midpoint between row centers
      const rowRects: Array<{ x: number; y: number; width: number; height: number }> = [];
      for (let i = 0; i < rowRectsWithCenter.length; i++) {
        const curr = rowRectsWithCenter[i];
        let clippedMinY = curr.y;
        let clippedMaxY = curr.y + curr.height;
        
        // Clip top against previous row
        if (i > 0) {
          const prev = rowRectsWithCenter[i - 1];
          const midY = Math.round((prev.centerY + curr.centerY) / 2);
          clippedMinY = Math.max(clippedMinY, midY);
        }
        
        // Clip bottom against next row
        if (i < rowRectsWithCenter.length - 1) {
          const next = rowRectsWithCenter[i + 1];
          const midY = Math.round((curr.centerY + next.centerY) / 2);
          clippedMaxY = Math.min(clippedMaxY, midY);
        }
        
        const clippedHeight = Math.max(1, clippedMaxY - clippedMinY);
        
        // Add horizontal padding to prevent edge character clipping, clamped to merged region bounds
        const paddedX = Math.max(0, curr.x - ROW_HORIZONTAL_PADDING);
        const paddedWidth = Math.min(mergedWidth - paddedX, curr.width + ROW_HORIZONTAL_PADDING * 2);
        
        rowRects.push({ x: paddedX, y: clippedMinY, width: paddedWidth, height: clippedHeight });
      }
      
      logger.log('[ImageHighlighter] Row-based bounds:', rowRects.length, 'rows from', strokeData.length, 'strokes',
        'rowHeights:', rowRects.map(r => r.height), 'with', ROW_HORIZONTAL_PADDING, 'px horizontal padding');
      
      if (rowRects.length === 0) return null;
      
      let imageDataUri: string;
      try {
        imageDataUri = await imageUriToBase64DataUri(imageUri);
      } catch (e) {
        logger.warn('[ImageHighlighter] Composite: failed to get base64 for image, using uri:', e);
        imageDataUri = imageUri;
      }
      
      compositeImagesLoadedRef.current = 0;
      setCompositeCaptureParams({
        strokeBounds: rawBounds,
        rowRects, // Row-based rectangles for accurate staircase mask
        imageDataUri,
        mergedMinX,
        mergedMinY,
        mergedWidth,
        mergedHeight,
      });
      setIsCompositeCaptureReady(true);
      
      const maxWait = 2000;
      const start = Date.now();
      while (compositeImagesLoadedRef.current < 1 && (Date.now() - start) < maxWait) {
        await new Promise(r => setTimeout(r, 50));
      }
      await new Promise(r => setTimeout(r, 150));
      
      if (!compositeCaptureRef.current) {
        setIsCompositeCaptureReady(false);
        setCompositeCaptureParams(null);
        return null;
      }
      
      try {
        const uri = await captureRef(compositeCaptureRef, {
          format: 'jpg',
          quality: 0.95,
          result: 'tmpfile',
        });
        logger.log('[ImageHighlighter] Composite captured:', mergedWidth, 'x', mergedHeight);
        return { uri, width: mergedWidth, height: mergedHeight };
      } catch (e) {
        logger.error('[ImageHighlighter] Composite capture failed:', e);
        return null;
      } finally {
        setIsCompositeCaptureReady(false);
        setCompositeCaptureParams(null);
      }
    },
    captureMaskedHighlight: async () => {
      if (strokes.length === 0 || !measuredLayout || scaledContainerWidth === 0) {
        logger.warn('[ImageHighlighter] Cannot capture mask: no strokes or layout not ready');
        return null;
      }
      
      try {
        // Log stroke info for debugging
        logger.log('[ImageHighlighter] Mask capture - strokes:', strokes.length, 
          'displayOffset:', displayImageOffsetX, displayImageOffsetY,
          'imageSize:', scaledContainerWidth, 'x', scaledContainerHeight);
        if (strokes.length > 0 && strokes[0].length > 0) {
          logger.log('[ImageHighlighter] First stroke first point (container):', strokes[0][0]);
          logger.log('[ImageHighlighter] First stroke first point (image-relative):', {
            x: strokes[0][0].x - displayImageOffsetX,
            y: strokes[0][0].y - displayImageOffsetY,
          });
        }
        
        // Trigger mask capture view rendering
        setMaskImageLoaded(false);
        setIsMaskCaptureReady(true);
        
        // Wait for Image onLoad callback (with timeout)
        const maxWait = 2000;
        const startTime = Date.now();
        while (!maskImageLoadedRef.current && (Date.now() - startTime) < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        if (!maskImageLoadedRef.current) {
          logger.warn('[ImageHighlighter] Mask image did not load in time');
        }
        
        // Extra time for SVG overlay to render after image loads
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!maskCaptureRef.current) {
          logger.warn('[ImageHighlighter] Mask capture ref not available');
          setIsMaskCaptureReady(false);
          return null;
        }
        
        const uri = await captureRef(maskCaptureRef, {
          format: 'jpg',
          quality: 0.95,
          result: 'tmpfile',
        });
        
        logger.log('[ImageHighlighter] Mask captured successfully, dimensions:', scaledContainerWidth, 'x', scaledContainerHeight, 'imageLoaded:', maskImageLoadedRef.current);
        
        setIsMaskCaptureReady(false);
        setMaskImageLoaded(false);
        
        return {
          uri,
          width: Math.round(scaledContainerWidth),
          height: Math.round(scaledContainerHeight),
        };
      } catch (error) {
        logger.error('[ImageHighlighter] Failed to capture mask:', error);
        setIsMaskCaptureReady(false);
        setMaskImageLoaded(false);
        return null;
      }
    },

    // --- New Rotation Control Methods ---
    undoRotationChange: () => {
      const EPSILON = 0.01;
      if (Math.abs(rotation - initialRotation) > EPSILON) {
        logger.log('[ImageHighlighter] Undo rotation from:', rotation, 'to (initial):', initialRotation);
        setRotation(initialRotation);
        return true;
      }
      logger.log('[ImageHighlighter] Cannot undo rotation (already at initial session rotation).');
      return false;
    },
    redoRotationChange: () => {
      logger.log('[ImageHighlighter] Redo not supported in this model.');
      return false; // Redo is not supported in the simplified model
    },
    confirmCurrentRotation: async () => {
      if (!imageUri) {
        logger.warn('[ImageHighlighter] Confirm rotation called without imageUri.');
        return null;
      }
      
      logger.log('[ImageHighlighter] Starting rotation confirmation with image dimensions:', imageWidth, 'x', imageHeight);
      
      // Set processing state first thing to prevent UI flicker
      setIsProcessing(true);
      
      // Check if there's any effective rotation compared to the start of the session
      // Use a small epsilon for float comparison
      const hasEffectiveRotation = Math.abs(rotation - initialRotation) > 0.1;

      if (!hasEffectiveRotation) {
        logger.log('[ImageHighlighter] No significant rotation change to confirm.');
        setRotation(0); 
        setInitialRotation(0);
        setRotateMode(false);  // Explicitly exit rotate mode
        setIsProcessing(false);
        // Return original dimensions
        return { uri: imageUri, width: imageWidth, height: imageHeight };
      }

      logger.log('[ImageHighlighter] Confirming rotation:', rotation);
      
      try {
        // Perform the rotation directly using ImageManipulator for simplicity
        // This avoids any potential dimension issues from complex processing chains
        // Use PNG format to avoid white background in rotated corners (JPEG fills with white)
        const result = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ rotate: rotation }],
          { 
            format: ImageManipulator.SaveFormat.PNG,
          }
        );
        
        logger.log('[ImageHighlighter] Rotation applied. New dimensions:', result.width, 'x', result.height, 
          '(original was', imageWidth, 'x', imageHeight, ')');
        
        // After confirmation, reset rotation state for future operations
        setRotation(0); 
        setInitialRotation(0);
        setRotateMode(false);  // Explicitly exit rotate mode
        
        // Return the dimensions directly from the result
        return { 
          uri: result.uri, 
          width: result.width,
          height: result.height
        };
      } catch (error) {
        logger.error('[ImageHighlighter] Failed to apply rotation:', error);
        setRotation(initialRotation);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    cancelRotationChanges: () => {
      logger.log('[ImageHighlighter] Cancelling rotation changes. Reverting from', rotation, 'to', initialRotation);
      setRotation(initialRotation); // Revert to the rotation stored when mode was entered
      // setRotationSessionHistory([]); // REMOVED
      // setCurrentRotationSessionIndex(-1); // REMOVED
      // Note: setRotateMode(false) will be called by KanjiScanner
    },
    getRotationState: () => {
      const EPSILON = 0.01; // For float comparisons
      return {
        currentRotation: rotation,
        initialRotationOnEnter: initialRotation,
        canUndo: Math.abs(rotation - initialRotation) > EPSILON,
        canRedo: false, // Redo is not supported in this model
        hasRotated: Math.abs(rotation - initialRotation) > 0.1,
      };
    },
  }));

  // Helper function to check if a point is within a handle's touch area
  const isPointInHandleArea = (pointX: number, pointY: number, handleX: number, handleY: number) => {
    const touchRadius = CROP_HANDLE_TOUCH_AREA / 2;
    return (
      Math.abs(pointX - handleX) <= touchRadius &&
      Math.abs(pointY - handleY) <= touchRadius
    );
  };

  // Helper function to calculate angle between two points relative to the center
  // Uses refs to always access current layout values
  const calculateAngleFromRefs = useCallback((x: number, y: number) => {
    const centerX = scaledContainerWidthRef.current / 2;
    const centerY = scaledContainerHeightRef.current / 2;
    return Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
  }, []);

  // Memoized PanResponder - uses refs to always access current state values
  // This prevents stale closure issues that can occur when PanResponder is recreated on every render
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      const offset = containerScreenOffsetRef.current;
      const layout = measuredLayoutRef.current;
      if (!offset || !layout) return false; // Not ready yet
      
      const { pageX, pageY } = evt.nativeEvent;
      const x = pageX - offset.x;
      const y = pageY - offset.y;

      const touchTolerance = 1.5; // pixels of tolerance

      const isWithinHorizontalBounds = x >= -touchTolerance && x <= layout.width + touchTolerance;
      const isWithinVerticalBounds = y >= -touchTolerance && y <= layout.height + touchTolerance;
      
      return isWithinHorizontalBounds && isWithinVerticalBounds;
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      const offset = containerScreenOffsetRef.current;
      if (!offset) return false;
      
      const { pageX } = evt.nativeEvent;
      const currentX = pageX - offset.x;
      
      // Don't capture gestures that start very close to the left edge to avoid interfering with back swipe
      if (currentX < 30 && !cropModeRef.current && !rotateModeRef.current) {
        return false;
      }
      
      return (highlightModeActiveRef.current || cropModeRef.current || rotateModeRef.current ||
             Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10);
    },
    onPanResponderGrant: (evt) => {
      const offset = containerScreenOffsetRef.current;
      const layout = measuredLayoutRef.current;
      if (!offset || !layout) return;

      const { pageX, pageY } = evt.nativeEvent;
      
      const currentX = pageX - offset.x;
      const currentY = pageY - offset.y;
      
      if (rotateModeRef.current) {
        const adjustedXForRotation = currentX - displayImageOffsetXRef.current;
        const adjustedYForRotation = currentY - displayImageOffsetYRef.current;
        const currentFingerAngle = calculateAngleFromRefs(adjustedXForRotation, adjustedYForRotation);
        imageRotationAtGestureStartRef.current = rotationRef.current; 
        lastVisuallyAppliedRotationRef.current = rotationRef.current; 
        previousFingerAngleRef.current = currentFingerAngle;
        accumulatedAngleDeltaForGestureRef.current = 0; 
      }
      else if (cropModeRef.current) {
        const currentCropBox = cropBoxRef.current;
        if (activeCropHandleRef.current === null && !isCropDrawingRef.current && (currentCropBox.width === 0 && currentCropBox.height === 0)) {
          const clampedX = Math.max(-EDGE_TOLERANCE, Math.min((layout?.width || 0) + EDGE_TOLERANCE, currentX));
          const clampedY = Math.max(-EDGE_TOLERANCE, Math.min((layout?.height || 0) + EDGE_TOLERANCE, currentY));
          
          setIsCropDrawing(true);
          setCropBox({
            x: clampedX,
            y: clampedY,
            width: 0,
            height: 0
          });
        } else if (currentCropBox.width > 0 && currentCropBox.height > 0) {
          const { x, y, width, height } = currentCropBox;
          if (isPointInHandleArea(currentX, currentY, x, y)) {
            setActiveCropHandle('topLeft');
          } else if (isPointInHandleArea(currentX, currentY, x + width, y)) {
            setActiveCropHandle('topRight');
          } else if (isPointInHandleArea(currentX, currentY, x, y + height)) {
            setActiveCropHandle('bottomLeft');
          } else if (isPointInHandleArea(currentX, currentY, x + width, y + height)) {
            setActiveCropHandle('bottomRight');
          } else if (currentX >= x && currentX <= x + width && currentY >= y && currentY <= y + height) {
            setActiveCropHandle('move');
          }
        }
      } 
      else if (highlightModeActiveRef.current) {
        const preciseX = pageX - offset.x;
        const preciseY = pageY - offset.y;
        const w = layout?.width || 0;
        const h = layout?.height || 0;
        if (preciseX < HIGHLIGHT_FRAME_INSET || preciseX > w - HIGHLIGHT_FRAME_INSET ||
            preciseY < HIGHLIGHT_FRAME_INSET || preciseY > h - HIGHLIGHT_FRAME_INSET) {
          return;
        }
        const containerMinX = HIGHLIGHT_FRAME_INSET;
        const containerMaxX = w - HIGHLIGHT_FRAME_INSET;
        const containerMinY = HIGHLIGHT_FRAME_INSET;
        const containerMaxY = h - HIGHLIGHT_FRAME_INSET;

        const clampedX = Math.max(containerMinX, Math.min(containerMaxX, preciseX));
        const clampedY = Math.max(containerMinY, Math.min(containerMaxY, preciseY));

        setIsDrawing(true);
        onHighlightDrawingChange?.(true);
        setCurrentStroke([{ x: clampedX, y: clampedY }]);
        lastPointTimeRef.current = Date.now();
      }
    },
    onPanResponderMove: (evt, gestureState: PanResponderGestureState) => {
      const offset = containerScreenOffsetRef.current;
      const layout = measuredLayoutRef.current;
      if (!offset) return;

      const { pageX, pageY } = evt.nativeEvent;
      
      const currentX = pageX - offset.x;
      const currentY = pageY - offset.y;
      
      if (rotateModeRef.current) {
        const adjustedXForRotation = currentX - displayImageOffsetXRef.current;
        const adjustedYForRotation = currentY - displayImageOffsetYRef.current;
        
        if (previousFingerAngleRef.current === null) { 
          const initAngle = calculateAngleFromRefs(adjustedXForRotation, adjustedYForRotation);
          previousFingerAngleRef.current = initAngle;
          accumulatedAngleDeltaForGestureRef.current = 0; 
          imageRotationAtGestureStartRef.current = rotationRef.current;
          lastVisuallyAppliedRotationRef.current = rotationRef.current;
          return;
        }

        const currentFingerAngle = calculateAngleFromRefs(adjustedXForRotation, adjustedYForRotation);
        let incrementalAngleDiff = currentFingerAngle - previousFingerAngleRef.current;
        
        if (incrementalAngleDiff > 180) incrementalAngleDiff -= 360;
        if (incrementalAngleDiff < -180) incrementalAngleDiff += 360;

        accumulatedAngleDeltaForGestureRef.current += incrementalAngleDiff; 
        previousFingerAngleRef.current = currentFingerAngle; 

        const targetRawRotation = imageRotationAtGestureStartRef.current + accumulatedAngleDeltaForGestureRef.current;
        const newSmoothedRotation =
          lastVisuallyAppliedRotationRef.current * (1 - ROTATION_SMOOTHING_FACTOR) +
          targetRawRotation * ROTATION_SMOOTHING_FACTOR;
        
        setRotation(newSmoothedRotation);
        lastVisuallyAppliedRotationRef.current = newSmoothedRotation; 
      }
      else if (cropModeRef.current && isCropDrawingRef.current) {
        const now = Date.now();
        if (now - lastHapticDragTimeRef.current >= HAPTIC_DRAG_INTERVAL_MS) {
          lastHapticDragTimeRef.current = now;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const clampedX = Math.max(-EDGE_TOLERANCE, Math.min((layout?.width || 0) + EDGE_TOLERANCE, currentX));
        const clampedY = Math.max(-EDGE_TOLERANCE, Math.min((layout?.height || 0) + EDGE_TOLERANCE, currentY));

        setCropBox(prev => ({
          ...prev,
          width: clampedX - prev.x,
          height: clampedY - prev.y,
        }));
      }
      else if (cropModeRef.current && activeCropHandleRef.current) {
        const now = Date.now();
        if (now - lastHapticDragTimeRef.current >= HAPTIC_DRAG_INTERVAL_MS) {
          lastHapticDragTimeRef.current = now;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const { dx, dy } = gestureState;
        const { x, y, width, height } = cropBoxRef.current; 
        const currentHandle = activeCropHandleRef.current;
        
        switch (currentHandle) {
          case 'topLeft':
            setCropBox({
              x: Math.min(x + dx, x + width - CROP_HANDLE_SIZE),
              y: Math.min(y + dy, y + height - CROP_HANDLE_SIZE),
              width: Math.max(width - dx, CROP_HANDLE_SIZE),
              height: Math.max(height - dy, CROP_HANDLE_SIZE)
            });
            break;
          case 'topRight':
            setCropBox({
              x,
              y: Math.min(y + dy, y + height - CROP_HANDLE_SIZE),
              width: Math.max(width + dx, CROP_HANDLE_SIZE),
              height: Math.max(height - dy, CROP_HANDLE_SIZE)
            });
            break;
          case 'bottomLeft':
            setCropBox({
              x: Math.min(x + dx, x + width - CROP_HANDLE_SIZE),
              y,
              width: Math.max(width - dx, CROP_HANDLE_SIZE),
              height: Math.max(height + dy, CROP_HANDLE_SIZE)
            });
            break;
          case 'bottomRight':
            setCropBox({
              x,
              y,
              width: Math.max(width + dx, CROP_HANDLE_SIZE),
              height: Math.max(height + dy, CROP_HANDLE_SIZE)
            });
            break;
          case 'move':
            const wrapperWidth = layout?.width || 0;
            const wrapperHeight = layout?.height || 0;
            setCropBox({
              x: Math.max(0, Math.min(x + dx, wrapperWidth - width)),
              y: Math.max(0, Math.min(y + dy, wrapperHeight - height)),
              width,
              height
            });
            break;
        }
        gestureState.dx = 0;
        gestureState.dy = 0;
      }
      else if (isDrawingRef.current && highlightModeActiveRef.current) {
        const now = Date.now();
        if (now - lastPointTimeRef.current < POINT_THROTTLE_MS) {
          return;
        }
        lastPointTimeRef.current = now;
        if (now - lastHapticDragTimeRef.current >= HAPTIC_DRAG_INTERVAL_MS) {
          lastHapticDragTimeRef.current = now;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const preciseX = pageX - offset.x;
        const preciseY = pageY - offset.y;
        const w = layout?.width || 0;
        const h = layout?.height || 0;
        const containerMinX = HIGHLIGHT_FRAME_INSET;
        const containerMaxX = w - HIGHLIGHT_FRAME_INSET;
        const containerMinY = HIGHLIGHT_FRAME_INSET;
        const containerMaxY = h - HIGHLIGHT_FRAME_INSET;

        const clampedX = Math.max(containerMinX, Math.min(containerMaxX, preciseX));
        const clampedY = Math.max(containerMinY, Math.min(containerMaxY, preciseY));

        setCurrentStroke(prev => [...prev, { x: clampedX, y: clampedY }]);
      }
    },
    onPanResponderRelease: async (evt, gestureState: PanResponderGestureState) => {
      const offset = containerScreenOffsetRef.current;
      const layout = measuredLayoutRef.current;
      if (!offset) return;

      const { pageX, pageY } = evt.nativeEvent; 
      
      const finalCurrentX = pageX - offset.x;
      const finalCurrentY = pageY - offset.y;
      
      if (rotateModeRef.current) {
        const finalAdjustedXForRotation = finalCurrentX - displayImageOffsetXRef.current;
        const finalAdjustedYForRotation = finalCurrentY - displayImageOffsetYRef.current;

        if (previousFingerAngleRef.current !== null) {
            const currentFingerAngle = calculateAngleFromRefs(finalAdjustedXForRotation, finalAdjustedYForRotation);
            let incrementalAngleDiff = currentFingerAngle - previousFingerAngleRef.current;
            if (incrementalAngleDiff > 180) incrementalAngleDiff -= 360;
            if (incrementalAngleDiff < -180) incrementalAngleDiff += 360;
            accumulatedAngleDeltaForGestureRef.current += incrementalAngleDiff;
        }

        const finalTargetRawRotation = imageRotationAtGestureStartRef.current + accumulatedAngleDeltaForGestureRef.current;
        setRotation(finalTargetRawRotation);
        lastVisuallyAppliedRotationRef.current = finalTargetRawRotation; 
        previousFingerAngleRef.current = null; 
      }
      else if (cropModeRef.current) {
        setActiveCropHandle(null);
        if (isCropDrawingRef.current) {
          setIsCropDrawing(false);
          const { x, y, width, height } = cropBoxRef.current;
          const normalizedX = width < 0 ? x + width : x;
          const normalizedY = height < 0 ? y + height : y;
          const normalizedWidth = Math.abs(width);
          const normalizedHeight = Math.abs(height);
          setCropBox({ x: normalizedX, y: normalizedY, width: normalizedWidth, height: normalizedHeight });
        }
      }
      
      if (isDrawingRef.current && highlightModeActiveRef.current) {
        setIsDrawing(false);
        onHighlightDrawingChange?.(false);

        const finalPreciseX = pageX - offset.x;
        const finalPreciseY = pageY - offset.y;
        const w = layout?.width || 0;
        const h = layout?.height || 0;
        const containerMinX = HIGHLIGHT_FRAME_INSET;
        const containerMaxX = Math.max(containerMinX, w - HIGHLIGHT_FRAME_INSET);
        const containerMinY = HIGHLIGHT_FRAME_INSET;
        const containerMaxY = Math.max(containerMinY, h - HIGHLIGHT_FRAME_INSET);
        
        const finalClampedX = Math.max(containerMinX, Math.min(containerMaxX, finalPreciseX));
        const finalClampedY = Math.max(containerMinY, Math.min(containerMaxY, finalPreciseY));
        
        // Note: We need to access currentStroke and strokes via a callback pattern
        // since they're not in refs. Using functional updates handles this.
        setCurrentStroke(prevCurrentStroke => {
          const finalStroke = [...prevCurrentStroke, { x: finalClampedX, y: finalClampedY }];
          
          setStrokes(prevStrokes => {
            const allStrokes = [...prevStrokes, finalStroke];
            
            // Trigger region selection callback if applicable
            if (onRegionSelected && finalStroke.length > 1) {
              const allPoints = allStrokes.flat();
              
              if (allPoints.length > 0) {
                const imageMinX = displayImageOffsetXRef.current;
                const imageMaxX = displayImageOffsetXRef.current + scaledContainerWidthRef.current;
                const imageMinY = displayImageOffsetYRef.current;
                const imageMaxY = displayImageOffsetYRef.current + scaledContainerHeightRef.current;
                
                const pointsWithinImage = allPoints.filter(p => 
                  p.x >= imageMinX && 
                  p.x <= imageMaxX && 
                  p.y >= imageMinY && 
                  p.y <= imageMaxY
                );
                
                if (pointsWithinImage.length > 0) {
                  const minX = Math.min(...pointsWithinImage.map(p => p.x));
                  const maxX = Math.max(...pointsWithinImage.map(p => p.x));
                  const minY = Math.min(...pointsWithinImage.map(p => p.y));
                  const maxY = Math.max(...pointsWithinImage.map(p => p.y));
                  
                  const padding = 2;
                  
                  const paddedMinX = Math.max(imageMinX, minX - padding);
                  const paddedMaxX = Math.min(imageMaxX, maxX + padding);
                  const paddedMinY = Math.max(imageMinY, minY - padding);
                  const paddedMaxY = Math.min(imageMaxY, maxY + padding);

                  const imageRelativeMinX = paddedMinX - displayImageOffsetXRef.current;
                  const imageRelativeMinY = paddedMinY - displayImageOffsetYRef.current;
                  const imageRelativeMaxX = paddedMaxX - displayImageOffsetXRef.current;
                  const imageRelativeMaxY = paddedMaxY - displayImageOffsetYRef.current;

                  const reportedWidth = imageRelativeMaxX - imageRelativeMinX;
                  const reportedHeight = imageRelativeMaxY - imageRelativeMinY;
                  
                  const scaledW = scaledContainerWidthRef.current;
                  const scaledH = scaledContainerHeightRef.current;
                  
                  const finalX = Math.max(0, Math.min(imageRelativeMinX, scaledW - 1));
                  const finalY = Math.max(0, Math.min(imageRelativeMinY, scaledH - 1));
                  const finalWidth = Math.max(1, Math.min(reportedWidth, scaledW - finalX));
                  const finalHeight = Math.max(1, Math.min(reportedHeight, scaledH - finalY));
                  
                  // Convert strokes to image-relative coordinates for mask generation
                  const offsetX = displayImageOffsetXRef.current;
                  const offsetY = displayImageOffsetYRef.current;
                  const strokesImageRelative: Point[][] = allStrokes.map(stroke =>
                    stroke
                      .filter(p => p.x >= imageMinX && p.x <= imageMaxX && p.y >= imageMinY && p.y <= imageMaxY)
                      .map(p => ({ x: p.x - offsetX, y: p.y - offsetY }))
                  ).filter(s => s.length > 0);

                  const regionForParent = {
                    x: finalX,
                    y: finalY,
                    width: finalWidth,
                    height: finalHeight,
                    detectedText: [],
                    rotation: rotationRef.current,
                    strokes: strokesImageRelative,
                    strokeWidth: effectiveStrokeWidth,
                  };

                  // Defer callback to avoid state update conflicts
                  setTimeout(() => onRegionSelected(regionForParent), 0);
                }
              }
            }
            
            return allStrokes;
          });
          
          return []; // Clear current stroke
        });
      }
    },
  }), [calculateAngleFromRefs, onRegionSelected, onHighlightDrawingChange, effectiveStrokeWidth]);

  // Helper function to convert points array to smooth SVG path using quadratic bezier curves
  const pointsToSVGPath = (points: Point[]): string => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      // Single point - draw a small circle
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 1} ${points[0].y}`;
    }
    
    let path = `M ${points[0].x} ${points[0].y}`;
    
    // For just 2 points, draw a straight line
    if (points.length === 2) {
      path += ` L ${points[1].x} ${points[1].y}`;
      return path;
    }
    
    // For 3+ points, use quadratic bezier curves for smoothing
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // Control point is the current point
      // End point is midway to the next point for smoother curves
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      
      path += ` Q ${current.x} ${current.y}, ${midX} ${midY}`;
    }
    
    // Connect to the last point
    const last = points[points.length - 1];
    path += ` L ${last.x} ${last.y}`;
    
    return path;
  };

  // Merge overlapping or adjacent rectangles to avoid duplicate OCR
  const mergeOverlappingBounds = (
    bounds: Array<{ x: number; y: number; width: number; height: number }>
  ): Array<{ x: number; y: number; width: number; height: number }> => {
    if (bounds.length <= 1) return bounds;
    
    // Helper to check if two rectangles overlap or are adjacent (within padding)
    const rectsOverlap = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
      padding = 20 // Merge if within 20 pixels
    ): boolean => {
      return !(
        a.x + a.width + padding < b.x ||
        b.x + b.width + padding < a.x ||
        a.y + a.height + padding < b.y ||
        b.y + b.height + padding < a.y
      );
    };
    
    // Helper to merge two rectangles into their bounding box
    const mergeRects = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number }
    ): { x: number; y: number; width: number; height: number } => {
      const minX = Math.min(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxX = Math.max(a.x + a.width, b.x + b.width);
      const maxY = Math.max(a.y + a.height, b.y + b.height);
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    };
    
    // Iteratively merge until no more merges are possible
    let merged = [...bounds];
    let changed = true;
    
    while (changed) {
      changed = false;
      const newMerged: typeof merged = [];
      const used = new Set<number>();
      
      for (let i = 0; i < merged.length; i++) {
        if (used.has(i)) continue;
        
        let current = merged[i];
        
        for (let j = i + 1; j < merged.length; j++) {
          if (used.has(j)) continue;
          
          if (rectsOverlap(current, merged[j])) {
            current = mergeRects(current, merged[j]);
            used.add(j);
            changed = true;
          }
        }
        
        newMerged.push(current);
        used.add(i);
      }
      
      merged = newMerged;
    }
    
    // Sort by y position (top to bottom) for natural reading order
    merged.sort((a, b) => a.y - b.y);
    
    return merged;
  };

  // Compute convex hull of a set of points using Graham scan algorithm
  // This creates a single boundary polygon that wraps all points with no internal gaps
  const computeConvexHull = (points: Point[]): Point[] => {
    if (points.length < 3) return points;
    
    // Find the point with lowest y (and leftmost if tie)
    let start = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < points[start].y || 
          (points[i].y === points[start].y && points[i].x < points[start].x)) {
        start = i;
      }
    }
    const pivot = points[start];
    
    // Sort points by polar angle with respect to pivot
    const sorted = points
      .filter((_, i) => i !== start)
      .map(p => ({ point: p, angle: Math.atan2(p.y - pivot.y, p.x - pivot.x) }))
      .sort((a, b) => a.angle - b.angle || 
        (Math.hypot(a.point.x - pivot.x, a.point.y - pivot.y) - 
         Math.hypot(b.point.x - pivot.x, b.point.y - pivot.y)))
      .map(item => item.point);
    
    // Cross product to determine turn direction
    const cross = (o: Point, a: Point, b: Point) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    
    const hull: Point[] = [pivot];
    for (const p of sorted) {
      // Remove points that make clockwise turn (keep only counter-clockwise)
      while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
        hull.pop();
      }
      hull.push(p);
    }
    
    return hull;
  };

  // Convert stroke to filled polygon for masking (creates a "ribbon" shape from stroke width)
  const strokeToFilledPolygon = (points: Point[], strokeW: number): string => {
    if (points.length < 2) return '';
    
    const halfWidth = strokeW / 2;
    const topPoints: Point[] = [];
    const bottomPoints: Point[] = [];
    
    for (let i = 0; i < points.length; i++) {
      const curr = points[i];
      let dx: number, dy: number;
      
      if (i === 0) {
        dx = points[1].x - curr.x;
        dy = points[1].y - curr.y;
      } else if (i === points.length - 1) {
        dx = curr.x - points[i - 1].x;
        dy = curr.y - points[i - 1].y;
      } else {
        dx = points[i + 1].x - points[i - 1].x;
        dy = points[i + 1].y - points[i - 1].y;
      }
      
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / len * halfWidth;
      const perpY = dx / len * halfWidth;
      
      topPoints.push({ x: curr.x + perpX, y: curr.y + perpY });
      bottomPoints.push({ x: curr.x - perpX, y: curr.y - perpY });
    }
    
    const allPoints = [...topPoints, ...bottomPoints.reverse()];
    return allPoints.map(p => `${p.x},${p.y}`).join(' ');
  };

  // Function to render highlight strokes
  const renderHighlightStrokes = () => {
    // Show strokes when drawing or when there are completed strokes
    if (!isDrawing && strokes.length === 0 && currentStroke.length === 0) {
      return null;
    }

    return (
      <Svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: measuredLayout?.width || 0,
          height: measuredLayout?.height || 0,
        }}
        pointerEvents="none"
      >
        {/* Render all completed strokes with rainbow animation */}
        {strokes.map((stroke, index) => {
          const pathData = pointsToSVGPath(stroke);
          return (
            <AnimatedPath
              key={`stroke-${index}`}
              d={pathData}
              stroke={rainbowColor}
              strokeWidth={effectiveStrokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.7}
            />
          );
        })}
        
        {/* Render current stroke being drawn with rainbow animation */}
        {isDrawing && currentStroke.length > 0 && (
          <AnimatedPath
            d={pointsToSVGPath(currentStroke)}
            stroke={rainbowColor}
            strokeWidth={effectiveStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.7}
          />
        )}
      </Svg>
    );
  };

  // Function to render crop box and handles
  const renderCropBox = () => {
    if (!cropMode) return null;
    
    const { x, y, width, height } = cropBox;
    
    // Don't render anything if no crop box is drawn yet
    if (width === 0 && height === 0 && !isCropDrawing) {
      return null;
    }
    
    // Get normalized coordinates for rendering
    const normalizedX = width < 0 ? x + width : x;
    const normalizedY = height < 0 ? y + height : y;
    const normalizedWidth = Math.abs(width);
    const normalizedHeight = Math.abs(height);
    
    return (
      <>
        {/* Crop box outline */}
        <Animated.View
          style={[
            styles.cropBox,
            {
              left: normalizedX,
              top: normalizedY,
              width: normalizedWidth,
              height: normalizedHeight,
              borderColor: rainbowColor,
            }
          ]}
        />
        
        {/* Crop handles have been removed as per user request */}
      </>
    );
  };

  const activateHighlightMode = () => {
    if (onActivateHighlightMode) {
      onActivateHighlightMode();
    }
  };

  // Toggle crop mode
  const toggleCropMode = () => {
    const newCropMode = !cropMode;
    setCropMode(newCropMode);
    
    if (newCropMode) {
      // Exit other modes if they're active
      if (highlightModeActive && onActivateHighlightMode) {
        onActivateHighlightMode();
      }
      if (rotateMode) {
        setRotateMode(false);
      }
      // Reset crop box to empty state
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      setIsCropDrawing(false);
    }
  };

  // Toggle rotate mode
  const toggleRotateMode = () => {
    const newRotateMode = !rotateMode;
    setRotateMode(newRotateMode);
    
    if (newRotateMode) {
      // Exit other modes if they're active
      if (highlightModeActive && onActivateHighlightMode) {
        onActivateHighlightMode();
      }
      if (cropMode) {
        setCropMode(false);
      }
      // Store the initial rotation when entering rotate mode
      setInitialRotation(rotation);
    }
  };

  // Note: Image-change reset (strokes, crop box, etc.) is handled in the earlier effect when imageUri changes.
  
  // Log when component renders with new props (for debugging specific layout/offset issues)
  React.useEffect(() => {
    /* // Removed debug log for general prop changes, was for specific debugging
    logger.log('[ImageHighlighter] Component rendered with props:', {
      imageUri,
      imageWidth,
      imageHeight,
      highlightModeActive,
      measuredLayout,
      containerScreenOffset
    });
    */
  }, [imageUri, imageWidth, imageHeight, highlightModeActive, measuredLayout, containerScreenOffset]);

  const onLayout = (event: import('react-native').LayoutChangeEvent) => {
    const { width, height, x, y } = event.nativeEvent.layout;
    // logger.log(`[ImageHighlighter] onLayout (for main styles.container): width: ${width}, height: ${height}, screenX (relative): ${x}, screenY (relative): ${y}`); // Removed debug log
    setMeasuredLayout({ width, height });

    // Measure the absolute screen position of the PanResponder view
    // This is crucial and should happen after the main container layout is established.
    if (panResponderViewRef.current) {
      panResponderViewRef.current.measure((fx, fy, w, h, px, py) => {
        // logger.log(`[ImageHighlighter] Measured panResponderViewRef: screenX:${px}, screenY:${py}, width:${w}, height:${h}`); // Removed debug log
        /* // Removed debug log
        logger.log(`[ImageHighlighter] Layout comparison - onLayout vs measure:`, {
          onLayoutWidth: width, measureWidth: w,
          onLayoutHeight: height, measureHeight: h,
          onLayoutX: x, onLayoutY: y,
          measureScreenX: px, measureScreenY: py
        });
        */
        setContainerScreenOffset({ x: px, y: py });
      });
    }
  };

  // Effect to remeasure if containerScreenOffset is somehow still null after initial layout
  React.useEffect(() => {
    if (!containerScreenOffset && panResponderViewRef.current && measuredLayout) {
      // logger.log('[ImageHighlighter] containerScreenOffset is null, attempting to remeasure...'); // This log can be kept for critical path debugging if needed, but commented out for now.
      // Small delay to ensure the component is fully rendered
      const timeoutId = setTimeout(() => {
        if (panResponderViewRef.current) {
          panResponderViewRef.current.measure((fx, fy, w, h, px, py) => {
            // logger.log(`[ImageHighlighter] Delayed remeasure: screenX:${px}, screenY:${py}, width:${w}, height:${h}`); // Also keep for critical path, commented for now.
            setContainerScreenOffset({ x: px, y: py });
          });
        }
      }, 100); // 100ms delay, adjust if needed
      return () => clearTimeout(timeoutId);
    }
  }, [containerScreenOffset, measuredLayout]);

  // Render null or a placeholder if imageWrapper layout hasn't been measured yet
  // This ensures measuredLayout is set before attempting to calculate image scaling
  if (!measuredLayout) {
    return (
      <View 
        ref={panResponderViewRef} 
        style={styles.container} 
        onLayout={onLayout}
      >
        <View style={styles.screenFrame} />
        <View style={[styles.cornerBracket, styles.cornerTopLeft]} />
        <View style={[styles.cornerBracket, styles.cornerTopRight]} />
        <View style={[styles.cornerBracket, styles.cornerBottomLeft]} />
        <View style={[styles.cornerBracket, styles.cornerBottomRight]} />
        <ActivityIndicator size="large" color={FRAME_COLOR} style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}/>
      </View>
    );
  }

  // If we don't have containerScreenOffset yet, trigger a remeasure but still render the image
  if (!containerScreenOffset && panResponderViewRef.current) {
    // Trigger a remeasure to get the screen offset
    panResponderViewRef.current.measure((fx, fy, w, h, px, py) => {
      logger.log(`[ImageHighlighter] Remeasuring panResponderViewRef: screenX:${px}, screenY:${py}, width:${w}, height:${h}`);
      setContainerScreenOffset({ x: px, y: py });
    });
  }

  // This is the main rendering path once initial layout is known.
  // The onLayout on imageWrapper will refine measurements and get screen position.
  return (
    <View 
      ref={panResponderViewRef} 
      style={styles.container} 
      onLayout={onLayout} // Keep onLayout in case of resize, it will remeasure
      {...panResponder.panHandlers}
    >
      {/* This View is the touch surface (imageWrapper equivalent) and layout root for highlights/crops */}
      <View
        ref={imageViewRef} // This is the container for the Image component itself
        style={[
          styles.imageContainer, // Should mainly handle positioning of the image within this View
          {
            // Position this container using calculated offsets to center the actual image
            position: 'absolute', // Position it within styles.container
            left: displayImageOffsetX,
            top: displayImageOffsetY,
            width: scaledContainerWidth,
            height: scaledContainerHeight,
          }
        ]}
      >
        <Animated.Image
          source={{ uri: imageUri }}
          style={[
            styles.image, // Now contains width/height 100%
            { 
              transform: [{ 
                rotate: rotationAnimatedValue.interpolate({
                  inputRange: [-360, 360],
                  outputRange: ['-360deg', '360deg'],
                })
              }],
              opacity: imageOpacity,
            }
          ]}
          resizeMode="contain"
          onError={() => {}}
          onLoad={() => {
            // Notify parent that image is loaded (for hiding loading overlays)
            onImageLoaded?.();
            // Trigger fade-in animation when image loads
            Animated.timing(imageOpacity, {
              toValue: 1,
              duration: 300,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }).start();
          }}
        />
        {/* Detected regions are relative to the image, so they go inside imageContainer */}
        {detectedRegions.map((region, index) => (
            <View
              key={region.id || `region-${index}`}
              style={[
                styles.detectedRegion,
                {
                  left: (region.boundingBox.x / imageWidth) * scaledContainerWidth,
                  top: (region.boundingBox.y / imageHeight) * scaledContainerHeight,
                  width: (region.boundingBox.width / imageWidth) * scaledContainerWidth,
                  height: (region.boundingBox.height / imageHeight) * scaledContainerHeight,
                }
              ]}
            />
        ))}
      </View>

      {/* Hidden view to keep rainbow animation running even when no boxes are visible */}
      <Animated.View
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          opacity: 0,
          borderColor: rainbowColor,
        }}
        pointerEvents="none"
      />

      {/* Highlights and Crop Box are direct children of styles.container, positioned absolutely */}
      {renderHighlightStrokes()}
      {renderCropBox()}

      {/* Rotate mode: center cross guideline overlay to help user align text */}
      {rotateMode && scaledContainerWidth > 0 && scaledContainerHeight > 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.rotateCrossGuideContainer,
            {
              left: displayImageOffsetX,
              top: displayImageOffsetY,
              width: scaledContainerWidth,
              height: scaledContainerHeight,
            },
          ]}
        >
          <View
            style={[
              styles.rotateCrossGuideLine,
              {
                left: 0,
                top: scaledContainerHeight / 2 - ROTATE_CROSS_GUIDE_STROKE / 2,
                width: scaledContainerWidth,
                height: ROTATE_CROSS_GUIDE_STROKE,
              },
            ]}
          />
          <View
            style={[
              styles.rotateCrossGuideLine,
              {
                left: scaledContainerWidth / 2 - ROTATE_CROSS_GUIDE_STROKE / 2,
                top: 0,
                width: ROTATE_CROSS_GUIDE_STROKE,
                height: scaledContainerHeight,
              },
            ]}
          />
        </View>
      )}

      {/* Rotate mode instructions could be inside or outside, positioned absolutely */}
      {rotateMode && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>{t('imageHighlighter.dragToRotate')}</Text>
        </View>
      )}


      {/* Other instruction texts */}
      {highlightModeActive && !isDrawing && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>{t('imageHighlighter.dragToHighlight')}</Text>
        </View>
      )}
      {cropMode && !isCropDrawing && activeCropHandle === null && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>{t('imageHighlighter.dragToCrop')}</Text>
        </View>
      )}

      {/* Tech screen frame on top of image: translucent matrix-green border and corner brackets */}
      <View style={styles.screenFrame} />
      <View style={[styles.cornerBracket, styles.cornerTopLeft]} />
      <View style={[styles.cornerBracket, styles.cornerTopRight]} />
      <View style={[styles.cornerBracket, styles.cornerBottomLeft]} />
      <View style={[styles.cornerBracket, styles.cornerBottomRight]} />

      {/* Composite capture: White background + image visible only through row-based rectangles (accurate staircase, no diagonal cuts) */}
      {isCompositeCaptureReady && compositeCaptureParams && (() => {
        const { rowRects, imageDataUri, mergedMinX, mergedMinY, mergedWidth, mergedHeight } = compositeCaptureParams;
        
        // Build a single Path with all rectangles as subpaths (nonzero fill rule = additive, no cancellation)
        const rowPathD = rowRects.map(rect => 
          `M ${rect.x} ${rect.y} L ${rect.x + rect.width} ${rect.y} L ${rect.x + rect.width} ${rect.y + rect.height} L ${rect.x} ${rect.y + rect.height} Z`
        ).join(' ');
        
        return (
          <View
            ref={compositeCaptureRef}
            style={{
              position: 'absolute',
              left: -10000,
              top: 0,
              width: mergedWidth,
              height: mergedHeight,
              overflow: 'hidden',
              zIndex: 9999,
              backgroundColor: 'white',
            }}
            collapsable={false}
            pointerEvents="none"
            removeClippedSubviews={false}
          >
            <Svg width={mergedWidth} height={mergedHeight} viewBox={`0 0 ${mergedWidth} ${mergedHeight}`}>
              <Rect x={0} y={0} width={mergedWidth} height={mergedHeight} fill="white" />
              <ClipPath id="compositeClipRows">
                {/* Single Path with nonzero fill rule - overlapping regions are additive, not canceling */}
                <Path d={rowPathD} fillRule="nonzero" />
              </ClipPath>
              <SvgImage
                href={imageDataUri}
                x={-mergedMinX}
                y={-mergedMinY}
                width={imageWidth}
                height={imageHeight}
                preserveAspectRatio="none"
                clipPath="url(#compositeClipRows)"
              />
            </Svg>
            {/* Invisible RN Image to trigger onLoad so we know when to capture (SVG may not fire onLoad) */}
            <Image
              source={{ uri: imageUri }}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
              onLoad={() => {
                compositeImagesLoadedRef.current = (compositeImagesLoadedRef.current || 0) + 1;
              }}
            />
          </View>
        );
      })()}

      {/* Hidden mask capture view - white background with image showing only through stroke windows */}
      {isMaskCaptureReady && strokes.length > 0 && scaledContainerWidth > 0 && (() => {
        // Convert strokes from container coordinates to image-relative coordinates
        const imageRelativeStrokes = strokes.map(stroke =>
          stroke.map(p => ({
            x: p.x - displayImageOffsetX,
            y: p.y - displayImageOffsetY,
          }))
        );
        
        // Calculate bounding box for each stroke
        const strokeBounds: Array<{x: number, y: number, width: number, height: number}> = [];
        for (const stroke of imageRelativeStrokes) {
          if (stroke.length < 2) continue;
          
          const polygonPoints = strokeToFilledPolygon(stroke, effectiveStrokeWidth);
          if (!polygonPoints) continue;
          
          const pairs = polygonPoints.split(' ').filter(p => p.includes(','));
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const pair of pairs) {
            const [x, y] = pair.split(',').map(Number);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
          
          if (minX < Infinity) {
            // Clamp to image bounds
            minX = Math.max(0, minX);
            minY = Math.max(0, minY);
            maxX = Math.min(scaledContainerWidth, maxX);
            maxY = Math.min(scaledContainerHeight, maxY);
            strokeBounds.push({ 
              x: minX, 
              y: minY, 
              width: maxX - minX, 
              height: maxY - minY 
            });
          }
        }
        
        logger.log('[ImageHighlighter] Mask - per-stroke bounds:', strokeBounds.length, 
          strokeBounds.map(b => `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`));
        
        // For debugging: save actual captured content to see what's being captured
        logger.log('[ImageHighlighter] Rendering mask capture view with', strokeBounds.length, 'windows');
        
        return (
          <View
            ref={maskCaptureRef}
            style={{
              position: 'absolute',
              // Position far off-screen but fully opaque (opacity: 0 prevents rendering)
              left: -5000,
              top: 0,
              width: scaledContainerWidth,
              height: scaledContainerHeight,
              backgroundColor: 'white',
              overflow: 'hidden',
            }}
            collapsable={false}
            pointerEvents="none"
          >
            {/* For each stroke, render just that portion of the image */}
            {strokeBounds.map((bounds, index) => (
              <View
                key={index}
                style={{
                  position: 'absolute',
                  left: bounds.x,
                  top: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  overflow: 'hidden',
                  backgroundColor: 'transparent',
                }}
              >
                {/* Image positioned so the correct region shows through */}
                <Image
                  source={{ uri: imageUri }}
                  style={{
                    position: 'absolute',
                    left: -bounds.x,
                    top: -bounds.y,
                    width: scaledContainerWidth,
                    height: scaledContainerHeight,
                  }}
                  resizeMode="stretch"
                  onLoad={index === 0 ? () => {
                    logger.log('[ImageHighlighter] Mask window image onLoad fired for window 0');
                    setMaskImageLoaded(true);
                  } : undefined}
                />
              </View>
            ))}
          </View>
        );
      })()}
    </View>
  );
});

// Add display name for debugging
ImageHighlighter.displayName = 'ImageHighlighter';

// Tech/screen frame constants (green border; highlight deadzone is outside this inset)
const SCREEN_FRAME_INSET = HIGHLIGHT_FRAME_INSET;
const CORNER_BRACKET_SIZE = 24;
const CORNER_BRACKET_STROKE = 2;
const FRAME_COLOR = 'rgba(0, 140, 45, 0.4)';   // darker matrix green, translucent
const CORNER_COLOR = 'rgba(0, 120, 40, 0.55)';  // darker matrix green (corners), translucent
/** Rotate cross guide: same green as stylized border, same thickness as corner brackets, more translucent */
const ROTATE_CROSS_GUIDE_COLOR = 'rgba(0, 140, 45, 0.7)';
const ROTATE_CROSS_GUIDE_STROKE = CORNER_BRACKET_STROKE;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#000000', // Black screen behind uploaded image
  },
  screenFrame: {
    position: 'absolute',
    left: SCREEN_FRAME_INSET,
    right: SCREEN_FRAME_INSET,
    top: SCREEN_FRAME_INSET,
    bottom: SCREEN_FRAME_INSET,
    borderWidth: 1,
    borderColor: FRAME_COLOR,
    borderRadius: 6,
    pointerEvents: 'none',
    zIndex: 50,  // above image, below instruction overlays (100)
  },
  rotateCrossGuideContainer: {
    position: 'absolute',
    zIndex: 45,  // above image, below screen frame
  },
  rotateCrossGuideLine: {
    position: 'absolute',
    backgroundColor: ROTATE_CROSS_GUIDE_COLOR,
  },
  cornerBracket: {
    position: 'absolute',
    width: CORNER_BRACKET_SIZE,
    height: CORNER_BRACKET_SIZE,
    borderColor: CORNER_COLOR,
    pointerEvents: 'none',
    zIndex: 51,  // above frame, below instruction overlays (100)
  },
  cornerTopLeft: {
    left: SCREEN_FRAME_INSET,
    top: SCREEN_FRAME_INSET,
    borderLeftWidth: CORNER_BRACKET_STROKE,
    borderTopWidth: CORNER_BRACKET_STROKE,
    borderTopLeftRadius: 6,
  },
  cornerTopRight: {
    right: SCREEN_FRAME_INSET,
    top: SCREEN_FRAME_INSET,
    borderRightWidth: CORNER_BRACKET_STROKE,
    borderTopWidth: CORNER_BRACKET_STROKE,
    borderTopRightRadius: 6,
  },
  cornerBottomLeft: {
    left: SCREEN_FRAME_INSET,
    bottom: SCREEN_FRAME_INSET,
    borderLeftWidth: CORNER_BRACKET_STROKE,
    borderBottomWidth: CORNER_BRACKET_STROKE,
    borderBottomLeftRadius: 6,
  },
  cornerBottomRight: {
    right: SCREEN_FRAME_INSET,
    bottom: SCREEN_FRAME_INSET,
    borderRightWidth: CORNER_BRACKET_STROKE,
    borderBottomWidth: CORNER_BRACKET_STROKE,
    borderBottomRightRadius: 6,
  },
  imageWrapper: {
    flex: 1, // Fill the container
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    overflow: 'visible',
  },
  imageContainer: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  image: {
    width: '100%', // Fill parent
    height: '100%', // Fill parent
    backgroundColor: 'transparent',
  },
  highlight: {
    position: 'absolute',
    borderWidth: 3,
    backgroundColor: 'transparent',
    pointerEvents: 'none',
  },
  detectedRegion: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.secondary,
    backgroundColor: 'rgba(97, 160, 175, 0.1)',
    pointerEvents: 'none',
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 3,
    borderStyle: 'dashed',
    borderRadius: 10,
    backgroundColor: 'rgba(200, 200, 200, 0.2)',
    pointerEvents: 'none',
  },
  cropHandle: {
    position: 'absolute',
    width: CROP_HANDLE_SIZE,
    height: CROP_HANDLE_SIZE,
    borderRadius: CROP_HANDLE_SIZE / 2,
    backgroundColor: '#B0B0B0',
    borderWidth: 2,
    borderColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  activeHandle: {
    backgroundColor: COLORS.primary,
    borderColor: '#B0B0B0',
    transform: [{ scale: 1.2 }],
  },

  instructionContainer: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 100,
  },
  instructionText: {
    fontFamily: FONTS.sans,
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
  cropToggleButton: {
    position: 'absolute',
    bottom: 20,
    right: 110,
    backgroundColor: COLORS.secondary,
    width: 80,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 100,
  },
  confirmCropButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#2CB67D',
    width: 80,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 100,
  },
  buttonText: {
    fontFamily: FONTS.sansBold,
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default ImageHighlighter; 