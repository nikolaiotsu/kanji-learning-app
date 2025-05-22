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

const ImageHighlighter = forwardRef<ImageHighlighterRef, ImageHighlighterProps>(({
  imageUri,
  imageWidth,
  imageHeight,
  highlightModeActive = false,
  onActivateHighlightMode,
  onRegionSelected,
  onRotationStateChange,
}, ref) => {
  const [measuredLayout, setMeasuredLayout] = useState<{width: number, height: number} | null>(null);

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
    // IMPORTANT CHANGE: Don't try to fit the image to the container dimensions
    // Instead, use the actual image dimensions, and let the resizeMode='contain' handle fitting
    
    // For very large images, we'll still constrain the maximum size to the screen size
    const maxContainerWidth = measuredLayout.width;
    const maxContainerHeight = measuredLayout.height;
    
    if (imageWidth <= maxContainerWidth && imageHeight <= maxContainerHeight) {
      // For images smaller than the container, use the actual image size
      scaledContainerWidth = imageWidth;
      scaledContainerHeight = imageHeight;
    } else {
      // For images larger than the container, scale down while maintaining aspect ratio
      const aspectRatio = imageWidth / imageHeight;
      scaledContainerWidth = maxContainerWidth;
      scaledContainerHeight = scaledContainerWidth / aspectRatio;

      if (scaledContainerHeight > maxContainerHeight) {
        scaledContainerHeight = maxContainerHeight;
        scaledContainerWidth = scaledContainerHeight * aspectRatio;
      }
    }
    
    // Update these values for other calculations in the component
    finalDisplayImageWidth = scaledContainerWidth;
    finalDisplayImageHeight = scaledContainerHeight;
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
        
        // Convert crop box coordinates to be relative to the original image
        // The result will be the actual pixel coordinates in the original image
        const originalRegion = {
          x: Math.round((validCrop.x / scaledContainerWidth) * imageWidth),
          y: Math.round((validCrop.y / scaledContainerHeight) * imageHeight),
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
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return highlightModeActive || cropMode || rotateMode || 
             Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10;
    },
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      
      if (rotateMode) {
        const currentFingerAngle = calculateAngle(locationX, locationY);
        imageRotationAtGestureStartRef.current = rotation; // Image's rotation before this gesture
        lastVisuallyAppliedRotationRef.current = rotation; // Sync with current visual state. This is the base for smoothing.
        previousFingerAngleRef.current = currentFingerAngle;
        accumulatedAngleDeltaForGestureRef.current = 0; // Reset finger movement accumulator for this new gesture
        console.log(`[DEBUG IH] GRANT - Finger Angle: ${currentFingerAngle.toFixed(2)}, Rotation at Gesture Start: ${imageRotationAtGestureStartRef.current.toFixed(2)}, Last Visually Applied (for smoothing start): ${lastVisuallyAppliedRotationRef.current.toFixed(2)}`);
      }
      else if (cropMode) {
        if (activeCropHandle === null && !isCropDrawing && (cropBox.width === 0 && cropBox.height === 0)) {
          // Start drawing a new crop box
          console.log('[ImageHighlighter] Starting to draw new crop box');
          setIsCropDrawing(true);
          setCropBox({
            x: locationX,
            y: locationY,
            width: 0,
            height: 0
          });
        } else if (cropBox.width > 0 && cropBox.height > 0) {
          // Check if a crop handle was touched
          const { x, y, width, height } = cropBox;
          
          // Check corners (handles) with larger touch areas
          if (isPointInHandleArea(locationX, locationY, x, y)) {
            setActiveCropHandle('topLeft');
          } else if (isPointInHandleArea(locationX, locationY, x + width, y)) {
            setActiveCropHandle('topRight');
          } else if (isPointInHandleArea(locationX, locationY, x, y + height)) {
            setActiveCropHandle('bottomLeft');
          } else if (isPointInHandleArea(locationX, locationY, x + width, y + height)) {
            setActiveCropHandle('bottomRight');
          } 
          // Check if inside the crop box (for moving the entire box)
          else if (locationX >= x && locationX <= x + width && locationY >= y && locationY <= y + height) {
            setActiveCropHandle('move');
          }
        }
      } 
      // If in highlight mode and not in other modes, start drawing
      else if (highlightModeActive) {
        console.log('[DEBUG][Highlight] Start touch:', 
          { locationX, locationY, scaledContainerWidth, scaledContainerHeight });

        setIsDrawing(true);
        setHighlightBox({
          startX: locationX,
          startY: locationY,
          endX: locationX,
          endY: locationY,
        });
      }
    },
    onPanResponderMove: (evt, gestureState: PanResponderGestureState) => {
      const { locationX, locationY } = evt.nativeEvent;
      
      if (rotateMode) {
        if (previousFingerAngleRef.current === null) { 
          const initAngle = calculateAngle(locationX, locationY);
          previousFingerAngleRef.current = initAngle;
          accumulatedAngleDeltaForGestureRef.current = 0; 
          // Safety: ensure imageRotationAtGestureStartRef & lastVisuallyAppliedRotationRef are based on current rotation if grant was missed
          imageRotationAtGestureStartRef.current = rotation;
          lastVisuallyAppliedRotationRef.current = rotation;
          console.log(`[DEBUG IH] MOVE - SAFETY INIT - PrevFingerAngle: ${initAngle.toFixed(2)}`);
          return;
        }

        const currentFingerAngle = calculateAngle(locationX, locationY);
        let incrementalAngleDiff = currentFingerAngle - previousFingerAngleRef.current;
        
        if (incrementalAngleDiff > 180) incrementalAngleDiff -= 360;
        if (incrementalAngleDiff < -180) incrementalAngleDiff += 360;

        accumulatedAngleDeltaForGestureRef.current += incrementalAngleDiff; 
        previousFingerAngleRef.current = currentFingerAngle; 

        // Calculate the raw target rotation based on the gesture from its start
        const targetRawRotation = imageRotationAtGestureStartRef.current + accumulatedAngleDeltaForGestureRef.current;

        // Apply smoothing: new_value = old_value * (1 - alpha) + target_value * alpha
        // Here, 'old_value' is the last rotation we commanded the UI to set.
        const newSmoothedRotation =
          lastVisuallyAppliedRotationRef.current * (1 - ROTATION_SMOOTHING_FACTOR) +
          targetRawRotation * ROTATION_SMOOTHING_FACTOR;
        
        console.log(`[DEBUG IH] MOVE - AccDelta: ${accumulatedAngleDeltaForGestureRef.current.toFixed(2)}, TargetRaw: ${targetRawRotation.toFixed(2)}, LastApplied: ${lastVisuallyAppliedRotationRef.current.toFixed(2)}, SmoothedNew: ${newSmoothedRotation.toFixed(2)}`);

        setRotation(newSmoothedRotation);
        lastVisuallyAppliedRotationRef.current = newSmoothedRotation; // Update ref to the smoothed value we just set
        
        // ROTATION_THRESHOLD logic is removed. The old const ROTATION_THRESHOLD = 3.0; has been removed.
      }
      // Handle crop box drawing
      else if (cropMode && isCropDrawing) {
        setCropBox(prev => ({
          ...prev,
          width: locationX - prev.x,
          height: locationY - prev.y,
        }));
      }
      // Handle crop box manipulation
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
            // Move the entire crop box, ensuring it stays within image bounds
            setCropBox({
              x: Math.max(0, Math.min(x + dx, scaledContainerWidth - width)),
              y: Math.max(0, Math.min(y + dy, scaledContainerHeight - height)),
              width,
              height
            });
            break;
        }
        
        // Reset gesture state to avoid cumulative changes
        gestureState.dx = 0;
        gestureState.dy = 0;
      }
      // Handle drawing in highlight mode
      else if (isDrawing && highlightModeActive) {
        setHighlightBox(prev => ({
          ...prev,
          endX: locationX,
          endY: locationY,
        }));
      }
    },
    onPanResponderRelease: async (evt, gestureState: PanResponderGestureState) => {
      if (rotateMode) {
        // On release, snap to the final raw target rotation for precision
        const finalTargetRawRotation = imageRotationAtGestureStartRef.current + accumulatedAngleDeltaForGestureRef.current;
        
        console.log(`[DEBUG IH] RELEASE - Initial @ Grant: ${imageRotationAtGestureStartRef.current.toFixed(2)}, AccDelta Gest: ${accumulatedAngleDeltaForGestureRef.current.toFixed(2)}. Final Target Raw: ${finalTargetRawRotation.toFixed(2)}`);
        
        // Apply the final, non-smoothed rotation
        setRotation(finalTargetRawRotation);
        lastVisuallyAppliedRotationRef.current = finalTargetRawRotation; // Ensure this ref reflects the final state

        previousFingerAngleRef.current = null; 
        
        console.log(`[DEBUG IH] RELEASE - Final visual rotation set to: ${finalTargetRawRotation.toFixed(2)}`);
      }
      // Reset active crop handle
      else if (cropMode) {
        setActiveCropHandle(null);
        
        if (isCropDrawing) {
          setIsCropDrawing(false);
          
          // Normalize the crop box coordinates (ensure positive width/height)
          const { x, y, width, height } = cropBox;
          const normalizedCropBox: CropBox = {
            x: width < 0 ? x + width : x,
            y: height < 0 ? y + height : y,
            width: Math.abs(width),
            height: Math.abs(height)
          };
          
          console.log('[ImageHighlighter] Crop box drawn:', normalizedCropBox);
          // Setting crop box triggers UI refresh and hasCropRegion update
          setCropBox(normalizedCropBox);
        }
      }
      
      // Handle end of drawing highlight box
      if (isDrawing && highlightModeActive) {
        setIsDrawing(false);
        
        if (onRegionSelected) {
          const minX = Math.min(highlightBox.startX, highlightBox.endX);
          const maxX = Math.max(highlightBox.startX, highlightBox.endX);
          const minY = Math.min(highlightBox.startY, highlightBox.endY);
          const maxY = Math.max(highlightBox.startY, highlightBox.endY);
          
          console.log('[ImageHighlighter] Raw Touch Coords:', { minX, minY, maxX, maxY });
          console.log('[ImageHighlighter] Container Dims:', { scaledContainerWidth, scaledContainerHeight });
          console.log('[ImageHighlighter] Actual Display Dims:', { finalDisplayImageWidth, finalDisplayImageHeight });
          console.log('[ImageHighlighter] Display Offsets:', { displayImageOffsetX, displayImageOffsetY });
          console.log('[ImageHighlighter] Original Prop Dims:', { imageWidth, imageHeight });

          // Ensure we have a valid selection size
          if (maxX - minX < 10 || maxY - minY < 10) {
            console.log('Selection too small, ignoring');
            
            // Reset highlight box for tiny selections
            setHighlightBox({
              startX: 0,
              startY: 0,
              endX: 0,
              endY: 0,
            });
            return;
          }

          // Check for extremely wide selections that might cause issues
          const selectionWidth = maxX - minX;
          const selectionHeight = maxY - minY;
          
          // Log selection dimensions as percentage of container
          const widthPercentage = (selectionWidth / scaledContainerWidth) * 100;
          const heightPercentage = (selectionHeight / scaledContainerHeight) * 100;
          console.log(`[ImageHighlighter] Selection dimensions: ${selectionWidth}x${selectionHeight} (${widthPercentage.toFixed(1)}% x ${heightPercentage.toFixed(1)}% of container)`);
          
          // Special handling for wide selections to ensure all text is captured
          const isExtremelyWide = widthPercentage > 70;
          if (isExtremelyWide) {
            console.log('[ImageHighlighter] Extremely wide selection detected - using enhanced coordinate handling');
          }
          
          // The coordinates are relative to the imageContainer (pan responder view).
          // Adjust them to be relative to the actual visible image content.
          // Add safety bounds checks to handle edge cases with wide selections
          const offsetX = displayImageOffsetX || 0; // Default to 0 if undefined
          const offsetY = displayImageOffsetY || 0; // Default to 0 if undefined
          
          // For very wide selections, we slightly expand the region
          const horizontalExpansion = isExtremelyWide ? selectionWidth * 0.02 : 0; // 2% expansion for wide selections
          
          // Calculate the unscaled region with bounds checking
          const unscaledRegion = {
            x: Math.max(0, minX - offsetX - (isExtremelyWide ? horizontalExpansion : 0)),
            y: Math.max(0, minY - offsetY),
            width: Math.min(selectionWidth + (isExtremelyWide ? horizontalExpansion * 2 : 0), 
                          finalDisplayImageWidth - Math.max(0, minX - offsetX - (isExtremelyWide ? horizontalExpansion : 0))),
            height: Math.min(selectionHeight, finalDisplayImageHeight - Math.max(0, minY - offsetY)),
          };
          
          // Log the expansion value for debugging
          if (isExtremelyWide) {
            console.log(`[ImageHighlighter] Applied horizontal expansion of ${horizontalExpansion.toFixed(1)}px to wide selection`);
          }
          
          // Ensure we don't have a negative width/height due to bounds adjustments
          if (unscaledRegion.width <= 0) unscaledRegion.width = 10;
          if (unscaledRegion.height <= 0) unscaledRegion.height = 10;
          
          console.log('[ImageHighlighter] Calculated unscaledRegion (to be sent):', unscaledRegion);
          console.log('[ImageHighlighter] Selection size in image space:', {
            widthPx: unscaledRegion.width, 
            heightPx: unscaledRegion.height,
            widthRatio: unscaledRegion.width / finalDisplayImageWidth,
            heightRatio: unscaledRegion.height / finalDisplayImageHeight
          });

          console.log('Sending coordinates for OCR (adjusted for display offset):', unscaledRegion);
          
          try {
            setIsProcessing(true);
            // We don't reset the highlight box here, so it stays visible for confirmation
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
    
    const minX = Math.min(highlightBox.startX, highlightBox.endX);
    const maxX = Math.max(highlightBox.startX, highlightBox.endX);
    const minY = Math.min(highlightBox.startY, highlightBox.endY);
    const maxY = Math.max(highlightBox.startY, highlightBox.endY);

    return (
      <View
        style={[
          styles.highlight,
          {
            position: 'absolute',
            left: minX,
            top: minY,
            width: maxX - minX,
            height: maxY - minY,
          }
        ]}
      />
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
      measuredLayout
    });
  }, [imageUri, imageWidth, imageHeight, highlightModeActive, measuredLayout]);

  const onLayout = (event: import('react-native').LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    console.log('[ImageHighlighter] onLayout: width:', width, 'height:', height);
    setMeasuredLayout({ width, height });
  };

  // Render null or a placeholder if layout hasn't been measured yet, or if image dimensions are invalid
  if (!measuredLayout || scaledContainerWidth === 0 || scaledContainerHeight === 0) {
    return (
      <View style={styles.container} onLayout={onLayout}>
        {/* Optional: Could render a loading spinner here if desired */}
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      <View style={styles.imageWrapper}>
        <View 
          ref={imageViewRef}
          {...panResponder.panHandlers} 
          style={[
            styles.imageContainer,
            { 
              width: scaledContainerWidth,
              height: scaledContainerHeight,
              // Add explicit dimensions to ensure the container maintains the right size
              maxWidth: imageWidth,
              maxHeight: imageHeight,
            }
          ]}
        >
          <Image
            source={{ uri: imageUri }}
            style={[
              styles.image,
              {
                transform: [{ rotate: `${rotation}deg` }],
                width: scaledContainerWidth,
                height: scaledContainerHeight,
              }
            ]}
            resizeMode="contain"
          />
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
          
          {/* Draw the highlight box */}
          {renderHighlightBox()}
          
          {/* Draw the crop box when in crop mode */}
          {renderCropBox()}
          
          {rotateMode && (
            <View style={styles.instructionContainer}>
              <Text style={styles.instructionText}>
                Drag to rotate the image
              </Text>
            </View>
          )}
          
          {isProcessing && (
            <View style={styles.loadingContainer}>
              <View style={styles.loadingIndicator}>
                <ActivityIndicator size="large" color="#007AFF" />
              </View>
            </View>
          )}
        </View>
      </View>
      
      {highlightModeActive && !isDrawing && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>
            Draw a box around the text
          </Text>
        </View>
      )}
      
      {cropMode && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>
            {cropBox.width === 0 && cropBox.height === 0 
              ? 'Drag to create a crop box' 
              : 'Drag the corner handles to adjust the crop'}
          </Text>
        </View>
      )}
    </View>
  );
});

