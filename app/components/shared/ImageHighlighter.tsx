import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
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
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import * as ImageManipulator from 'expo-image-manipulator';
import { detectJapaneseText } from '../../services/visionApi';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';
import { processImage } from '../../services/ProcessImage';

import { logger } from '../../utils/logger';

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

interface ImageHighlighterProps {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  highlightModeActive?: boolean;
  onActivateHighlightMode?: () => void;
  onRegionSelected?: (region: {
    x: number;
    y: number;
    width: number;
    height: number;
    detectedText?: string[];
    rotation?: number;
  }) => void;
  onRotationStateChange?: (state: ImageHighlighterRotationState) => void;
  onImageLoaded?: () => void; // Called when the image has finished loading and is visible
}

// Let's define a type for our crop box to ensure type consistency
interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Define Point interface for stroke-based highlighting
interface Point {
  x: number;
  y: number;
}

// Constants for layout calculations
const CROP_HANDLE_SIZE = 30;
const CROP_HANDLE_TOUCH_AREA = 40;
const ROTATION_SMOOTHING_FACTOR = 0.4; // New, for smoothing rotation during drag
const EDGE_TOLERANCE = 50; // pixels outside image boundary for starting highlights/crops
const STROKE_WIDTH = 20; // Width of the highlighter stroke
const POINT_THROTTLE_MS = 16; // ~60fps for point collection

// Ref for the PanResponder View - MOVED INSIDE COMPONENT
// const panResponderViewRef = React.useRef<View>(null); // REMOVE FROM HERE

