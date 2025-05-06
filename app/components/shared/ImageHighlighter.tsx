import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import {
  View,
  Image,
  StyleSheet,
  PanResponder,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { detectJapaneseText } from '../../services/visionApi';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';

// Define the type for the forwarded ref handle
export interface ImageHighlighterRef {
  getView: () => View | null;
  getTransformData: () => {
    scale: number;
    translateX: number;
    translateY: number;
    imageWidth: number;
    imageHeight: number;
    scaledWidth: number;
    scaledHeight: number;
    rotation: number;
  };
  toggleCropMode: () => void;
  toggleRotateMode: () => void;
  applyCrop: () => void;
  applyRotation: () => void;
  hasCropRegion: boolean;
  hasRotation: boolean;
  clearHighlightBox: () => void;
}

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
}

// Let's define a type for our crop box to ensure type consistency
interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Constants for layout calculations
const BUTTON_CONTAINER_HEIGHT = 100; // Height reserved for buttons
const VERTICAL_PADDING = 40; // Reduced padding to allow more space for image
const BUTTON_HEIGHT = 60; // Height of the buttons
const CROP_HANDLE_SIZE = 30; // Increased size of crop handles
const CROP_HANDLE_TOUCH_AREA = 40; // Larger touch area for crop handles

const ImageHighlighter = forwardRef<ImageHighlighterRef, ImageHighlighterProps>(({
  imageUri,
  imageWidth,
  imageHeight,
  highlightModeActive = false,
  onActivateHighlightMode,
  onRegionSelected,
}, ref) => {
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
  const [rotateStartAngle, setRotateStartAngle] = useState(0);

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
  
  // Forward the imageViewRef and transform data to parent component
  useImperativeHandle(ref, () => ({
    getView: () => imageViewRef.current, // Return View or null
    getTransformData: () => ({
      scale: 1, // We don't zoom anymore, but keep this for backward compatibility
      translateX: 0,
      translateY: 0,
      imageWidth,
      imageHeight,
      scaledWidth,
      scaledHeight,
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
        }
        // Reset crop box to empty state
        setCropBox({ x: 0, y: 0, width: 0, height: 0 });
        setIsCropDrawing(false);
      }
    },
    toggleRotateMode: () => {
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
          x: Math.round((validCrop.x / scaledWidth) * imageWidth),
          y: Math.round((validCrop.y / scaledHeight) * imageHeight),
          width: Math.round((validCrop.width / scaledWidth) * imageWidth),
          height: Math.round((validCrop.height / scaledHeight) * imageHeight),
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
    applyRotation: () => {
      if (!rotateMode || !onRegionSelected) return;
      
      try {
        console.log('[ImageHighlighter] applyRotation called - Applying rotation:', rotation);
        setIsProcessing(true);
        
        // Create a region covering the whole image to apply rotation
        const fullImageRegion = {
          x: 0,
          y: 0,
          width: imageWidth,
          height: imageHeight,
          rotation: rotation
        };
        
        // Use the existing onRegionSelected callback to process the rotation
        console.log('[ImageHighlighter] Calling onRegionSelected with rotation');
        onRegionSelected(fullImageRegion);
        console.log('[ImageHighlighter] onRegionSelected callback completed');
        
        // Exit rotate mode after applying
        setRotateMode(false);
        
        // Note: We don't call setIsProcessing(false) here anymore
        // Let the parent component (KanjiScanner) control this state
        // through re-rendering with the new image
      } catch (error) {
        console.error("Error applying rotation:", error);
        setIsProcessing(false); // Only clear on error
      }
    },
    // Computed property to check if a crop region exists
    get hasCropRegion() {
      // Check if there's a valid crop box with meaningful dimensions (at least 10x10 pixels)
      return cropMode && cropBox.width !== 0 && cropBox.height !== 0 && 
             Math.abs(cropBox.width) > 10 && Math.abs(cropBox.height) > 10;
    },
    // Computed property to check if rotation has changed
    get hasRotation() {
      // Consider a rotation change of at least 1 degree as significant
      // Also check if rotation mode is active
      const rotationDelta = Math.abs(rotation - initialRotation);
      const hasChanged = rotationDelta > 1;
      console.log('[ImageHighlighter] Checking hasRotation:', { 
        rotation, 
        initialRotation, 
        delta: rotationDelta,
        hasChanged
      });
      return rotateMode && hasChanged;
    },
    clearHighlightBox: () => {
      setIsDrawing(false);
      setHighlightBox({ startX: 0, startY: 0, endX: 0, endY: 0 });
      // Also reset any detected regions that might be displayed
      setDetectedRegions([]);
    }
  }));

  // Use window dimensions hook for more reliable screen measurements
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Calculate available space for image
  const availableHeight = screenHeight - BUTTON_CONTAINER_HEIGHT - (VERTICAL_PADDING * 2) - BUTTON_HEIGHT;
  const availableWidth = screenWidth - (Platform.OS === 'ios' ? 20 : 16); // Reduced horizontal padding

  // Calculate scaled dimensions while maintaining aspect ratio
  const aspectRatio = imageWidth / imageHeight;
  let scaledWidth = availableWidth;
  let scaledHeight = scaledWidth / aspectRatio;

  // If height exceeds available space, scale down based on height
  if (scaledHeight > availableHeight) {
    scaledHeight = availableHeight;
    scaledWidth = scaledHeight * aspectRatio;
  }

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
    const centerX = scaledWidth / 2;
    const centerY = scaledHeight / 2;
    return Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Allow interaction based on active modes
      return highlightModeActive || cropMode || rotateMode || 
             Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10;
    },
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      
      if (rotateMode) {
        // Store the starting angle for rotation
        const startAngle = calculateAngle(locationX, locationY);
        setRotateStartAngle(startAngle);
        console.log('[ImageHighlighter] Starting rotation from angle:', startAngle);
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
          { locationX, locationY, scaledWidth, scaledHeight });

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
        // Calculate the current angle
        const currentAngle = calculateAngle(locationX, locationY);
        // Calculate the difference from the start angle
        let angleDelta = currentAngle - rotateStartAngle;
        
        // Normalize the angle delta to prevent large jumps
        if (angleDelta > 180) angleDelta -= 360;
        if (angleDelta < -180) angleDelta += 360;
        
        // Apply rotation change with some damping for smoother control
        const dampingFactor = 0.5;
        const newRotation = initialRotation + (angleDelta * dampingFactor);
        
        // Update rotation state
        setRotation(newRotation);
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
              x: Math.max(0, Math.min(x + dx, scaledWidth - width)),
              y: Math.max(0, Math.min(y + dy, scaledHeight - height)),
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
    onPanResponderRelease: async (evt) => {
      if (rotateMode) {
        // When done with rotation, update the initial rotation for next interaction
        // but keep the difference between initial and current rotation to properly
        // detect hasRotation even after the first interaction
        const rotationDelta = rotation - initialRotation;
        setInitialRotation(rotation - rotationDelta);
        
        // Log the rotation change for debugging
        console.log('[ImageHighlighter] Rotation updated:', {
          rotation,
          initialRotation,
          delta: rotationDelta,
          hasChanged: Math.abs(rotationDelta) > 1
        });
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

          // The coordinates are already in view-relative space
          const unscaledRegion = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };

          console.log('Sending coordinates for OCR:', unscaledRegion);
          
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
    setRotateMode(false);
    setCropBox({ x: 0, y: 0, width: 0, height: 0 });
    setRotation(0);
  }, [imageUri]);
  
  // Log when component renders with new props
  React.useEffect(() => {
    console.log('[ImageHighlighter] Component rendered with props:', {
      imageUri,
      imageWidth,
      imageHeight,
      highlightModeActive
    });
  }, [imageUri, imageWidth, imageHeight, highlightModeActive]);

  return (
    <View style={styles.container}>
      <View style={styles.imageWrapper}>
        <View 
          ref={imageViewRef}
          {...panResponder.panHandlers} 
          style={[
            styles.imageContainer,
            { 
              width: scaledWidth,
              height: scaledHeight,
            }
          ]}
        >
          <Image
            source={{ uri: imageUri }}
            style={[
              styles.image,
              {
                width: scaledWidth,
                height: scaledHeight,
                transform: [{ rotate: `${rotation}deg` }]
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
                  left: (region.boundingBox.x / imageWidth) * scaledWidth,
                  top: (region.boundingBox.y / imageHeight) * scaledHeight,
                  width: (region.boundingBox.width / imageWidth) * scaledWidth,
                  height: (region.boundingBox.height / imageHeight) * scaledHeight,
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
              <ActivityIndicator size="large" color="#007AFF" />
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
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  imageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingBottom: BUTTON_HEIGHT + 10, // Reduced bottom padding
    paddingHorizontal: Platform.OS === 'ios' ? 10 : 8, // Reduced horizontal padding
  },
  imageContainer: {
    position: 'relative',
    alignSelf: 'center',
    overflow: 'hidden',
    maxWidth: '100%', // Ensure it doesn't overflow the screen width
    maxHeight: '95%', // Take up to 95% of available height
  },
  image: {
    backgroundColor: 'transparent',
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
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
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