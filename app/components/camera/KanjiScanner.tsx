import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons, MaterialIcons, FontAwesome5, AntDesign, FontAwesome6, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import CameraButton from './CameraButton';
import ImageHighlighter from '../shared/ImageHighlighter';
import { useKanjiRecognition } from '../../hooks/useKanjiRecognition';
import { useAuth } from '../../context/AuthContext';
import { useOCRCounter } from '../../context/OCRCounterContext';
import { COLORS } from '../../constants/colors';
import { CapturedImage, TextAnnotation } from '../../../types';
import { captureRef } from 'react-native-view-shot';
import { detectJapaneseText, convertToOriginalImageCoordinates, cropImageToRegion, resizeImageToRegion } from '../../services/visionApi';
import { ImageHighlighterRef, ImageHighlighterRotationState } from '../shared/ImageHighlighter';
import * as ImageManipulator from 'expo-image-manipulator';
import RandomCardReviewer from '../flashcards/RandomCardReviewer';
import { useFocusEffect } from 'expo-router';
import * as ProcessImage from '../../services/ProcessImage';
import PokedexButton from '../shared/PokedexButton';

interface KanjiScannerProps {
  onCardSwipe?: () => void;
}

export default function KanjiScanner({ onCardSwipe }: KanjiScannerProps) {
  const { t } = useTranslation();
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
  const [isNavigating, setIsNavigating] = useState(false);
  
  // State for rotate mode
  const [rotateModeActive, setRotateModeActive] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  // New state for rotation controls via callback
  const [currentRotationUIState, setCurrentRotationUIState] = useState<ImageHighlighterRotationState | null>(null);
  
  const router = useRouter();
  const { signOut } = useAuth();
  const { recognizeKanji, isProcessing, error } = useKanjiRecognition();
  const { incrementOCRCount, canPerformOCR, remainingScans } = useOCRCounter();
  
  // Add ref to access the ImageHighlighter component
  const imageHighlighterRef = useRef<ImageHighlighterRef>(null);

  // Instead of setting initialRotation to rotation, we'll store a reference
  // to track rotation changes better
  const rotationRef = useRef<number>(0);

  // Callback for ImageHighlighter to update rotation UI state
  const handleRotationStateChange = React.useCallback((newState: ImageHighlighterRotationState) => {
    console.log('[KanjiScanner] Rotation state update from IH:', newState);
    setCurrentRotationUIState(newState);
  }, []); // Empty dependency array as setCurrentRotationUIState is stable

  // Reset navigation state when component becomes active
  useFocusEffect(
    React.useCallback(() => {
      setIsNavigating(false);
    }, [])
  );

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
        quality: 0.8, // Reduce quality to speed up processing
        // exif: true, // We don't strictly need to request it, manipulateAsync handles it
      });

      if (!result.canceled) {
        const asset = result.assets[0];

        // Check if image is too large and needs resizing for performance
        const maxDimension = 2000; // Reasonable limit for mobile processing
        const needsResize = asset.width > maxDimension || asset.height > maxDimension;
        
        console.log('[KanjiScanner pickImage] Processing image:', asset.uri, 
          `${asset.width}x${asset.height}`, needsResize ? '(will resize)' : '(no resize needed)');

        // OPTION 1: Skip processing entirely for maximum speed (uncomment to use)
        // Modern image viewers handle orientation automatically via CSS/styles
        // if (!needsResize) {
        //   console.log('[KanjiScanner pickImage] Using original image (no processing needed)');
        //   setCapturedImage({
        //     uri: asset.uri,
        //     width: asset.width || 0,
        //     height: asset.height || 0,
        //   });
        //   setImageHistory([]);
        //   setForwardHistory([]);
        //   setHighlightModeActive(false);
        //   return;
        // }

        const transformations = [];
        
        // Add resize transformation if needed
        if (needsResize) {
          const scale = maxDimension / Math.max(asset.width || 1, asset.height || 1);
          transformations.push({
            resize: {
              width: Math.round((asset.width || 1) * scale),
              height: Math.round((asset.height || 1) * scale)
            }
          });
        }

        // Process image with optimized settings for speed
        const processedImage = await ImageManipulator.manipulateAsync(
          asset.uri,
          transformations, // Only resize if needed, EXIF orientation is handled automatically
          { 
            compress: 0.8, // Good balance between quality and speed
            format: ImageManipulator.SaveFormat.JPEG // Much faster than PNG
          }
        );
        
        console.log('[KanjiScanner pickImage] Processed image:', 
          `${processedImage.width}x${processedImage.height}`, 'URI:', processedImage.uri);

        setCapturedImage({
          uri: processedImage.uri,
          width: processedImage.width,
          height: processedImage.height,
        });
        setImageHistory([]);
        setForwardHistory([]);
        setHighlightModeActive(false);
      }
    } catch (error) {
      console.error('Error picking or processing image:', error);
      Alert.alert("Image Error", "Failed to load or process the image. Please try again.");
    }
  };

  const handleRegionSelected = async (region: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number; // This rotation is for context if a crop is applied on an already rotated image
  }) => {
    if (!capturedImage || !imageHighlighterRef.current) return;
    
    try {
      console.log('[KanjiScanner] Received region for selection/crop:', region);

      if (highlightModeActive) {
        setHighlightRegion(region); 
        setHasHighlightSelection(true);
        console.log('[KanjiScanner] Highlight region selected (screen/IH coords):', region);
        return; 
      }

      if (cropModeActive) { 
        console.log('[KanjiScanner] Crop operation initiated via onRegionSelected. Region from IH:', region);
        setLocalProcessing(true);
        
        if (capturedImage) {
          setImageHistory(prev => [...prev, capturedImage]);
          setForwardHistory([]);
        }

        const { x, y, width, height, rotation } = region; // Destructure from IH-provided region
        const cropDetails: { x: number; y: number; width: number; height: number; } = { x, y, width, height };
        
        // Use ProcessImage.processImage to handle crop and potential rotation context
        const processedUri = await ProcessImage.processImage(
            capturedImage.uri,
            { crop: cropDetails, rotate: rotation } // rotation might be 0 or undefined if not rotated
        );
        
        if (processedUri) {
          // Get dimensions of the newly processed (cropped, possibly rotated) image
          const imageInfo = await ProcessImage.getImageInfo(processedUri);
          setCapturedImage({
            uri: processedUri,
            width: imageInfo.width,
            height: imageInfo.height
          });
          console.log('[KanjiScanner] Crop (and rotation if any) applied. New image:', processedUri, 'New Dims:', imageInfo);
        } else {
          console.warn('[KanjiScanner] ProcessImage.processImage did not return a URI for crop operation.');
          // Potentially revert to previous image from history if capturedImage was pushed too early
          // or show an error. For now, localProcessing will be set to false.
        }
        setCropModeActive(false); 
        setLocalProcessing(false);
        return; 
      }
      
      console.warn('[KanjiScanner] handleRegionSelected called unexpectedly. Active modes:', 
        { highlightModeActive, cropModeActive, rotateModeActive });
      setLocalProcessing(false);

    } catch (error) {
      console.error('[KanjiScanner] Error in handleRegionSelected:', error);
      Alert.alert("Processing Error", "Could not process the selected region.");
      setLocalProcessing(false);
    }
  };

  // New function to process the highlight region
  const processHighlightRegion = async (originalRegionFromConfirm: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    if (!capturedImage) return;
    
    // Check if user can perform OCR
    if (!canPerformOCR) {
      Alert.alert(
        'OCR Limit Reached',
        `You have reached your daily limit. You have ${remainingScans} scans remaining. Upgrade to Premium for unlimited scans!`,
        [
          { text: 'OK', style: 'default' },
          { text: 'Upgrade', style: 'default', onPress: () => {
            // Navigate to subscription screen
            router.push('/settings'); // You can create a dedicated subscription screen route
          }}
        ]
      );
      return;
    }
    
    console.log('[KanjiScanner PHR] Received originalRegionForProcessing:', originalRegionFromConfirm);
    console.log('[KanjiScanner PHR] Full image URI for cropping:', capturedImage.uri);

    setLocalProcessing(true); // Restore local processing state
    try {
      const { uri } = capturedImage;
      
      // Crop the exact highlighted region for OCR only
      const exactCropUri = await cropImageToRegion(uri, originalRegionFromConfirm);
      // console.log('[KanjiScanner PHR] Exact cropped URI (for diagnostic display):', exactCropUri); // No longer needed

      // --- Restore OCR and navigation --- 
      console.log('[KanjiScanner PHR] Calling detectJapaneseText with exactCropUri and full region for OCR.');

      const textRegions = await detectJapaneseText(
        exactCropUri,
        { x: 0, y: 0, width: 1000, height: 1000 }, // Use entire cropped image
        false
      );
      
      console.log('OCR result:', textRegions.length > 0 ? `${textRegions.length} texts found` : 'No text found');
      
      // Increment OCR counter for successful scan attempts (whether text is found or not)
      await incrementOCRCount();
      
      if (textRegions && textRegions.length > 0) {
        // Join all detected text items with newlines
        const detectedText = textRegions.map(item => item.text).join('\n');
        console.log('Extracted text:', detectedText);
        
        // Set navigation state to prevent UI flash
        setIsNavigating(true);
        
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
    } catch (error: any) {
      console.error('Error processing highlight region:', error);
      
      // Check if it's a timeout error from our OCR service
      if (error.message && error.message.includes('timed out')) {
        Alert.alert(
          "Processing Limit Reached",
          "The selected text area is too large or complex. Please try selecting a smaller section of text.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "OCR Error",
          "There was a problem recognizing text in the selected area. Please try again.",
          [{ text: "OK" }]
        );
      }
    } finally {
      // Only reset states if we're not navigating to prevent UI flash
      if (!isNavigating) {
        setLocalProcessing(false); // Ensure this is always called
        setHighlightRegion(null);
        setHasHighlightSelection(false);
        setHighlightModeActive(false);
        imageHighlighterRef.current?.clearHighlightBox?.(); // Ensure highlight box is cleared
      }
    }
  };

  const confirmHighlightSelection = async () => {
    if (!highlightRegion || !imageHighlighterRef.current || !capturedImage) return;
    
    console.log('[KanjiScanner CnfHS] Current capturedImage URI:', capturedImage.uri);
    console.log('[KanjiScanner CnfHS] Received highlightRegion from state:', highlightRegion);
    const transformData = imageHighlighterRef.current.getTransformData();
    console.log('[KanjiScanner CnfHS] TransformData from ImageHighlighter:', transformData);

    // Use the new properties from transformData
    const {
      originalImageWidth,
      originalImageHeight,
      displayImageViewWidth,
      displayImageViewHeight,
    } = transformData;
    
    // Log the selection dimensions as percentages of the display
    const widthPercentage = (highlightRegion.width / displayImageViewWidth) * 100;
    const heightPercentage = (highlightRegion.height / displayImageViewHeight) * 100;
    console.log(`[KanjiScanner CnfHS] Selection dimensions: ${highlightRegion.width}x${highlightRegion.height} (${widthPercentage.toFixed(1)}% x ${heightPercentage.toFixed(1)}% of view)`);
    
    // Detect wide selections that might need special handling
    const isWideSelection = widthPercentage > 60; // If selection takes up more than 60% of the view width
    if (isWideSelection) {
      console.log('[KanjiScanner CnfHS] Wide selection detected, ensuring proper processing');
    }
    
    // The highlightRegion state has its x,y already adjusted by ImageHighlighter
    // to be relative to the visible image content's top-left.
    // Clamp it against the displayImageView dimensions before scaling.
    const clampedHighlightRegion = {
      x: Math.max(0, Math.min(highlightRegion.x, displayImageViewWidth)),
      y: Math.max(0, Math.min(highlightRegion.y, displayImageViewHeight)),
      width: Math.max(5, highlightRegion.width),
      height: Math.max(5, highlightRegion.height)
    };
    
    // Additional bounds check to handle wide/tall selections 
    clampedHighlightRegion.width = Math.min(clampedHighlightRegion.width, 
                                           displayImageViewWidth - clampedHighlightRegion.x);
    clampedHighlightRegion.height = Math.min(clampedHighlightRegion.height, 
                                            displayImageViewHeight - clampedHighlightRegion.y);
    
    // Safety check to ensure width/height are positive
    if (clampedHighlightRegion.width <= 0) clampedHighlightRegion.width = 5;
    if (clampedHighlightRegion.height <= 0) clampedHighlightRegion.height = 5;

    // Calculate the scaling ratio using displayImageView dimensions
    const widthRatio = originalImageWidth / displayImageViewWidth;
    const heightRatio = originalImageHeight / displayImageViewHeight;
    console.log('[KanjiScanner CnfHS] Clamped Region:', clampedHighlightRegion);
    console.log('[KanjiScanner CnfHS] Scaling Ratios:', { widthRatio, heightRatio });
    
    // For wide selections, add a small horizontal margin to ensure capturing all text
    // This helps with the bias toward left side text detection
    let horizontalMargin = 0;
    if (isWideSelection) {
      // Add a margin proportional to the width of the selection
      horizontalMargin = Math.round(clampedHighlightRegion.width * 0.03); // 3% of width
      console.log('[KanjiScanner CnfHS] Adding horizontal margin for wide selection:', horizontalMargin);
    }
    
    // Convert the selected region to original image coordinates
    const originalRegion = {
      x: Math.round((clampedHighlightRegion.x - horizontalMargin) * widthRatio),
      y: Math.round(clampedHighlightRegion.y * heightRatio),
      width: Math.round((clampedHighlightRegion.width + (horizontalMargin * 2)) * widthRatio),
      height: Math.round(clampedHighlightRegion.height * heightRatio)
    };
    
    // Ensure coordinates are within image bounds
    originalRegion.x = Math.max(0, originalRegion.x);
    originalRegion.y = Math.max(0, originalRegion.y);
    originalRegion.width = Math.min(originalRegion.width, originalImageWidth - originalRegion.x);
    originalRegion.height = Math.min(originalRegion.height, originalImageHeight - originalRegion.y);
    
    console.log('[KanjiScanner CnfHS] Calculated originalRegion (to be sent to processHighlightRegion):', originalRegion);
    console.log('[KanjiScanner CnfHS] Region as percentage of original image:', {
      x: (originalRegion.x / originalImageWidth * 100).toFixed(1) + '%',
      y: (originalRegion.y / originalImageHeight * 100).toFixed(1) + '%',
      width: (originalRegion.width / originalImageWidth * 100).toFixed(1) + '%',
      height: (originalRegion.height / originalImageHeight * 100).toFixed(1) + '%'
    });
    
    // Final safety check for very large regions that might strain OCR
    if (originalRegion.width * originalRegion.height > 4000000) { // 4 megapixels
      console.log('[KanjiScanner CnfHS] Warning: Very large region selected, OCR processing may take longer');
    }
    
    await processHighlightRegion(originalRegion);
  };

  const cancelHighlightSelection = () => {
    setHighlightRegion(null);
    setHasHighlightSelection(false);
    imageHighlighterRef.current?.clearHighlightBox?.();
  };

  const activateHighlightMode = () => {
    // First, exit other modes if they're active
    if (rotateModeActive) {
      imageHighlighterRef.current?.toggleRotateMode(); // Exit rotate mode in ImageHighlighter
      setRotateModeActive(false);
    }
    if (cropModeActive) {
      setCropModeActive(false);
      imageHighlighterRef.current?.toggleCropMode();
    }
    
    // Then activate highlight mode
    setHighlightModeActive(true);
    setHasHighlightSelection(false);
    setHighlightRegion(null);
  };

  // Renamed from cancelHighlightMode and made more generic
  const cancelActiveMode = () => {
    if (highlightModeActive) {
      setHighlightModeActive(false);
      setHasHighlightSelection(false);
      setHighlightRegion(null);
      imageHighlighterRef.current?.clearHighlightBox?.();
      console.log('[KanjiScanner] Highlight mode cancelled');
    } else if (cropModeActive) {
      setCropModeActive(false);
      imageHighlighterRef.current?.toggleCropMode(); // Syncs IH internal mode & clears box
      imageHighlighterRef.current?.clearCropBox?.(); 
      console.log('[KanjiScanner] Crop mode cancelled');
    } else if (rotateModeActive) {
      imageHighlighterRef.current?.cancelRotationChanges(); // 1. IH reverts visual rotation & clears its session
      imageHighlighterRef.current?.toggleRotateMode();    // 2. IH formally exits rotate mode
      setRotateModeActive(false);                           // 3. KS updates its state (triggers effect cleanup)
      console.log('[KanjiScanner] Rotate mode cancelled');
    }
  };

  const confirmCrop = () => {
    if (cropModeActive && hasCropSelection && imageHighlighterRef.current) {
      console.log('[KanjiScanner] Confirming crop...');
      imageHighlighterRef.current.applyCrop();
      // ImageHighlighter's applyCrop calls onRegionSelected, which is handleRegionSelected here.
      // handleRegionSelected already sets cropModeActive to false after processing.
      // It also sets localProcessing to true/false.
      // We might not need to do much else here as handleRegionSelected should take over.
    } else {
      console.warn('[KanjiScanner] confirmCrop called in invalid state');
    }
  };

  const discardCropSelection = () => {
    if (cropModeActive && imageHighlighterRef.current) {
      console.log('[KanjiScanner] Discarding crop selection...');
      imageHighlighterRef.current.clearCropBox();
      setHasCropSelection(false); // Manually update as the mode is still active
    } else {
      console.warn('[KanjiScanner] discardCropSelection called in invalid state');
    }
  };

  const discardHighlightSelection = () => {
    if (highlightModeActive && imageHighlighterRef.current) {
      console.log('[KanjiScanner] Discarding highlight selection...');
      imageHighlighterRef.current.clearHighlightBox();
      setHasHighlightSelection(false); // Manually update as the mode is still active
    } else {
      console.warn('[KanjiScanner] discardHighlightSelection called in invalid state');
    }
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
    // If already in rotate mode, calling this will turn it off.
    // If in another mode, it will switch to rotate mode.
    const newRotateMode = !rotateModeActive;

    if (newRotateMode) {
      // Exit other modes if they're active before entering rotate mode
      if (highlightModeActive) {
        setHighlightModeActive(false);
        // Potentially clear highlight selection if needed
        setHasHighlightSelection(false);
        setHighlightRegion(null);
        imageHighlighterRef.current?.clearHighlightBox?.(); 
      }
      if (cropModeActive) {
        setCropModeActive(false);
        imageHighlighterRef.current?.toggleCropMode(); // Ensure IH exits crop mode
        imageHighlighterRef.current?.clearCropBox?.();
      }
    }
    // else: if turning OFF rotate mode, cancelActiveMode is typically used for explicit cancel.
    // If toggled off by activating another mode, IH.toggleRotateMode will handle IH state.

    setRotateModeActive(newRotateMode);
    imageHighlighterRef.current?.toggleRotateMode(); // Tell ImageHighlighter to toggle its internal state

    // Button states (currentRotationUIState, etc.) will be updated by the useEffect
  };

  // New Rotation Handlers
  const handleConfirmRotation = async () => {
    if (!imageHighlighterRef.current || !capturedImage) return;
    console.log('[KanjiScanner] Confirming rotation...', 'Current image dimensions:', capturedImage.width, 'x', capturedImage.height);
    
    // Set loading state before starting the rotation process
    setLocalProcessing(true);
    
    try {
      const result = await imageHighlighterRef.current.confirmCurrentRotation();
      if (result && result.uri !== capturedImage.uri) { // Check if image actually changed
        // First add current image to history
        setImageHistory(prev => [...prev, capturedImage]);
        setForwardHistory([]);
        
        // Determine if we're rotating by 90 or 270 degrees, which would swap width/height
        const isOrientationChange = 
          Math.abs(Math.abs(result.width - capturedImage.width) - Math.abs(result.height - capturedImage.height)) < 10;
        
        // Simple direct replacement - preserve exact dimensions from result
        console.log('[KanjiScanner] Setting new image with UNMODIFIED dimensions:', result.width, 'x', result.height);
        
        setCapturedImage({
          uri: result.uri,
          width: result.width,
          height: result.height 
        });
        
        console.log('[KanjiScanner] Rotation confirmed with dimensions:', 
          result.width, 'x', result.height, 
          isOrientationChange ? '(orientation changed)' : '(orientation preserved)');
      }
    } catch (error) {
      console.error('[KanjiScanner] Error confirming rotation:', error);
      Alert.alert('Rotation Error', 'Could not apply rotation.');
    } finally {
      // Always clean up state regardless of success or failure
      imageHighlighterRef.current?.toggleRotateMode(); // Explicitly exit rotate mode in ImageHighlighter
      setRotateModeActive(false); // Exit rotate mode in KanjiScanner state
      setLocalProcessing(false);
    }
  };

  const handleUndoRotation = () => {
    imageHighlighterRef.current?.undoRotationChange();
    // Button states will be updated by the useEffect
  };

  const handleRedoRotation = () => {
    imageHighlighterRef.current?.redoRotationChange();
    // Button states will be updated by the useEffect
  };

  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        // const { x, y, width, height } = event.nativeEvent.layout;
        // console.log(`[KanjiScannerRootView] onLayout: x:${x}, y:${y}, width:${width}, height:${height}`);
      }}
    >
      {!capturedImage ? (
        <>
          {/* Settings Menu Button */}
          <PokedexButton
            onPress={toggleSettingsMenu}
            icon="menu"
            size="small"
            shape="square"
            style={styles.settingsButton}
          />
          
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
            <RandomCardReviewer onCardSwipe={onCardSwipe} />
          </View>
          
          {/* Button Row - moved below the reviewer */}
          <View style={styles.buttonRow}>
            <PokedexButton
              onPress={handleTextInput}
              icon="add"
              size="medium"
              shape="square"
              style={styles.rowButton}
            />
            <PokedexButton
              onPress={() => router.push('/saved-flashcards')}
              materialCommunityIcon="cards"
              size="medium"
              shape="square"
              style={styles.rowButton}
            />
            <PokedexButton
              onPress={pickImage}
              icon="images"
              size="medium"
              shape="square"
              style={styles.rowButton}
            />
            <CameraButton 
              onPhotoCapture={handlePhotoCapture} 
              style={styles.rowButton} 
            />
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
            onRotationStateChange={handleRotationStateChange}
          />
          
          <View style={styles.toolbar}>
            {/* Back Button (far left) */}
            <PokedexButton
              onPress={handleCancel}
              icon="arrow-back"
              color={COLORS.secondary}
              size="small"
              shape="square"
              style={styles.toolbarFarButton}
            />

            {/* Flexible spacer to push center controls to the right */}
            <View style={{ flex: 1 }} />

            {/* Center Controls Column */}
            <View style={styles.toolbarCenterControls}>
              {/* Image History Undo/Redo Buttons (Top row in center) */}
              {!localProcessing && 
               (!highlightModeActive && !cropModeActive && !rotateModeActive) && 
               (imageHistory.length > 0 || forwardHistory.length > 0) && (
                <View style={[styles.toolbarButtonGroup, styles.historyButtonsContainer]}>
                  <PokedexButton
                    onPress={handleBackToPreviousImage}
                    icon="arrow-undo"
                    size="small"
                    shape="square"
                    disabled={imageHistory.length === 0}
                  />
                  <PokedexButton
                    onPress={handleForwardToNextImage}
                    icon="arrow-redo"
                    size="small"
                    shape="square"
                    disabled={forwardHistory.length === 0}
                  />
                </View>
              )}

              {/* Mode Activation / Confirmation Buttons (Bottom row in center or replaces history) */}
              <View style={styles.toolbarButtonGroup}>
                {/* Mode Activation Buttons (Highlight, Crop, Rotate) */}
                {!highlightModeActive && !cropModeActive && !rotateModeActive && !localProcessing && !isNavigating && (
                  <>
                    <PokedexButton
                      onPress={activateHighlightMode}
                      icon="create-outline"
                      size="small"
                      shape="square"
                    />
                    <PokedexButton
                      onPress={toggleCropMode}
                      icon="crop"
                      size="small"
                      shape="square"
                    />
                    <PokedexButton
                      onPress={toggleRotateMode}
                      icon="refresh"
                      size="small"
                      shape="square"
                    />
                  </>
                )}
                
                {/* Confirmation buttons when a mode IS active */}
                {(highlightModeActive || cropModeActive || rotateModeActive) && !localProcessing && !isNavigating && (
                  <>
                    <PokedexButton
                      onPress={cancelActiveMode} 
                      icon="close"
                      size="small"
                      shape="square"
                    />
                    
                    {hasHighlightSelection && highlightModeActive && (
                      <>
                        <PokedexButton
                          onPress={discardHighlightSelection} 
                          icon="refresh-outline" 
                          size="small"
                          shape="square"
                        />
                        <PokedexButton
                          onPress={confirmHighlightSelection}
                          icon="checkmark"
                          size="small"
                          shape="square"
                        />
                      </>
                    )}
  
                    {cropModeActive && hasCropSelection && (
                      <>
                        <PokedexButton
                          onPress={discardCropSelection}
                          icon="refresh-outline" 
                          size="small"
                          shape="square"
                        />
                        <PokedexButton
                          onPress={confirmCrop}
                          icon="checkmark"
                          size="small"
                          shape="square"
                        />
                      </>
                    )}

                    {/* Rotate Mode Specific Buttons */}
                    {rotateModeActive && currentRotationUIState && (
                      <>
                        {currentRotationUIState.canUndo && (
                          <PokedexButton
                            onPress={handleUndoRotation}
                            icon="arrow-undo"
                            size="small"
                            shape="square"
                          />
                        )}
                        {currentRotationUIState.canRedo && (
                          <PokedexButton
                            onPress={handleRedoRotation}
                            icon="arrow-redo"
                            size="small"
                            shape="square"
                          />
                        )}
                        {currentRotationUIState.hasRotated && (
                          <PokedexButton
                            onPress={handleConfirmRotation}
                            icon="checkmark"
                            size="small"
                            shape="square"
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </View>
            </View>
          </View>
          
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
                placeholder={t('textInput.placeholder')}
                placeholderTextColor="#999"
                autoFocus
              />
              <View style={styles.modalButtonsContainer}>
                <TouchableOpacity 
                  style={styles.modalCancelButton} 
                  onPress={handleCancelTextInput}
                >
                  <Text style={styles.modalButtonText}>{t('textInput.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.modalSaveButton} 
                  onPress={handleSubmitTextInput}
                >
                  <Text style={styles.modalButtonText}>{t('textInput.translate')}</Text>
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
  imageContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'center',
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
  settingsButton: {
    position: 'absolute',
    top: 5, // Moved slightly higher from the edge
    right: 10,
    zIndex: 800, // Reduced z-index to be below the card reviewer
  },
  settingsMenu: {
    position: 'absolute',
    top: 50, // Adjusted to match the new button position
    right: 10,
    backgroundColor: COLORS.darkSurface,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    width: 150,
    zIndex: 1000, // High enough to appear above everything when opened
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
    top: '10%', // Moved closer to top to maximize screen usage
    transform: [{ translateY: 0 }],
    left: 0, // Removed left margin to reach screen edge
    right: 0, // Removed right margin to reach screen edge
    zIndex: 900,
    maxHeight: '70%', // Increased to allow for larger card size
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999, // Just below the settings menu
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
    borderColor: COLORS.lightGray,
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
    backgroundColor: COLORS.mediumSurface,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  modalSaveButton: {
    backgroundColor: COLORS.mediumSurface,
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
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  toolbarCenterControls: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  toolbarButtonGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  historyButtonsContainer: {
  },
  toolbarFarButton: {
  },
  buttonGrid: {
    position: 'absolute',
    bottom: 50,
    left: 50,
    right: 50,
    flexDirection: 'column',
  },
  buttonRow: {
    position: 'absolute',
    bottom: 25, // Adjusted from 40 to ensure buttons are above Pokedex bottom decorations
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    zIndex: 800,
  },
  rowButton: {
    marginHorizontal: 12, // Keep the spacing between buttons
    width: 65, // Keep the button size
    height: 65, // Keep the button size
  },
  gridButton: {
    marginHorizontal: 0,
  },
}); 