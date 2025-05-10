import React, { useState, useRef, useEffect } from 'react';
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
import { useFocusEffect } from 'expo-router';
import * as ProcessImage from '../../services/ProcessImage';

export default function KanjiScanner() {
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [imageHistory, setImageHistory] = useState<CapturedImage[]>([]);
  const [forwardHistory, setForwardHistory] = useState<CapturedImage[]>([]);
  const [highlightModeActive, setHighlightModeActive] = useState(false);
  const [cropModeActive, setCropModeActive] = useState(false);
  const [hasCropSelection, setHasCropSelection] = useState(false);
  const [localProcessing, setLocalProcessing] = useState(false);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [showTextInputModal, setShowTextInputModal] = useState(false);
  const [inputText, setInputText] = useState('');
  const [hasHighlightSelection, setHasHighlightSelection] = useState(false);
  const [highlightRegion, setHighlightRegion] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  
  // Add state for rotate mode
  const [rotateModeActive, setRotateModeActive] = useState(false);
  const [hasRotation, setHasRotation] = useState(false);
  // Add local error state for rotate errors
  const [rotateError, setRotateError] = useState<string | null>(null);
  
  const router = useRouter();
  const { signOut } = useAuth();
  const { recognizeKanji, isProcessing, error } = useKanjiRecognition();
  
  // Add ref to access the ImageHighlighter component
  const imageHighlighterRef = useRef<ImageHighlighterRef>(null);

  // Instead of setting initialRotation to rotation, we'll store a reference
  // to track rotation changes better
  const rotationRef = useRef<number>(0);

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
    rotation?: number;
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

      // For highlight mode, store the region for later confirmation
      if (highlightModeActive) {
        setHighlightRegion(region);
        setHasHighlightSelection(true);
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
      
      // Handle rotation when provided
      if (region.rotation !== undefined && rotateModeActive) {
        try {
          // Set local processing to show loading state and prevent flicker
          setLocalProcessing(true);
          
          // Push current image to history before modifying
          if (capturedImage) {
            setImageHistory(prev => [...prev, capturedImage]);
            setForwardHistory([]);
          }
          
          console.log('[KanjiScanner] Rotating image with angle:', region.rotation);
          console.log('[KanjiScanner] Original dimensions:', capturedImage.width, 'x', capturedImage.height);
          
          // Apply rotation to the image - use the processImage function to better preserve dimensions
          const rotatedImageUri = await ProcessImage.processImage(
            capturedImage.uri, 
            { rotate: region.rotation }
          );
          
          if (rotatedImageUri) {
            // Update image with rotated version
            const imageInfo = await ProcessImage.getImageInfo(rotatedImageUri);
            console.log('[KanjiScanner] Rotated dimensions:', imageInfo.width, 'x', imageInfo.height);
            
            setCapturedImage({
              uri: rotatedImageUri,
              width: imageInfo.width,
              height: imageInfo.height
            });
            
            // Reset rotate mode after applying
            setRotateModeActive(false);
            setHasRotation(false);
            setRotateError(null);
          }
        } catch (error) {
          console.error('Error rotating image:', error);
          setRotateError('Failed to rotate image');
        } finally {
          // Always clear the loading state
          setLocalProcessing(false);
        }
        return;
      }

      setLocalProcessing(true);
      
      try {
        if (highlightModeActive) {
          // This should not be reachable with the confirmation flow, 
          // but kept for safety if the flow changes
          processHighlightRegion(originalRegion);
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
          
          // Reset crop mode
          setCropModeActive(false);
          
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

  // New function to process the highlight region
  const processHighlightRegion = async (originalRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    if (!capturedImage) return;
    
    setLocalProcessing(true);
    try {
      const { uri } = capturedImage;
      
      // Crop the exact highlighted region for OCR only
      const exactCropUri = await cropImageToRegion(uri, originalRegion);
      console.log('[KanjiScanner] Exact cropped image URI for OCR:', exactCropUri);
      
      // Use the original full image for context instead of cropping
      console.log('[KanjiScanner] Using full original image for context:', uri);
      
      // Use the EXACT crop for OCR to ensure we only process the highlighted text
      const textRegions = await detectJapaneseText(
        exactCropUri,
        { x: 0, y: 0, width: 1000, height: 1000 }, // Use entire cropped image
        false
      );
      
      console.log('OCR result:', textRegions.length > 0 ? `${textRegions.length} texts found` : 'No text found');
      
      if (textRegions && textRegions.length > 0) {
        // Join all detected text items with newlines
        const detectedText = textRegions.map(item => item.text).join('\n');
        console.log('Extracted text:', detectedText);
        
        // Clear the highlight box
        imageHighlighterRef.current?.clearHighlightBox?.();
        
        // Navigate to flashcards with the detected text and the FULL original image URI
        router.push({
          pathname: "/flashcards",
          params: { 
            text: detectedText,
            imageUri: uri // Send the full original image for maximum context
          }
        });
      } else {
        Alert.alert(
          "No Japanese Text Found",
          "No Japanese text was detected in the selected area. Please try selecting a different area.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error('Error processing highlight region:', error);
      Alert.alert(
        "OCR Error",
        "There was a problem recognizing text in the selected area. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      setLocalProcessing(false);
      setHighlightRegion(null);
      setHasHighlightSelection(false);
      setHighlightModeActive(false);
      
      // Ensure highlight box is cleared
      imageHighlighterRef.current?.clearHighlightBox?.();
    }
  };

  const confirmHighlightSelection = async () => {
    if (!highlightRegion || !imageHighlighterRef.current) return;
    
    const transformData = imageHighlighterRef.current.getTransformData();
    const { width, height } = capturedImage as CapturedImage;
    
    // Calculate the scaling ratio between the original image and how it's displayed
    const widthRatio = width / transformData.scaledWidth;
    const heightRatio = height / transformData.scaledHeight;
    
    // Convert the selected region to original image coordinates
    const originalRegion = {
      x: Math.round(highlightRegion.x * widthRatio),
      y: Math.round(highlightRegion.y * heightRatio),
      width: Math.round(highlightRegion.width * widthRatio),
      height: Math.round(highlightRegion.height * heightRatio)
    };
    
    await processHighlightRegion(originalRegion);
  };

  const cancelHighlightSelection = () => {
    setHighlightRegion(null);
    setHasHighlightSelection(false);
    imageHighlighterRef.current?.clearHighlightBox?.();
  };

  const activateHighlightMode = () => {
    setHighlightModeActive(true);
    setCropModeActive(false);
    setHasHighlightSelection(false);
    setHighlightRegion(null);
  };

  const cancelHighlightMode = () => {
    setHighlightModeActive(false);
    setHasHighlightSelection(false);
    setHighlightRegion(null);
    imageHighlighterRef.current?.clearHighlightBox?.();
  };

  const toggleCropMode = () => {
    const newCropMode = !cropModeActive;
    setCropModeActive(newCropMode);
    
    // Exit highlight mode if it's active
    if (newCropMode && highlightModeActive) {
      setHighlightModeActive(false);
    }
    
    // Call the ImageHighlighter's toggleCropMode function
    imageHighlighterRef.current?.toggleCropMode();
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

  // Restore the handleCancel function which was accidentally removed
  const handleCancel = () => {
    setCapturedImage(null);
    setHighlightModeActive(false);
    setCropModeActive(false);
    setImageHistory([]);
    setForwardHistory([]);
  };

  // Restore the handleBackToPreviousImage function which was accidentally removed
  const handleBackToPreviousImage = () => {
    if (imageHistory.length > 0 && capturedImage) {
      // Clear any highlight box or selections
      imageHighlighterRef.current?.clearHighlightBox?.();
      setHighlightRegion(null);
      setHasHighlightSelection(false);
      setHighlightModeActive(false);
      
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

  // Restore the handleForwardToNextImage function which was accidentally removed
  const handleForwardToNextImage = () => {
    if (forwardHistory.length > 0 && capturedImage) {
      // Clear any highlight box or selections
      imageHighlighterRef.current?.clearHighlightBox?.();
      setHighlightRegion(null);
      setHasHighlightSelection(false);
      setHighlightModeActive(false);
      
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

  // Add an effect to check if a crop region exists when in crop mode
  React.useEffect(() => {
    if (cropModeActive) {
      // Use an interval to check crop status since it might change
      const checkInterval = setInterval(() => {
        const hasCrop = !!imageHighlighterRef.current?.hasCropRegion;
        if (hasCrop !== hasCropSelection) {
          setHasCropSelection(hasCrop);
        }
      }, 100);
      
      return () => clearInterval(checkInterval);
    } else {
      setHasCropSelection(false);
    }
  }, [cropModeActive, hasCropSelection]);

  // Clear highlight when the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (capturedImage) {
        // Clear any lingering highlight boxes or selections
        imageHighlighterRef.current?.clearHighlightBox?.();
        setHighlightRegion(null);
        setHasHighlightSelection(false);
        
        // Only deactivate highlight mode if we're returning from another screen
        // to avoid disrupting the user if they're actively using the app
        if (highlightModeActive) {
          console.log('[KanjiScanner] Screen focus: Clearing highlight mode');
          setHighlightModeActive(false);
        }
      }
      
      return () => {
        // Cleanup function
      };
    }, [capturedImage])
  );

  // Toggle rotate mode
  const toggleRotateMode = () => {
    if (imageHighlighterRef.current) {
      // Call the toggleRotateMode method on the ImageHighlighter
      imageHighlighterRef.current.toggleRotateMode();
      
      // Update local state
      const newRotateMode = !rotateModeActive;
      setRotateModeActive(newRotateMode);
      
      // Reset rotation tracking when entering rotate mode
      setHasRotation(false);
      setRotateError(null); // Clear any rotation errors when toggling
      
      // Save current rotation reference value when toggling mode
      if (newRotateMode) {
        // Get current rotation value when entering rotate mode
        const transformData = imageHighlighterRef.current.getTransformData();
        rotationRef.current = transformData.rotation;
        console.log('[KanjiScanner] Entered rotate mode, initial rotation:', rotationRef.current);
      }
      
      // Exit other modes
      if (highlightModeActive) {
        setHighlightModeActive(false);
        setHasHighlightSelection(false);
      }
      
      if (cropModeActive) {
        setCropModeActive(false);
        setHasCropSelection(false);
      }
    }
  };
  
  // Check for rotation changes
  useEffect(() => {
    if (rotateModeActive && imageHighlighterRef.current) {
      // Create an interval to continuously check for rotation changes
      const intervalId = setInterval(() => {
        if (imageHighlighterRef.current) {
          const transformData = imageHighlighterRef.current.getTransformData();
          const currentRotation = transformData.rotation;
          
          // Check if rotation has changed enough to enable the button
          const rotationDelta = Math.abs(currentRotation - rotationRef.current);
          const hasChanged = rotationDelta > 1;
          
          if (hasChanged !== hasRotation) {
            console.log('[KanjiScanner] Detected rotation change:', {
              initial: rotationRef.current,
              current: currentRotation,
              delta: rotationDelta,
              hasChanged
            });
            setHasRotation(hasChanged);
          }
        }
      }, 100); // Check every 100ms
      
      // Initial check
      if (imageHighlighterRef.current.hasRotation) {
        setHasRotation(true);
      }
      
      // Clean up interval on unmount or when leaving rotate mode
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [rotateModeActive, hasRotation]);

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
          
          {highlightModeActive && (
            <View style={styles.instructionContainer}>
              <Text style={styles.instructionText}>
                Drag to highlight text for translation
              </Text>
            </View>
          )}
          
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <AntDesign name="back" size={24} color="white" />
          </TouchableOpacity>
          
          {/* Highlight, Crop and Rotate buttons - only shown when no active mode */}
          {!highlightModeActive && !cropModeActive && !rotateModeActive && (
            <>
              <TouchableOpacity 
                style={styles.highlightButton} 
                onPress={activateHighlightMode}
              >
                <FontAwesome6 name="highlighter" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.cropButton} 
                onPress={toggleCropMode}
              >
                <FontAwesome6 name="crop" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.rotateButton} 
                onPress={toggleRotateMode}
              >
                <FontAwesome6 name="rotate" size={24} color="white" />
              </TouchableOpacity>
            </>
          )}
          
          {/* Highlight mode buttons - before selection */}
          {highlightModeActive && !hasHighlightSelection && (
            <>
              <TouchableOpacity 
                style={styles.cancelHighlightButton} 
                onPress={cancelHighlightMode}
              >
                <FontAwesome6 name="xmark" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                disabled={true}
                style={[
                  styles.confirmHighlightButton, 
                  { opacity: 0.5 } // Dim the button to indicate it's not active yet
                ]}
              >
                <FontAwesome6 name="check" size={24} color="white" />
              </TouchableOpacity>
            </>
          )}
          
          {/* Highlight selection confirmation buttons - after selection */}
          {highlightModeActive && hasHighlightSelection && (
            <>
              <TouchableOpacity 
                style={styles.cancelHighlightButton} 
                onPress={cancelHighlightSelection}
              >
                <FontAwesome6 name="xmark" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.confirmHighlightButton}
                onPress={confirmHighlightSelection}
              >
                <FontAwesome6 name="check" size={24} color="white" />
              </TouchableOpacity>
            </>
          )}
          
          {/* Crop mode buttons */}
          {cropModeActive && (
            <>
              <TouchableOpacity 
                style={styles.cancelHighlightButton} 
                onPress={toggleCropMode}
              >
                <FontAwesome6 name="xmark" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.confirmHighlightButton, 
                  !hasCropSelection ? { opacity: 0.5 } : {}
                ]} 
                disabled={!hasCropSelection}
                onPress={() => imageHighlighterRef.current?.applyCrop?.()}
              >
                <FontAwesome6 name="check" size={24} color="white" />
              </TouchableOpacity>
            </>
          )}
          
          {/* Rotate mode buttons */}
          {rotateModeActive && (
            <>
              <TouchableOpacity 
                style={styles.cancelHighlightButton} 
                onPress={toggleRotateMode}
              >
                <FontAwesome6 name="xmark" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.confirmHighlightButton, 
                  !hasRotation ? { opacity: 0.5 } : {}
                ]} 
                disabled={!hasRotation}
                onPress={() => imageHighlighterRef.current?.applyRotation?.()}
              >
                <FontAwesome6 name="check" size={24} color="white" />
              </TouchableOpacity>
            </>
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
          {/* Display either rotation error or general error */}
          {(error || rotateError) && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{rotateError || error}</Text>
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
  cropButton: {
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
    bottom: 20,
    right: 110, // Position it to the left of the highlight button
    zIndex: 999,
  },
  cancelHighlightButton: {
    backgroundColor: '#B3B3B3',
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
    right: 110,
    zIndex: 1000,
  },
  confirmHighlightButton: {
    backgroundColor: '#2CB67D',
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
    zIndex: 1000,
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
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  rotateButton: {
    backgroundColor: '#A0A0B9',
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
    right: 200, // Position it to the left of the crop button
    zIndex: 999,
  },
}); 