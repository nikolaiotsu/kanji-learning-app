import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import CameraButton from './CameraButton';
import ImageHighlighter from './ImageHighlighter';
import { useRouter } from 'expo-router';

interface CapturedImage {
  uri: string;
  width: number;
  height: number;
}

interface TextAnnotation {
  description: string;
  // other fields if needed
}

export default function KanjiScanner() {
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const router = useRouter();

  const handlePhotoCapture = (imageInfo: CapturedImage | null) => {
    setCapturedImage(imageInfo);
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
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  const handleRegionSelected = (region: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    // Here you can handle the selected region
    // For example, send it to an OCR service or process it further
    console.log('Selected region:', region);
  };

  const handleCancel = () => {
    setCapturedImage(null); // Reset to initial state, clearing the image
  };

  const handleTextDetected = (detectedText: TextAnnotation[]) => {
    if (detectedText.length > 0) {
      const text = detectedText[0].description;
      router.push({
        pathname: "/flashcards",
        params: { text }
      });
    }
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
            onRegionSelected={handleRegionSelected}
          />
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={() => console.log('Save flashcard')}>
            <Text style={styles.saveButtonText}>Save Flashcard</Text>
          </TouchableOpacity>
        </View>
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
    backgroundColor: '#34C759',
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
    paddingBottom: 120,
  },
  cancelButton: {
    backgroundColor: '#FF2D55',
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
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 20,
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
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});