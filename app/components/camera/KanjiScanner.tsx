import React, { useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome5, AntDesign, FontAwesome6, Feather } from '@expo/vector-icons';
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
import RandomCardReviewer from '../flashcards/RandomCardReviewer';

export default function KanjiScanner() {
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [imageHistory, setImageHistory] = useState<CapturedImage[]>([]);
  const [forwardHistory, setForwardHistory] = useState<CapturedImage[]>([]);
  const [highlightModeActive, setHighlightModeActive] = useState(false);
  const [localProcessing, setLocalProcessing] = useState(false);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [showTextInputModal, setShowTextInputModal] = useState(false);
  const [inputText, setInputText] = useState('');
  
  const router = useRouter();
  const { signOut } = useAuth();
  const { recognizeKanji, isProcessing, error } = useKanjiRecognition();
  
  // Add ref to access the ImageHighlighter component
  const imageHighlighterRef = useRef<ImageHighlighterRef>(null);

  const handleLogout = async () => {
    setSettingsMenuVisible(false);
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

  const handleOpenSettings = () => {
    setSettingsMenuVisible(false);
    router.push('/settings');
  };

  const toggleSettingsMenu = () => {
    setSettingsMenuVisible(!settingsMenuVisible);
  };

  const handlePhotoCapture = (imageInfo: CapturedImage | null) => {
    if (imageInfo) {
      setCapturedImage(imageInfo);
      setImageHistory([]);
      setForwardHistory([]);
    } else {
      setCapturedImage(null);
      setImageHistory([]);
      setForwardHistory([]);
    }
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
        setImageHistory([]);
        setForwardHistory([]);
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
          
          // Save the current image to history before cropping
          if (capturedImage) {
            setImageHistory(prev => [...prev, capturedImage]);
            // Clear forward history when making a new crop
            setForwardHistory([]);
          }
          
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
    setImageHistory([]);
    setForwardHistory([]);
  };

  const handleBackToPreviousImage = () => {
    if (imageHistory.length > 0 && capturedImage) {
      // Get the last image from history
      const previousImage = imageHistory[imageHistory.length - 1];
      
      // Save current image to forward history
      setForwardHistory(prev => [...prev, capturedImage]);
      
      // Set previous image as the current image
      setCapturedImage(previousImage);
      
      // Remove it from history
      setImageHistory(prev => prev.slice(0, -1));
    }
  };

  const handleForwardToNextImage = () => {
    if (forwardHistory.length > 0 && capturedImage) {
      // Get the last image from forward history
      const nextImage = forwardHistory[forwardHistory.length - 1];
      
      // Save current image to backward history
      setImageHistory(prev => [...prev, capturedImage]);
      
      // Set next image as the current image
      setCapturedImage(nextImage);
      
      // Remove it from forward history
      setForwardHistory(prev => prev.slice(0, -1));
    }
  };

  const activateHighlightMode = () => {
    setHighlightModeActive(true);
  };

  const handleTextInput = () => {
    setShowTextInputModal(true);
  };

  const handleCancelTextInput = () => {
    setInputText('');
    setShowTextInputModal(false);
  };

  const handleSubmitTextInput = () => {
    if (!inputText.trim()) {
      Alert.alert("Empty Input", "Please enter some text to translate.");
      return;
    }

    // Navigate to flashcards with the input text
    router.push({
      pathname: "/flashcards",
      params: { text: inputText.trim() }
    });

    // Reset the input and close the modal
    setInputText('');
    setShowTextInputModal(false);
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
          {/* Settings Menu Button */}
          <TouchableOpacity 
            style={styles.settingsButton} 
            onPress={toggleSettingsMenu}
          >
            <Feather name="menu" size={24} color="white" />
          </TouchableOpacity>
          
          {/* Settings Menu Modal */}
          {settingsMenuVisible && (
            <>
              <TouchableOpacity 
                style={styles.backdrop} 
                activeOpacity={0} 
                onPress={toggleSettingsMenu}
              />
              <View style={styles.settingsMenu}>
                <TouchableOpacity 
                  style={styles.settingsMenuItem} 
                  onPress={handleOpenSettings}
                >
                  <Ionicons name="settings-outline" size={20} color="white" />
                  <Text style={styles.settingsMenuItemText}>Settings</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.settingsMenuItem} 
                  onPress={handleLogout}
                >
                  <MaterialIcons name="logout" size={20} color="white" />
                  <Text style={styles.settingsMenuItemText}>Logout</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          
          {/* Random Card Reviewer */}
          <View style={styles.reviewerContainer}>
            <RandomCardReviewer />
          </View>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.textInputButton} 
              onPress={handleTextInput}
            >
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
            <CameraButton onPhotoCapture={handlePhotoCapture} />
            <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
              <FontAwesome6 name="images" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.viewFlashcardsButton} 
              onPress={() => router.push('/saved-flashcards')}
            >
              <MaterialIcons name="library-books" size={24} color="white" />
            </TouchableOpacity>
          </View>
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
            <AntDesign name="back" size={24} color="white" />
          </TouchableOpacity>
          {!highlightModeActive && (
            <TouchableOpacity 
              style={styles.highlightButton} 
              onPress={activateHighlightMode}
            >
              <FontAwesome6 name="highlighter" size={24} color="white" />
            </TouchableOpacity>
          )}
          {/* Back button to revert to previous image */}
          {imageHistory.length > 0 && (
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={handleBackToPreviousImage}
            >
              <MaterialIcons name="arrow-back-ios" size={24} color="white" />
            </TouchableOpacity>
          )}
          {/* Forward button to go to next image */}
          {forwardHistory.length > 0 && (
            <TouchableOpacity 
              style={styles.forwardButton} 
              onPress={handleForwardToNextImage}
            >
              <MaterialIcons name="arrow-forward-ios" size={24} color="white" />
            </TouchableOpacity>
          )}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>
      )}

      {/* Text Input Modal */}
      <Modal
        visible={showTextInputModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelTextInput}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            style={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Enter Text</Text>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholder="Enter text to translate"
                placeholderTextColor="#999"
                autoFocus
              />
              <View style={styles.modalButtonsContainer}>
                <TouchableOpacity 
                  style={styles.modalCancelButton} 
                  onPress={handleCancelTextInput}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.modalSaveButton} 
                  onPress={handleSubmitTextInput}
                >
                  <Text style={styles.modalButtonText}>Translate</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
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
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    gap: 16,
    flexWrap: 'wrap',
    paddingHorizontal: 10,
  },
  galleryButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    width: 80,
    height: 50,
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
    borderRadius: 8,
    width: 80,
    height: 50,
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
    borderRadius: 8,
    width: 80,
    height: 50,
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
  backButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    width: 80,
    height: 50,
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
    bottom: 100,
    right: 20,
    zIndex: 999,
  },
  forwardButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    width: 80,
    height: 50,
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
    bottom: 180,
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
    backgroundColor: COLORS.accentMedium,
    borderRadius: 8,
    width: 80,
    height: 50,
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
  settingsButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: COLORS.accentMedium,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1001,
  },
  settingsMenu: {
    position: 'absolute',
    top: 55,
    right: 10,
    backgroundColor: COLORS.darkSurface,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    width: 150,
    zIndex: 1002,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  settingsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  settingsMenuItemText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '500',
  },
  buttonIcon: {
    marginRight: 8,
  },
  // Reviewer container style
  reviewerContainer: {
    position: 'absolute',
    top: '40%', // Position it at 40% instead of 50% to move it higher up
    transform: [{ translateY: -150 }], // Offset by half the height of the container
    left: 10,
    right: 10,
    zIndex: 900,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  textInputButton: {
    backgroundColor: '#E53170',
    borderRadius: 8,
    width: 80,
    height: 50,
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
  modalContainer: {
    flex: 1,
    justifyContent: Platform.OS === 'ios' ? 'flex-end' : 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 20,
  },
  modalContent: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    marginBottom: Platform.OS === 'ios' ? 10 : 0,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: COLORS.text,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.accentLight,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    minHeight: 120,
    maxHeight: 180,
    color: COLORS.text,
    backgroundColor: COLORS.darkSurface,
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalCancelButton: {
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  modalSaveButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
}); 