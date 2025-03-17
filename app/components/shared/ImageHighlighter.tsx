import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { detectJapaneseText } from '../../services/visionApi';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { Ionicons } from '@expo/vector-icons';

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

// Constants for layout calculations
const BUTTON_CONTAINER_HEIGHT = 100; // Height reserved for buttons
const VERTICAL_PADDING = 80; // Increased padding to avoid button overlap
const BUTTON_HEIGHT = 60; // Height of the buttons

export default function ImageHighlighter({
  imageUri,
  imageWidth,
  imageHeight,
  highlightModeActive = false,
  onActivateHighlightMode,
  onRegionSelected,
}: ImageHighlighterProps) {
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
  }>>([]);

  // Use window dimensions hook for more reliable screen measurements
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Calculate available space for image
  const availableHeight = screenHeight - BUTTON_CONTAINER_HEIGHT - (VERTICAL_PADDING * 2) - BUTTON_HEIGHT;
  const availableWidth = screenWidth - (Platform.OS === 'ios' ? 40 : 32); // Account for horizontal padding

  // Calculate scaled dimensions while maintaining aspect ratio
  const aspectRatio = imageWidth / imageHeight;
  let scaledWidth = availableWidth;
  let scaledHeight = scaledWidth / aspectRatio;

  // If height exceeds available space, scale down based on height
  if (scaledHeight > availableHeight) {
    scaledHeight = availableHeight;
    scaledWidth = scaledHeight * aspectRatio;
  }

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => highlightModeActive,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      setIsDrawing(true);
      setHighlightBox({
        startX: locationX,
        startY: locationY,
        endX: locationX,
        endY: locationY,
      });
    },
    onPanResponderMove: (evt) => {
      if (isDrawing) {
        const { locationX, locationY } = evt.nativeEvent;
        setHighlightBox(prev => ({
          ...prev,
          endX: locationX,
          endY: locationY,
        }));
      }
    },
    onPanResponderRelease: async () => {
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

        const region = {
          x: Math.max(0, Math.round(minX / (scaledWidth / imageWidth))),
          y: Math.max(0, Math.round(minY / (scaledHeight / imageHeight))),
          width: Math.round((maxX - minX) / (scaledWidth / imageWidth)),
          height: Math.round((maxY - minY) / (scaledHeight / imageHeight)),
        };

        // Ensure coordinates don't exceed image boundaries
        region.width = Math.min(region.width, imageWidth - region.x);
        region.height = Math.min(region.height, imageHeight - region.y);

        console.log('Sending region to API:', region);

        try {
          setIsProcessing(true);
          const detectedText = await detectJapaneseText(imageUri, region);
          setDetectedRegions(detectedText);
          
          // Get all detected Japanese text
          const japaneseText = detectedText.map(item => item.text).join('\n');
          
          // Navigate to flashcards screen with the detected text
          router.push({
            pathname: "/flashcards",
            params: { text: japaneseText }
          });
          
        } catch (error) {
          console.error('Error detecting text:', error);
          setDetectedRegions([]);
        } finally {
          setIsProcessing(false);
        }
      }
    },
  });

  const getHighlightStyle = () => {
    const minX = Math.min(highlightBox.startX, highlightBox.endX);
    const maxX = Math.max(highlightBox.startX, highlightBox.endX);
    const minY = Math.min(highlightBox.startY, highlightBox.endY);
    const maxY = Math.max(highlightBox.startY, highlightBox.endY);

    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  const activateHighlightMode = () => {
    if (onActivateHighlightMode) {
      onActivateHighlightMode();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.imageWrapper}>
        <View 
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
          {isDrawing && (
            <View
              style={[
                styles.highlight,
                getHighlightStyle(),
              ]}
            />
          )}
          {detectedRegions.map((region, index) => (
            <View
              key={index}
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
    </View>
  );
}

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
    paddingBottom: BUTTON_HEIGHT + 20, // Add padding at the bottom to avoid button overlap
  },
  imageContainer: {
    position: 'relative',
    alignSelf: 'center',
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
}); 