// Add display name for debugging
ImageHighlighter.displayName = 'ImageHighlighter';

const styles = StyleSheet.create({
  container: {
    flex: 1, // Important: allows onLayout to measure space given by parent
    width: '100%', // Takes width from parent
    overflow: 'visible',
    // Removed position: relative, as it might not be needed if flex is handled by parent
    // backgroundColor: 'rgba(0,255,0,0.1)', // DEBUG: to see the container bounds
  },
  imageWrapper: {
    flex: 1, // Fill the container
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    overflow: 'visible',
    // padding: VERTICAL_PADDING, // REMOVED - parent should handle margins/padding to this component
    // backgroundColor: 'rgba(255,0,0,0.1)', // DEBUG: to see the wrapper bounds
  },
  imageContainer: {
    position: 'relative',
    alignSelf: 'center',
    overflow: 'visible',
    maxWidth: '100%', 
    maxHeight: '100%',
    backgroundColor: 'transparent', // Explicitly set background to transparent
  },
  image: {
    backgroundColor: 'transparent',
    // Don't use percentage values which can cause resizing
    // The explicit dimensions will be set in the style props
    overflow: 'visible',
  },
  highlight: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(95, 122, 219, 0.1)',
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
    borderColor: COLORS.accentLight,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(237, 242, 251, 0.1)',
    pointerEvents: 'none',
  },
  cropHandle: {
    position: 'absolute',
    width: CROP_HANDLE_SIZE,
    height: CROP_HANDLE_SIZE,
    borderRadius: CROP_HANDLE_SIZE / 2,
    backgroundColor: COLORS.accentLight,
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
    borderColor: COLORS.accentLight,
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