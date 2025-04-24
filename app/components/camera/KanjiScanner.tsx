import React, { useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import CameraButton from './CameraButton';
import ImageHighlighter from '../shared/ImageHighlighter';
import { useKanjiRecognition } from '../../hooks/useKanjiRecognition';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../constants/colors';
import { CapturedImage, TextAnnotation } from '../../../types';
import { captureRef } from 'react-native-view-shot';
import { detectJapaneseText, convertToOriginalImageCoordinates, cropImageToRegion, resizeImageToRegion } from '../../services/visionApi';
import { ImageHighlighterRef } from '../shared/ImageHighlighter';
import * as ImageManipulator from 'expo-image-manipulator';

export default function KanjiScanner() {
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [highlightModeActive, setHighlightModeActive] = useState(false);
  const [localProcessing, setLocalProcessing] = useState(false);
  const router = useRouter();
  const { signOut } = useAuth();
  const { recognizeKanji, isProcessing, error } = useKanjiRecognition();
  
  // Add ref to access the ImageHighlighter component
  const imageHighlighterRef = useRef<ImageHighlighterRef>(null);

  const handleLogout = async () => {
    try {
      Alert.alert(
        "Logout",
        "Are you sure you want to log out?",
        [
          {
            text: "Cancel",
            style: "cancel"
          },
          {
            text: "Logout",
            onPress: async () => {
              await signOut();
              router.replace('/login');
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error logging out:', error);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    }
  };

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
    if (!capturedImage || !imageHighlighterRef.current) return;
    
    try {
      console.log('[KanjiScanner] Received region:', region);
      console.log('[KanjiScanner] Original image dimensions:', {
        width: capturedImage.width,
        height: capturedImage.height
      });
      
      // Ensure the region is valid
      if (region.width < 5 || region.height < 5) {
        Alert.alert("Selection too small", "Please select a slightly larger area of text");
        return;
      }

      setLocalProcessing(true);
      
      // Get the transform data which includes scaling information
      const transformData = imageHighlighterRef.current.getTransformData();
      console.log('[KanjiScanner] Transform data:', transformData);
      
      // Get original image dimensions
      const { uri, width, height } = capturedImage;
      
      // First, ensure the input region has non-negative values
      const validRegion = {
        x: Math.max(0, region.x),
        y: Math.max(0, region.y),
        width: Math.max(5, region.width),
        height: Math.max(5, region.height)
      };
      
      // Calculate the scaling ratio between the original image and how it's displayed
      const widthRatio = width / transformData.scaledWidth;
      const heightRatio = height / transformData.scaledHeight;
      console.log('[KanjiScanner] Scaling ratios:', { widthRatio, heightRatio });
      
      // Convert the selected region to original image coordinates
      const originalRegion = {
        x: Math.round(validRegion.x * widthRatio),
        y: Math.round(validRegion.y * heightRatio),
        width: Math.round(validRegion.width * widthRatio),
        height: Math.round(validRegion.height * heightRatio)
      };
      
      console.log('[KanjiScanner] Original image coordinates:', originalRegion);
      
      try {
        if (highlightModeActive) {
          // This is a text selection - follow the original flow with text detection
          // Crop directly from the original image
          const croppedUri = await cropImageToRegion(uri, originalRegion);
          console.log('[KanjiScanner] Cropped image URI:', croppedUri);
          
          // Use the entire cropped image for OCR
          const textRegions = await detectJapaneseText(
            croppedUri,
            { x: 0, y: 0, width: 1000, height: 1000 }, // Use entire image
            false
          );
          
          console.log('OCR result:', textRegions.length > 0 ? `${textRegions.length} texts found` : 'No text found');
          
          if (textRegions && textRegions.length > 0) {
            // Join all detected text items with newlines
            const detectedText = textRegions.map(item => item.text).join('\n');
            console.log('Extracted text:', detectedText);
            
            // Navigate to flashcards with the detected text
            router.push({
              pathname: "/flashcards",
              params: { text: detectedText }
            });
          } else {
            Alert.alert(
              "No Japanese Text Found",
              "No Japanese text was detected in the selected area. Please try selecting a different area.",
              [{ text: "OK" }]
            );
          }
        } else {
          // This is a crop operation - just resize the image without text detection
          console.log('[KanjiScanner] CROP MODE: Starting crop operation');
          
          // For crop operations, we'll use the originalRegion directly from ImageHighlighter
          // without applying our own scaling again
          const resizedUri = await resizeImageToRegion(uri, region);
          console.log('[KanjiScanner] Resized image URI:', resizedUri);
          
          // Get the actual dimensions of the resized image instead of using the requested dimensions
          console.log('[KanjiScanner] Getting dimensions of resized image');
          const resizedImage = await ImageManipulator.manipulateAsync(
            resizedUri,
            [],
            { format: ImageManipulator.SaveFormat.JPEG }
          );
          console.log('[KanjiScanner] Resized image dimensions:', resizedImage.width, 'x', resizedImage.height);
          
          // Update the captured image with the resized version using actual dimensions
          console.log('[KanjiScanner] Updating captured image with resized version');
          setCapturedImage({
            uri: resizedUri,
            width: resizedImage.width,
            height: resizedImage.height
          });
          console.log('[KanjiScanner] Crop operation completed successfully');
        }
      } catch (error) {
        console.error('Error processing image:', error);
        Alert.alert(
          "Processing Error",
          "There was a problem processing the selected area. Please try again.",
          [{ text: "OK" }]
        );
      } finally {
        setLocalProcessing(false);
      }
    } catch (error) {
      console.error('Error capturing region:', error);
      setLocalProcessing(false);
      Alert.alert(
        "Capture Error",
        "There was a problem with the selected area. Please try again.",
        [{ text: "OK" }]
      );
    }
  };

  const handleCancel = () => {
    setCapturedImage(null);
    setHighlightModeActive(false);
  };

  const activateHighlightMode = () => {
    setHighlightModeActive(true);
  };

  // Add an effect to monitor capturedImage changes
  React.useEffect(() => {
    if (capturedImage) {
      console.log('[KanjiScanner] capturedImage state updated:', {
        uri: capturedImage.uri,
        width: capturedImage.width,
        height: capturedImage.height
      });
    }
  }, [capturedImage]);

  return (
    <View style={styles.container}>
      {!capturedImage ? (
        <>
          <TouchableOpacity 
            style={styles.logoutButton} 
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={24} color="white" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
          <View style={styles.buttonContainer}>
            <CameraButton onPhotoCapture={handlePhotoCapture} />
            <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
              <Ionicons name="images" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity 
            style={styles.viewFlashcardsButton} 
            onPress={() => router.push('/saved-flashcards')}
          >
            <Ionicons name="albums-outline" size={20} color="#000" style={styles.buttonIcon} />
            <Text style={styles.viewFlashcardsText}>View Saved Flashcards</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.imageContainer}>
          <ImageHighlighter
            ref={imageHighlighterRef}
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
  logoutButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#dc3545',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1000,
  },
  logoutText: {
    color: 'white',
    marginLeft: 4,
    fontWeight: 'bold',
  },
}); 