const ImageHighlighter = forwardRef<ImageHighlighterRef, ImageHighlighterProps>(({ 
  imageUri,
  imageWidth,
  imageHeight,
  highlightModeActive = false,
  onActivateHighlightMode,
  onRegionSelected,
  onRotationStateChange,
  onImageLoaded,
}, ref) => {
  const { t } = useTranslation();
  const panResponderViewRef = React.useRef<View>(null); // ADDED HERE
  const [measuredLayout, setMeasuredLayout] = useState<{width: number, height: number} | null>(null);
  const [containerScreenOffset, setContainerScreenOffset] = useState<{x: number, y: number} | null>(null);

  // Stroke-based highlighting state (replaces highlightBox)
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const lastPointTimeRef = useRef<number>(0);
  
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
  
  // Refs for gesture calculation
  // imageRotationAtGestureStartRef: Stores the image's rotation at the very beginning of a PanResponder Grant event.
  // This is the baseline rotation *before* the current gesture starts.
  const imageRotationAtGestureStartRef = useRef<number>(0); 
  const previousFingerAngleRef = useRef<number | null>(null);
  // accumulatedAngleDeltaForGestureRef: Stores the *total* accumulated angular change OF THE FINGER MOVEMENT ITSELF since onPanResponderGrant.
  const accumulatedAngleDeltaForGestureRef = useRef<number>(0); 
  // lastVisuallyAppliedRotationRef: Stores the actual rotation value that was last commanded via setRotation (smoothed value).
  const lastVisuallyAppliedRotationRef = useRef<number>(0);

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:165',message:'Animation loop setup - starting',data:{rainbowAnimValue:rainbowAnim},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const loop = Animated.loop(
      Animated.timing(rainbowAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    animationLoopRef.current = loop;
    const listenerId = rainbowAnim.addListener(({ value }) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:179',message:'Animation value update',data:{value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    });
    loop.start((finished) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:183',message:'Animation loop finished callback',data:{finished},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    });
    
    return () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:187',message:'Animation effect cleanup',data:{hasLoop:!!animationLoopRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:207',message:'Restarting animation loop',data:{hasAnimationLoop:!!animationLoopRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:225',message:'highlightModeActive changed',data:{highlightModeActive,hasAnimationLoop:!!animationLoopRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    // Restart animation when highlight mode becomes active to ensure rainbow effect works
    if (highlightModeActive) {
      restartAnimationLoop();
    }
  }, [highlightModeActive, rainbowAnim]);

  // Effect to track cropMode changes and ensure animation is running
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:234',message:'cropMode changed',data:{cropMode,hasAnimationLoop:!!animationLoopRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    // Restart animation when crop mode becomes active to ensure rainbow effect works
    if (cropMode) {
      restartAnimationLoop();
    }
  }, [cropMode, rainbowAnim]);
  
  // Effect to track image changes and reset processing state
  useEffect(() => {
    if (prevImageUriRef.current !== imageUri) {
      // logger.log('[ImageHighlighter] imageUri changed:', imageUri); // Removed
      // Clear processing state when image changes
      setIsProcessing(false);
      prevImageUriRef.current = imageUri;
      // Reset opacity to 0 for fade-in animation when image changes
      imageOpacity.setValue(0);
      // Don't reset containerScreenOffset when image changes - layout dimensions remain the same
      // Only reset it if we actually need to remeasure (which onLayout will handle)
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:447',message:'clearHighlightBox called',data:{isDrawing,strokes,hasAnimationLoop:!!animationLoopRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      setIsDrawing(false);
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
        const result = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ rotate: rotation }],
          { 
            format: ImageManipulator.SaveFormat.JPEG,
            compress: 1.0,
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
  const calculateAngle = (x: number, y: number) => {
    const centerX = scaledContainerWidth / 2;
    const centerY = scaledContainerHeight / 2;
    return Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      if (!containerScreenOffset || !measuredLayout) return false; // Not ready yet
      // Interaction is starting
      // logger.log('[ImageHighlighter] onStartShouldSetPanResponder evaluating'); // Removed
      // Check if the touch is within the defined active area for highlighting
      const { pageX, pageY } = evt.nativeEvent;
      const x = pageX - containerScreenOffset.x;
      const y = pageY - containerScreenOffset.y;

      const touchTolerance = 1.5; // pixels of tolerance

      // Define the touchable area (can be the whole component or a sub-region)
      const isWithinHorizontalBounds = x >= -touchTolerance && x <= measuredLayout.width + touchTolerance;
      const isWithinVerticalBounds = y >= -touchTolerance && y <= measuredLayout.height + touchTolerance;
      
      const shouldSet = isWithinHorizontalBounds && isWithinVerticalBounds;

      /* // Removed
      logger.log('[ImageHighlighter] onStartShouldSetPanResponder:', {
        pageX, pageY,
        containerScreenOffsetX: containerScreenOffset.x,
        containerScreenOffsetY: containerScreenOffset.y,
        x, y,
        measuredLayoutWidth: measuredLayout.width,
        measuredLayoutHeight: measuredLayout.height,
        isWithinHorizontalBounds,
        isWithinVerticalBounds,
        shouldSet,
        highlightModeActive,
        cropMode,
      });
      */

      // Allow gesture to start if within bounds and any mode (highlight, crop, rotate) is active or could be activated.
      // The specific mode logic within onPanResponderGrant will handle what to do.
      return shouldSet;
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      if (!containerScreenOffset) return false;
      
      const { pageX } = evt.nativeEvent;
      const currentX = pageX - containerScreenOffset.x;
      
      // Don't capture gestures that start very close to the left edge to avoid interfering with back swipe
      if (currentX < 30 && !cropMode && !rotateMode) {
        return false;
      }
      
      return (highlightModeActive || cropMode || rotateMode ||
             Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10);
    },
    onPanResponderGrant: (evt) => {
      if (!containerScreenOffset || !measuredLayout) return; // Should not happen if onStartShouldSetPanResponder works

      const { pageX, pageY, timestamp } = evt.nativeEvent;
      
      const currentX = pageX - containerScreenOffset.x;
      const currentY = pageY - containerScreenOffset.y;
      
      /* // Removed
      logger.log('[ImageHighlighter] GRANT - Calculated Coords (pageX - containerOffset.x):', {
        pageX, pageY,
        containerScreenOffsetX: containerScreenOffset.x,
        containerScreenOffsetY: containerScreenOffset.y,
        currentX, currentY,
        displayImageOffsetX,
        displayImageOffsetY,
        scaledContainerWidth,
        scaledContainerHeight,
        wrapperWidth: measuredLayout?.width,
        wrapperHeight: measuredLayout?.height,
        timestamp
      });
      */
      
      // Add debugging for touch position relative to image bounds
      const touchRelativeToImageX = currentX - displayImageOffsetX;
      const touchRelativeToImageY = currentY - displayImageOffsetY;
      const isWithinImageBounds = touchRelativeToImageX >= 0 && 
                                  touchRelativeToImageX <= scaledContainerWidth &&
                                  touchRelativeToImageY >= 0 && 
                                  touchRelativeToImageY <= scaledContainerHeight;
      /* // Removed
      logger.log('[ImageHighlighter] GRANT - Touch Analysis:', {
        touchRelativeToImageX,
        touchRelativeToImageY,
        isWithinImageBounds,
        imageLeft: displayImageOffsetX,
        imageTop: displayImageOffsetY,
        imageRight: displayImageOffsetX + scaledContainerWidth,
        imageBottom: displayImageOffsetY + scaledContainerHeight
      });
      */
      
      if (rotateMode) {
        const adjustedXForRotation = currentX - displayImageOffsetX;
        const adjustedYForRotation = currentY - displayImageOffsetY;
        const currentFingerAngle = calculateAngle(adjustedXForRotation, adjustedYForRotation);
        imageRotationAtGestureStartRef.current = rotation; 
        lastVisuallyAppliedRotationRef.current = rotation; 
        previousFingerAngleRef.current = currentFingerAngle;
        accumulatedAngleDeltaForGestureRef.current = 0; 
      }
      else if (cropMode) {
        if (activeCropHandle === null && !isCropDrawing && (cropBox.width === 0 && cropBox.height === 0)) {
          // logger.log('[ImageHighlighter] Starting to draw new crop box with locationX/Y'); // Removed
          const clampedX = Math.max(-EDGE_TOLERANCE, Math.min((measuredLayout?.width || 0) + EDGE_TOLERANCE, currentX));
          const clampedY = Math.max(-EDGE_TOLERANCE, Math.min((measuredLayout?.height || 0) + EDGE_TOLERANCE, currentY));
          
          setIsCropDrawing(true);
          setCropBox({
            x: clampedX,
            y: clampedY,
            width: 0,
            height: 0
          });
        } else if (cropBox.width > 0 && cropBox.height > 0) {
          const { x, y, width, height } = cropBox;
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
      else if (highlightModeActive) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:703',message:'Highlight mode onPanResponderGrant',data:{currentX,currentY,hasAnimationLoop:!!animationLoopRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
        
        // Use the exact touch coordinates relative to the container for precise positioning
        const preciseX = pageX - containerScreenOffset.x;
        const preciseY = pageY - containerScreenOffset.y;
        
        // Clamp coordinates to the CONTAINER bounds
        const containerMinX = 0;
        const containerMaxX = (measuredLayout?.width || 0) - 1; 
        const containerMinY = 0;
        const containerMaxY = (measuredLayout?.height || 0) - 1; 
                
        const clampedX = Math.max(containerMinX, Math.min(containerMaxX, preciseX));
        const clampedY = Math.max(containerMinY, Math.min(containerMaxY, preciseY));
        
        // Start a new stroke
        setIsDrawing(true);
        setCurrentStroke([{ x: clampedX, y: clampedY }]);
        lastPointTimeRef.current = Date.now();
      }
    },
    onPanResponderMove: (evt, gestureState: PanResponderGestureState) => {
      if (!containerScreenOffset) return; // Guard against missing offset

      const { pageX, pageY } = evt.nativeEvent;
      
      const currentX = pageX - containerScreenOffset.x;
      const currentY = pageY - containerScreenOffset.y;
      
      if (rotateMode) {
        const adjustedXForRotation = currentX - displayImageOffsetX;
        const adjustedYForRotation = currentY - displayImageOffsetY;
        
        if (previousFingerAngleRef.current === null) { 
          const initAngle = calculateAngle(adjustedXForRotation, adjustedYForRotation);
          previousFingerAngleRef.current = initAngle;
          accumulatedAngleDeltaForGestureRef.current = 0; 
          imageRotationAtGestureStartRef.current = rotation;
          lastVisuallyAppliedRotationRef.current = rotation;
          return;
        }

        const currentFingerAngle = calculateAngle(adjustedXForRotation, adjustedYForRotation);
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
      else if (cropMode && isCropDrawing) {
        const clampedX = Math.max(-EDGE_TOLERANCE, Math.min((measuredLayout?.width || 0) + EDGE_TOLERANCE, currentX));
        const clampedY = Math.max(-EDGE_TOLERANCE, Math.min((measuredLayout?.height || 0) + EDGE_TOLERANCE, currentY));

        setCropBox(prev => ({
          ...prev,
          width: clampedX - prev.x,
          height: clampedY - prev.y,
        }));
      }
      else if (cropMode && activeCropHandle) {
        const { dx, dy } = gestureState;
        const { x, y, width, height } = cropBox; 
        
        switch (activeCropHandle) {
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
            const wrapperWidth = measuredLayout?.width || 0;
            const wrapperHeight = measuredLayout?.height || 0;
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
      else if (isDrawing && highlightModeActive) {
        // Throttle point collection for performance
        const now = Date.now();
        if (now - lastPointTimeRef.current < POINT_THROTTLE_MS) {
          return;
        }
        lastPointTimeRef.current = now;
        
        // Use precise coordinates for consistent positioning
        const preciseX = pageX - containerScreenOffset.x;
        const preciseY = pageY - containerScreenOffset.y;
        
        // Clamp coordinates to the CONTAINER bounds
        const containerMinX = 0;
        const containerMaxX = (measuredLayout?.width || 0) - 1;
        const containerMinY = 0;
        const containerMaxY = (measuredLayout?.height || 0) - 1;
        
        const clampedX = Math.max(containerMinX, Math.min(containerMaxX, preciseX));
        const clampedY = Math.max(containerMinY, Math.min(containerMaxY, preciseY));
        
        // Add point to current stroke
        setCurrentStroke(prev => [...prev, { x: clampedX, y: clampedY }]);
      }
    },
    onPanResponderRelease: async (evt, gestureState: PanResponderGestureState) => {
      if (!containerScreenOffset) return; // Guard against missing offset

      const { pageX, pageY } = evt.nativeEvent; 
      
      const finalCurrentX = pageX - containerScreenOffset.x;
      const finalCurrentY = pageY - containerScreenOffset.y;
      
      if (rotateMode) {
        const finalAdjustedXForRotation = finalCurrentX - displayImageOffsetX;
        const finalAdjustedYForRotation = finalCurrentY - displayImageOffsetY;

        if (previousFingerAngleRef.current !== null) {
            const currentFingerAngle = calculateAngle(finalAdjustedXForRotation, finalAdjustedYForRotation);
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
      else if (cropMode) {
        setActiveCropHandle(null);
        if (isCropDrawing) {
          setIsCropDrawing(false);
          // Normalize crop box if width/height are negative
          const { x, y, width, height } = cropBox;
          const normalizedX = width < 0 ? x + width : x;
          const normalizedY = height < 0 ? y + height : y;
          const normalizedWidth = Math.abs(width);
          const normalizedHeight = Math.abs(height);
          setCropBox({ x: normalizedX, y: normalizedY, width: normalizedWidth, height: normalizedHeight });
          // logger.log('[ImageHighlighter] Finalized new crop box:', {x: normalizedX, y: normalizedY, width: normalizedWidth, height: normalizedHeight }); // Removed
        }
      }
      
      if (isDrawing && highlightModeActive) {
        setIsDrawing(false);
        
        // Add final point to current stroke
        const finalPreciseX = pageX - containerScreenOffset.x;
        const finalPreciseY = pageY - containerScreenOffset.y;
        
        const containerMinX = 0;
        const containerMaxX = (measuredLayout?.width || 0) - 1;
        const containerMinY = 0;
        const containerMaxY = (measuredLayout?.height || 0) - 1;
        
        const finalClampedX = Math.max(containerMinX, Math.min(containerMaxX, finalPreciseX));
        const finalClampedY = Math.max(containerMinY, Math.min(containerMaxY, finalPreciseY));
        
        // Finalize the stroke
        const finalStroke = [...currentStroke, { x: finalClampedX, y: finalClampedY }];
        setStrokes(prev => [...prev, finalStroke]);
        setCurrentStroke([]);

        if (onRegionSelected && finalStroke.length > 1) {
          // Calculate bounding box from all strokes (including the one we just added)
          const allStrokes = [...strokes, finalStroke];
          const allPoints = allStrokes.flat();
          
          if (allPoints.length > 0) {
            // CRITICAL FIX: Filter points to only include those within the image boundaries
            // This prevents selecting all text when highlighting outside the image borders
            const imageMinX = displayImageOffsetX;
            const imageMaxX = displayImageOffsetX + scaledContainerWidth;
            const imageMinY = displayImageOffsetY;
            const imageMaxY = displayImageOffsetY + scaledContainerHeight;
            
            const pointsWithinImage = allPoints.filter(p => 
              p.x >= imageMinX && 
              p.x <= imageMaxX && 
              p.y >= imageMinY && 
              p.y <= imageMaxY
            );
            
            // If no points are within the image, don't create a region
            if (pointsWithinImage.length === 0) {
              return;
            }
            
            // Find min/max coordinates across only the points within the image
            const minX = Math.min(...pointsWithinImage.map(p => p.x));
            const maxX = Math.max(...pointsWithinImage.map(p => p.x));
            const minY = Math.min(...pointsWithinImage.map(p => p.y));
            const maxY = Math.max(...pointsWithinImage.map(p => p.y));
            
            // Use minimal padding - just enough to account for the stroke rendering
            // This makes OCR more accurate by not picking up nearby text
            const padding = 2; // Minimal padding instead of STROKE_WIDTH / 2
            
            // Clamp padded coordinates to image boundaries (not container boundaries)
            const paddedMinX = Math.max(imageMinX, minX - padding);
            const paddedMaxX = Math.min(imageMaxX, maxX + padding);
            const paddedMinY = Math.max(imageMinY, minY - padding);
            const paddedMaxY = Math.min(imageMaxY, maxY + padding);

            // Calculate the region relative to the *image* (subtract image offset)
            const imageRelativeMinX = paddedMinX - displayImageOffsetX;
            const imageRelativeMinY = paddedMinY - displayImageOffsetY;
            const imageRelativeMaxX = paddedMaxX - displayImageOffsetX;
            const imageRelativeMaxY = paddedMaxY - displayImageOffsetY;

            // Calculate width and height, ensuring they don't exceed image dimensions
            // Since we've already clamped to image boundaries, these should be valid
            const reportedWidth = imageRelativeMaxX - imageRelativeMinX;
            const reportedHeight = imageRelativeMaxY - imageRelativeMinY;
            
            // Final safety clamp to ensure valid region (shouldn't be needed but prevents edge cases)
            const finalX = Math.max(0, Math.min(imageRelativeMinX, scaledContainerWidth - 1));
            const finalY = Math.max(0, Math.min(imageRelativeMinY, scaledContainerHeight - 1));
            const finalWidth = Math.max(1, Math.min(reportedWidth, scaledContainerWidth - finalX));
            const finalHeight = Math.max(1, Math.min(reportedHeight, scaledContainerHeight - finalY));
            
            const regionForParent = {
              x: finalX,
              y: finalY,
              width: finalWidth,
              height: finalHeight,
              detectedText: [],
              rotation: rotation,
            };

            onRegionSelected(regionForParent);
          }
        }
      }
    },
  });

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
              strokeWidth={STROKE_WIDTH}
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
            strokeWidth={STROKE_WIDTH}
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:1057',message:'renderCropBox called',data:{cropMode,cropBox,isCropDrawing,hasAnimationLoop:!!animationLoopRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
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
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c2cdc465-043c-4255-832b-9b0a48e37cd8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImageHighlighter.tsx:1073',message:'renderCropBox rendering Animated.View',data:{normalizedX,normalizedY,normalizedWidth,normalizedHeight,hasAnimationLoop:!!animationLoopRef.current,rainbowColorType:typeof rainbowColor},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
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

  // Reset when image changes
  React.useEffect(() => {
    if (prevImageUriRef.current !== imageUri) {
      // logger.log('[ImageHighlighter] imageUri changed:', imageUri); // Removed
      // Clear processing state when image changes
      setIsProcessing(false);
      setCropMode(false);
      // Consider if rotateMode should also be reset or if parent controls it.
      // For now, keeping rotation state unless explicitly cleared by user action or new image.
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      // setRotation(0); // Do not reset rotation automatically on image change for now
      // setInitialRotation(0); 
      prevImageUriRef.current = imageUri;
    }
  }, [imageUri]);
  
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
        {/* Show a loader until initial measurements are done */}
        <ActivityIndicator size="large" color={COLORS.primary} style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}/>
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
              transform: [{ rotate: `${rotation}deg` }],
              opacity: imageOpacity
            }
          ]}
          resizeMode="contain"
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
    </View>
  );
});

// Add display name for debugging
ImageHighlighter.displayName = 'ImageHighlighter';

const styles = StyleSheet.create({
  container: {
    flex: 1, 
    width: '100%', 
    overflow: 'hidden',
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
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default ImageHighlighter; 