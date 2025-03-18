import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import CameraButton from './CameraButton';
import ImageHighlighter from '../shared/ImageHighlighter';
import { useKanjiRecognition } from '../../hooks/useKanjiRecognition';
import { COLORS } from '../../constants/colors';
import { CapturedImage, TextAnnotation } from '../../../types';

export default function KanjiScanner() {
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [highlightModeActive, setHighlightModeActive] = useState(false);
  const router = useRouter();
  const { recognizeKanji, isProcessing, error } = useKanjiRecognition();

  const handlePhotoCapture = (imageInfo: CapturedImage | null) => {
    setCapturedImage(imageInfo);
    setHighlightModeActive(false);
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setCapturedImage({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        });
        setHighlightModeActive(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  const handleRegionSelected = async (region: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    if (!capturedImage) return;
    
    try {
      const japaneseText = await recognizeKanji(capturedImage.uri, region);
      
      if (japaneseText) {
        router.push({
          pathname: "/screens/flashcards",
          params: { text: japaneseText }
        });
      }
    } catch (error) {
      console.error('Error processing region:', error);
    }
  };

  const handleCancel = () => {
    setCapturedImage(null);
    setHighlightModeActive(false);
  };

  const activateHighlightMode = () => {
    setHighlightModeActive(true);
  };

  return (
    <View style={styles.container}>
      {!capturedImage ? (
        <View style={styles.buttonContainer}>
          <CameraButton onPhotoCapture={handlePhotoCapture} />
          <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
            <Ionicons name="images" size={24} color="white" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.imageContainer}>
          <ImageHighlighter
            imageUri={capturedImage.uri}
            imageWidth={capturedImage.width}
            imageHeight={capturedImage.height}
            highlightModeActive={highlightModeActive}
            onActivateHighlightMode={activateHighlightMode}
            onRegionSelected={handleRegionSelected}
          />
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          {!highlightModeActive && (
            <TouchableOpacity 
              style={styles.highlightButton} 
              onPress={activateHighlightMode}
            >
              <Ionicons name="text" size={24} color="white" />
            </TouchableOpacity>
          )}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>
      )}
      
      {!capturedImage && (
        <TouchableOpacity 
          style={styles.viewFlashcardsButton} 
          onPress={() => router.push('/saved-flashcards')}
        >
          <Ionicons name="albums-outline" size={20} color="#000" style={styles.buttonIcon} />
          <Text style={styles.viewFlashcardsText}>View Saved Flashcards</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  galleryButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  imageContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  cancelButton: {
    backgroundColor: COLORS.danger,
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'absolute',
    bottom: 20,
    left: 20,
    zIndex: 999,
  },
  highlightButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'absolute',
    bottom: 20,
    right: 20,
    zIndex: 999,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 45, 85, 0.8)',
    padding: 10,
    borderRadius: 8,
    position: 'absolute',
    bottom: 20,
    right: 20,
    left: 100,
    zIndex: 999,
  },
  errorText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  viewFlashcardsButton: {
    backgroundColor: '#FFCC00',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  viewFlashcardsText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonIcon: {
    marginRight: 8,
  },
}); 