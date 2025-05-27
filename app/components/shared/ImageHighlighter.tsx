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
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { detectJapaneseText } from '../../services/visionApi';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';
import { processImage } from '../../services/ProcessImage';

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
}, ref) => {
  const panResponderViewRef = React.useRef<View>(null); // ADDED HERE
  const [measuredLayout, setMeasuredLayout] = useState<{width: number, height: number} | null>(null);
  const [containerScreenOffset, setContainerScreenOffset] = useState<{x: number, y: number} | null>(null);

  const [highlightBox, setHighlightBox] = useState({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });
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
  
  // Effect to track image changes and reset processing state
  useEffect(() => {
    if (prevImageUriRef.current !== imageUri) {
      console.log('[ImageHighlighter] imageUri changed:', imageUri);
      // Clear processing state when image changes
      setIsProcessing(false);
      prevImageUriRef.current = imageUri;
      // Don't reset containerScreenOffset when image changes - layout dimensions remain the same
      // Only reset it if we actually need to remeasure (which onLayout will handle)
    }
  }, [imageUri]);
  
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
    if (aspectRatio > maxContainerWidth / maxContainerHeight) {
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
      console.log(`[DEBUG ImageHighlighter] rotation state CHANGED to: ${rotation.toFixed(2)}`);
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
      console.log('[ImageHighlighter] containerScreenOffset is null, attempting to remeasure...');
      // Small delay to ensure the component is fully rendered
      const timeoutId = setTimeout(() => {
        if (panResponderViewRef.current) {
          panResponderViewRef.current.measure((fx, fy, w, h, px, py) => {
            console.log(`[ImageHighlighter] Delayed remeasure: screenX:${px}, screenY:${py}, width:${w}, height:${h}`);
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
        console.log('[ImageHighlighter] Entered rotate mode. Initial session rotation:', rotation);
      } else { // ---- Exiting Rotate Mode (if toggled off directly by this call) ----
        // This implies a cancellation if not preceded by a confirm/ API call.
        console.log('[ImageHighlighter] Exited rotate mode via toggle. Reverting to initial session rotation:', initialRotation);
        setRotation(initialRotation); // initialRotation holds the value from when mode was entered
      }
    },
    applyCrop: () => {
      if (!cropMode || !onRegionSelected || cropBox.width === 0 || cropBox.height === 0) return;
      
      try {
        console.log('[ImageHighlighter] applyCrop called - Starting crop operation');
        setIsProcessing(true);
        
        // Normalize the crop box coordinates (ensure positive width/height)
        const { x, y, width, height } = cropBox;
        const normalizedX = width < 0 ? x + width : x;
        const normalizedY = height < 0 ? y + height : y;
        const normalizedWidth = Math.abs(width);
        const normalizedHeight = Math.abs(height);
        
        // Ensure valid crop box values (no negative dimensions)
        const validCrop = {
          x: Math.max(0, normalizedX),
          y: Math.max(0, normalizedY),
          width: Math.max(1, normalizedWidth),
          height: Math.max(1, normalizedHeight)
        };
        console.log('[ImageHighlighter] validCrop (screen coordinates):', validCrop);
        
        // Convert crop box coordinates from wrapper coordinates to image container coordinates
        const imageContainerX = validCrop.x - displayImageOffsetX;
        const imageContainerY = validCrop.y - displayImageOffsetY;
        
        // Convert crop box coordinates to be relative to the original image
        // The result will be the actual pixel coordinates in the original image
        const originalRegion = {
          x: Math.round((imageContainerX / scaledContainerWidth) * imageWidth),
          y: Math.round((imageContainerY / scaledContainerHeight) * imageHeight),
          width: Math.round((validCrop.width / scaledContainerWidth) * imageWidth),
          height: Math.round((validCrop.height / scaledContainerHeight) * imageHeight),
          rotation: rotation // Include current rotation
        };
        console.log('[ImageHighlighter] originalRegion (original image coordinates):', originalRegion);
        
        // Ensure no negative values and dimensions don't exceed image bounds
        const safeRegion = {
          x: Math.max(0, Math.min(originalRegion.x, imageWidth - 1)),
          y: Math.max(0, Math.min(originalRegion.y, imageHeight - 1)),
          width: Math.max(5, Math.min(originalRegion.width, imageWidth - originalRegion.x)),
          height: Math.max(5, Math.min(originalRegion.height, imageHeight - originalRegion.y)),
          rotation: originalRegion.rotation
        };
        
        console.log('[ImageHighlighter] safeRegion (final image coordinates for crop):', safeRegion);
        
        // Use the existing onRegionSelected callback to process the crop
        // We're still in crop mode (not highlight mode) when calling this
        console.log('[ImageHighlighter] Calling onRegionSelected with safeRegion');
        onRegionSelected(safeRegion);
        console.log('[ImageHighlighter] onRegionSelected callback completed');
        
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
      setHighlightBox({ startX: 0, startY: 0, endX: 0, endY: 0 });
      // Also reset any detected regions that might be displayed
      setDetectedRegions([]);
    },
    clearCropBox: () => {
      console.log('[ImageHighlighter] clearCropBox called');
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      setIsCropDrawing(false);
      setActiveCropHandle(null);
    },

    // --- New Rotation Control Methods ---
    undoRotationChange: () => {
      const EPSILON = 0.01;
      if (Math.abs(rotation - initialRotation) > EPSILON) {
        console.log('[ImageHighlighter] Undo rotation from:', rotation, 'to (initial):', initialRotation);
        setRotation(initialRotation);
        return true;
      }
      console.log('[ImageHighlighter] Cannot undo rotation (already at initial session rotation).');
      return false;
    },
    redoRotationChange: () => {
      console.log('[ImageHighlighter] Redo not supported in this model.');
      return false; // Redo is not supported in the simplified model
    },
    confirmCurrentRotation: async () => {
      if (!imageUri) {
        console.warn('[ImageHighlighter] Confirm rotation called without imageUri.');
        return null;
      }
      
      console.log('[ImageHighlighter] Starting rotation confirmation with image dimensions:', imageWidth, 'x', imageHeight);
      
      // Set processing state first thing to prevent UI flicker
      setIsProcessing(true);
      
      // Check if there's any effective rotation compared to the start of the session
      // Use a small epsilon for float comparison
      const hasEffectiveRotation = Math.abs(rotation - initialRotation) > 0.1;

      if (!hasEffectiveRotation) {
        console.log('[ImageHighlighter] No significant rotation change to confirm.');
        setRotation(0); 
        setInitialRotation(0);
        setRotateMode(false);  // Explicitly exit rotate mode
        setIsProcessing(false);
        // Return original dimensions
        return { uri: imageUri, width: imageWidth, height: imageHeight };
      }

      console.log('[ImageHighlighter] Confirming rotation:', rotation);
      
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
        
        console.log('[ImageHighlighter] Rotation applied. New dimensions:', result.width, 'x', result.height, 
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
        console.error('[ImageHighlighter] Failed to apply rotation:', error);
        setRotation(initialRotation);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    cancelRotationChanges: () => {
      console.log('[ImageHighlighter] Cancelling rotation changes. Reverting from', rotation, 'to', initialRotation);
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
    onStartShouldSetPanResponder: () => !!containerScreenOffset, // Only allow if layout is measured
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return !!containerScreenOffset && (highlightModeActive || cropMode || rotateMode ||
             Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10);
    },
    onPanResponderGrant: (evt) => {
      if (!containerScreenOffset) return; // Should not happen if onStartShouldSetPanResponder works

      const { pageX, pageY, timestamp } = evt.nativeEvent;
      
      const currentX = pageX - containerScreenOffset.x;
      const currentY = pageY - containerScreenOffset.y;
      
      console.log('[ImageHighlighter] GRANT - Calculated Coords (pageX - containerOffset.x):', {
        pageX, pageY,
        containerScreenOffsetX: containerScreenOffset.x,
        containerScreenOffsetY: containerScreenOffset.y,
        currentX, currentY,
        displayImageOffsetX,
        displayImageOffsetY,
        scaledContainerWidth,
        scaledContainerHeight,
        wrapperWidth: measuredLayout?.width,
        wrapperHeight: measuredLayout?.height
      });
      
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
          console.log('[ImageHighlighter] Starting to draw new crop box with locationX/Y');
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
        console.log('[ImageHighlighter] Highlight mode starting with locationX/Y:', { currentX, currentY });
        setIsDrawing(true);
        setHighlightBox({
          startX: currentX,
          startY: currentY,
          endX: currentX,
          endY: currentY,
        });
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
        setHighlightBox(prev => ({
          ...prev,
          endX: currentX,
          endY: currentY,
        }));
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
          // Ensure cropBox state reflects the final position using finalCurrentX/Y if needed,
          // though setCropBox in onPanResponderMove should handle most of it.
          // For now, normalize the existing cropBox state as it was updated during move.
          const { x, y, width, height } = cropBox; 
          const normalizedCropBox: CropBox = {
            x: width < 0 ? x + width : x,
            y: height < 0 ? y + height : y,
            width: Math.abs(width),
            height: Math.abs(height)
          };
          setCropBox(normalizedCropBox);
        }
      }
      
      if (isDrawing && highlightModeActive) {
        setIsDrawing(false);
        const finalHighlightBox = {
            ...highlightBox,
            endX: finalCurrentX,
            endY: finalCurrentY,
        };
        setHighlightBox(finalHighlightBox); 
        
        if (onRegionSelected) {
          const minX = Math.min(finalHighlightBox.startX, finalHighlightBox.endX);
          const maxX = Math.max(finalHighlightBox.startX, finalHighlightBox.endX);
          const minY = Math.min(finalHighlightBox.startY, finalHighlightBox.endY);
          const maxY = Math.max(finalHighlightBox.startY, finalHighlightBox.endY);
          
          console.log('[ImageHighlighter] RELEASE - Highlight Box (using locationX/Y from imageWrapper):', { minX, minY, maxX, maxY });
          // ... rest of OCR logic remains the same ...
          if (maxX - minX < 10 || maxY - minY < 10) {
            console.log('Selection too small, ignoring');
            setHighlightBox({ startX: 0, startY: 0, endX: 0, endY: 0 });
            return;
          }

          const selectionWidth = maxX - minX;
          const selectionHeight = maxY - minY;
          const widthPercentage = (selectionWidth / (measuredLayout?.width || 1)) * 100; 
          const heightPercentage = (selectionHeight / (measuredLayout?.height || 1)) * 100;
          console.log(`[ImageHighlighter] Selection dimensions: ${selectionWidth}x${selectionHeight} (${widthPercentage.toFixed(1)}% x ${heightPercentage.toFixed(1)}% of wrapper)`);
          
          const isExtremelyWide = widthPercentage > 70;
          const offsetX = displayImageOffsetX || 0; 
          const offsetY = displayImageOffsetY || 0; 
          const imageContainerMinX = minX - offsetX;
          const imageContainerMinY = minY - offsetY;
          const imageContainerMaxX = maxX - offsetX;
          const imageContainerMaxY = maxY - offsetY;
          
          const clampedMinX = Math.max(0, imageContainerMinX);
          const clampedMinY = Math.max(0, imageContainerMinY);
          const clampedMaxX = Math.min(finalDisplayImageWidth, imageContainerMaxX);
          const clampedMaxY = Math.min(finalDisplayImageHeight, imageContainerMaxY);
          
          const horizontalExpansion = isExtremelyWide ? selectionWidth * 0.02 : 0; 
          const unscaledRegion = {
            x: Math.max(0, clampedMinX - (isExtremelyWide ? horizontalExpansion : 0)),
            y: Math.max(0, clampedMinY),
            width: Math.max(1, Math.min(finalDisplayImageWidth - clampedMinX, clampedMaxX - clampedMinX + (isExtremelyWide ? horizontalExpansion * 2 : 0))),
            height: Math.max(1, Math.min(finalDisplayImageHeight - clampedMinY, clampedMaxY - clampedMinY)),
          };
          
          console.log('[ImageHighlighter] Final OCR region (image container relative):', unscaledRegion);
          try {
            setIsProcessing(true);
            onRegionSelected(unscaledRegion);
          } finally {
            setIsProcessing(false);
          }
        }
      }
    },
  });

  // Function to render the highlight box
  const renderHighlightBox = () => {
    // We want to show the highlight box when drawing OR when there's a finished selection (not drawing but has a selection)
    if (!isDrawing && highlightBox.startX === 0 && highlightBox.endX === 0) return null;
    
    // Use the exact touch coordinates - no padding adjustments
    const system_minX = Math.min(highlightBox.startX, highlightBox.endX);
    const system_maxX = Math.max(highlightBox.startX, highlightBox.endX);
    const system_minY = Math.min(highlightBox.startY, highlightBox.endY);
    const system_maxY = Math.max(highlightBox.startY, highlightBox.endY);

    // Render the box exactly where the user touched
    const render_left = system_minX;
    const render_top = system_minY;
    const render_width = system_maxX - system_minX;
    const render_height = system_maxY - system_minY;

    console.log('[ImageHighlighter] Rendering highlight box. System minX:', system_minX, 'Rendered left:', render_left);

    return (
      <>
        {/* Main highlight box */}
        <View
          style={[
            styles.highlight,
            {
              position: 'absolute',
              left: render_left,
              top: render_top,
              width: render_width,
              height: render_height,
            }
          ]}
        />
      </>
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
        <View
          style={[
            styles.cropBox,
            {
              left: normalizedX,
              top: normalizedY,
              width: normalizedWidth,
              height: normalizedHeight,
            }
          ]}
        />
        
        {/* Only show handles if not currently drawing */}
        {!isCropDrawing && normalizedWidth > 0 && normalizedHeight > 0 && (
          <>
            <View
              style={[
                styles.cropHandle,
                activeCropHandle === 'topLeft' && styles.activeHandle,
                {
                  left: normalizedX - CROP_HANDLE_SIZE / 2,
                  top: normalizedY - CROP_HANDLE_SIZE / 2,
                }
              ]}
            />
            <View
              style={[
                styles.cropHandle,
                activeCropHandle === 'topRight' && styles.activeHandle,
                {
                  left: normalizedX + normalizedWidth - CROP_HANDLE_SIZE / 2,
                  top: normalizedY - CROP_HANDLE_SIZE / 2,
                }
              ]}
            />
            <View
              style={[
                styles.cropHandle,
                activeCropHandle === 'bottomLeft' && styles.activeHandle,
                {
                  left: normalizedX - CROP_HANDLE_SIZE / 2,
                  top: normalizedY + normalizedHeight - CROP_HANDLE_SIZE / 2,
                }
              ]}
            />
            <View
              style={[
                styles.cropHandle,
                activeCropHandle === 'bottomRight' && styles.activeHandle,
                {
                  left: normalizedX + normalizedWidth - CROP_HANDLE_SIZE / 2,
                  top: normalizedY + normalizedHeight - CROP_HANDLE_SIZE / 2,
                }
              ]}
            />
          </>
        )}
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
    console.log('[ImageHighlighter] imageUri changed:', imageUri);
    setCropMode(false);
    // setRotateMode(false); // Don't automatically exit rotate mode if image URI changes, let parent decide
    setCropBox({ x: 0, y: 0, width: 0, height: 0 });
    setRotation(0);
    setInitialRotation(0); 
    // If it was in rotate mode, the useEffect above will notify of the reset state due to dependency changes.
  }, [imageUri]);
  
  // Log when component renders with new props
  React.useEffect(() => {
    console.log('[ImageHighlighter] Component rendered with props:', {
      imageUri,
      imageWidth,
      imageHeight,
      highlightModeActive,
      measuredLayout,
      containerScreenOffset // ADDED TO LOG OUTPUT
    });
  }, [imageUri, imageWidth, imageHeight, highlightModeActive, measuredLayout, containerScreenOffset]); // ADDED TO DEPENDENCY ARRAY

  const onLayout = (event: import('react-native').LayoutChangeEvent) => {
    const { width, height, x, y } = event.nativeEvent.layout;
    console.log(`[ImageHighlighter] onLayout (for main styles.container): width: ${width}, height: ${height}, screenX (relative): ${x}, screenY (relative): ${y}`);
    setMeasuredLayout({ width, height });

    // Measure the absolute screen position of the PanResponder view
    if (panResponderViewRef.current) {
      panResponderViewRef.current.measure((fx, fy, w, h, px, py) => {
        console.log(`[ImageHighlighter] Measured panResponderViewRef: screenX:${px}, screenY:${py}, width:${w}, height:${h}`);
        setContainerScreenOffset({ x: px, y: py });
      });
    }
  };

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
      console.log(`[ImageHighlighter] Remeasuring panResponderViewRef: screenX:${px}, screenY:${py}, width:${w}, height:${h}`);
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
        <Image
          source={{ uri: imageUri }}
          style={[
            styles.image, // Now contains width/height 100%
            { transform: [{ rotate: `${rotation}deg` }] }
          ]}
          resizeMode="contain"
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

      {/* Highlights and Crop Box are direct children of styles.container, positioned absolutely */}
      {renderHighlightBox()}
      {renderCropBox()}

      {/* Rotate mode instructions could be inside or outside, positioned absolutely */}
      {rotateMode && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>Drag to rotate the image</Text>
        </View>
      )}
      {isProcessing && (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingIndicator}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        </View>
      )}

      {/* Other instruction texts */}
      {highlightModeActive && !isDrawing && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>Draw a box around the text</Text>
        </View>
      )}
      {cropMode && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>{
            cropBox.width === 0 && cropBox.height === 0 
              ? 'Drag to create a crop box' 
              : 'Drag the corner handles to adjust the crop'
          }</Text>
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
    overflow: 'visible',
    // borderWidth: 2, // REMOVE Temporary for debugging
    // borderColor: 'blue', // REMOVE Temporary for debugging
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
    overflow: 'visible',
    backgroundColor: 'transparent',
    // borderWidth: 2, // REMOVE Temporary for debugging
    // borderColor: 'red', // REMOVE Temporary for debugging
  },
  image: {
    width: '100%', // Fill parent
    height: '100%', // Fill parent
    backgroundColor: 'transparent',
    overflow: 'visible',
    // borderWidth: 2, // REMOVE Temporary for debugging
    // borderColor: 'lime', // REMOVE Temporary for debugging
  },
  highlight: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#FF0000', // Bright red for visibility
    backgroundColor: 'transparent', // No background to see exact positioning
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
    borderWidth: 2,
    borderColor: '#000000',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    pointerEvents: 'none',
  },
  cropHandle: {
    position: 'absolute',
    width: CROP_HANDLE_SIZE,
    height: CROP_HANDLE_SIZE,
    borderRadius: CROP_HANDLE_SIZE / 2,
    backgroundColor: '#000000',
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
    borderColor: '#000000',
    transform: [{ scale: 1.2 }],
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingIndicator: {
    backgroundColor: 'transparent',
    padding: 10,
  },
  instructionContainer: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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