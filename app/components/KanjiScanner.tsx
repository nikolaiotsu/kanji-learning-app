import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import CameraButton from './CameraButton';
import ImageHighlighter from './ImageHighlighter';

interface CapturedImage {
  uri: string;
  width: number;
  height: number;
}

export default function KanjiScanner() {
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);

  const handlePhotoCapture = (imageInfo: CapturedImage) => {
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
        <ImageHighlighter
          imageUri={capturedImage.uri}
          imageWidth={capturedImage.width}
          imageHeight={capturedImage.height}
          onRegionSelected={handleRegionSelected}
        />
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
}); 