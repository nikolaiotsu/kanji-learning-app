import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  PanResponder,
  Dimensions,
} from 'react-native';

interface ImageHighlighterProps {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  onRegionSelected?: (region: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}

export default function ImageHighlighter({
  imageUri,
  imageWidth,
  imageHeight,
  onRegionSelected,
}: ImageHighlighterProps) {
  const [highlightBox, setHighlightBox] = useState({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });
  const [isDrawing, setIsDrawing] = useState(false);

  const screenWidth = Dimensions.get('window').width;
  const scale = screenWidth / imageWidth;
  const scaledHeight = imageHeight * scale;

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
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
    onPanResponderRelease: () => {
      setIsDrawing(false);
      if (onRegionSelected) {
        const minX = Math.min(highlightBox.startX, highlightBox.endX);
        const maxX = Math.max(highlightBox.startX, highlightBox.endX);
        const minY = Math.min(highlightBox.startY, highlightBox.endY);
        const maxY = Math.max(highlightBox.startY, highlightBox.endY);
        
        const region = {
          x: minX / scale,
          y: minY / scale,
          width: (maxX - minX) / scale,
          height: (maxY - minY) / scale,
        };
        onRegionSelected(region);
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

  return (
    <View style={styles.container}>
      <View {...panResponder.panHandlers} style={styles.imageContainer}>
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, { width: screenWidth, height: scaledHeight }]}
        />
        {isDrawing && (
          <View
            style={[
              styles.highlight,
              getHighlightStyle(),
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    resizeMode: 'contain',
  },
  highlight: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    pointerEvents: 'none',
  },
}); 