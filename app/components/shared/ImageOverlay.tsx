import React, { useEffect, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

interface ImageOverlayProps {
  imageUri: string;
  visible: boolean;
  onClose: () => void;
}

const ImageOverlay: React.FC<ImageOverlayProps> = ({ 
  imageUri, 
  visible, 
  onClose 
}) => {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Debug: Log props
  console.log('🔍 [DEBUG] ImageOverlay render - visible:', visible, 'imageUri exists:', !!imageUri);

  // Reset loading state when modal visibility changes
  useEffect(() => {
    console.log('🔍 [DEBUG] ImageOverlay visibility changed to:', visible);
    if (visible) {
      setIsImageLoaded(false);
      setImageError(false);
      // Prefetch the image
      if (imageUri) {
        console.log('🔍 [DEBUG] ImageOverlay prefetching image...');
        Image.prefetch(imageUri).catch(() => {
          console.log('🔍 [DEBUG] ImageOverlay prefetch failed');
          setImageError(true);
        });
      }
    }
  }, [visible, imageUri]);

  const handleImageLoad = () => {
    setIsImageLoaded(true);
  };

  const handleImageError = () => {
    setImageError(true);
    setIsImageLoaded(false);
  };

  if (!imageUri || !visible) {
    console.log('🔍 [DEBUG] ImageOverlay not rendering - imageUri:', !!imageUri, 'visible:', visible);
    return null;
  }

  console.log('🔍 [DEBUG] ImageOverlay rendering with absolute positioning');

  return (
    <View style={[styles.overlay, { 
      borderWidth: 5, 
      borderColor: 'yellow',
      backgroundColor: 'rgba(255, 0, 0, 0.8)' // Make it very visible
    }]}>
      <View style={[styles.container, {
        borderWidth: 3,
        borderColor: 'lime',
        backgroundColor: 'rgba(0, 255, 0, 0.8)' // Make it very visible
      }]}>
        {/* Debug indicator */}
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 30,
          backgroundColor: 'red',
          zIndex: 100,
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <Text style={{ color: 'white', fontSize: 12 }}>IMAGE OVERLAY DEBUG</Text>
        </View>
        
        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color={COLORS.text} />
        </TouchableOpacity>

        {/* Scrollable image container */}
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={true}
          scrollEnabled={true}
          maximumZoomScale={2}
          minimumZoomScale={1}
          bouncesZoom={true}
        >
          {/* Loading indicator */}
          {!isImageLoaded && !imageError && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading image...</Text>
            </View>
          )}

          {/* Error state */}
          {imageError && (
            <View style={styles.errorContainer}>
              <Ionicons name="image-outline" size={48} color={COLORS.darkGray} />
              <Text style={styles.errorText}>Failed to load image</Text>
            </View>
          )}

          {/* Image */}
          <Image
            source={{ uri: imageUri }}
            style={[
              styles.image,
              !isImageLoaded && styles.hiddenImage
            ]}
            resizeMode="contain"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </ScrollView>
      </View>
    </View>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    height: '70%',
    maxWidth: 400,
    maxHeight: 500,
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 15,
    padding: 6,
  },
  scrollContainer: {
    flex: 1,
    paddingTop: 45, // Space for close button
  },
  scrollContentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  image: {
    width: '100%',
    height: 300,
    maxWidth: 350,
    borderRadius: 8,
  },
  hiddenImage: {
    opacity: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.text,
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.darkGray,
    marginTop: 10,
    fontSize: 16,
  },
});

export default ImageOverlay; 