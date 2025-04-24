import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
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
import { Ionicons } from '@expo/vector-icons';

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
  };
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
  
  // Reference to the image view for capturing screenshots
  const imageViewRef = useRef<View>(null);
  
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
    })
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

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Allow highlighting only when highlight mode is active
      // Allow crop interactions when in crop mode
      return highlightModeActive || cropMode || Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10;
    },
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      
      if (cropMode) {
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
      // If in highlight mode and not in crop mode, start drawing
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
      
      // Handle crop box drawing
      if (cropMode && isCropDrawing) {
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
      // Reset active crop handle
      if (cropMode) {
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
    if (!isDrawing) return null;
    
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
      // Exit highlight mode if it's active
      if (highlightModeActive && onActivateHighlightMode) {
        onActivateHighlightMode();
      }
      // Reset crop box to empty state
      setCropBox({ x: 0, y: 0, width: 0, height: 0 });
      setIsCropDrawing(false);
    }
  };

  // Apply the crop
  const applyCrop = () => {
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
      };
      console.log('[ImageHighlighter] originalRegion (original image coordinates):', originalRegion);
      
      // Ensure no negative values and dimensions don't exceed image bounds
      const safeRegion = {
        x: Math.max(0, Math.min(originalRegion.x, imageWidth - 1)),
        y: Math.max(0, Math.min(originalRegion.y, imageHeight - 1)),
        width: Math.max(5, Math.min(originalRegion.width, imageWidth - originalRegion.x)),
        height: Math.max(5, Math.min(originalRegion.height, imageHeight - originalRegion.y))
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
  };

  // Reset when image changes
  React.useEffect(() => {
    console.log('[ImageHighlighter] imageUri changed:', imageUri);
    setCropMode(false);
    setCropBox({ x: 0, y: 0, width: 0, height: 0 });
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
      
      {/* Crop mode toggle button */}
      <TouchableOpacity 
        style={styles.cropToggleButton}
        onPress={toggleCropMode}
      >
        <Text style={styles.buttonText}>{cropMode ? 'Cancel Crop' : 'Crop Image'}</Text>
      </TouchableOpacity>
      
      {/* Confirm crop button (only shown in crop mode with valid box) */}
      {cropMode && cropBox.width !== 0 && cropBox.height !== 0 && (
        <TouchableOpacity 
          style={styles.confirmCropButton}
          onPress={applyCrop}
        >
          <Text style={styles.buttonText}>Apply Crop</Text>
        </TouchableOpacity>
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
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    pointerEvents: 'none',
  },
  detectedRegion: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00FF00',
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    pointerEvents: 'none',
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#777777',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(119, 119, 119, 0.1)',
    pointerEvents: 'none',
  },
  cropHandle: {
    position: 'absolute',
    width: CROP_HANDLE_SIZE,
    height: CROP_HANDLE_SIZE,
    borderRadius: CROP_HANDLE_SIZE / 2,
    backgroundColor: '#777777',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  activeHandle: {
    backgroundColor: '#007AFF',
    borderColor: '#FFFFFF',
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
    alignSelf: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    zIndex: 100,
  },
  confirmCropButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#22C55E',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
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