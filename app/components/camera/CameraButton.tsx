import { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ViewStyle } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import PokedexButton from '../shared/PokedexButton';
import MemoryManager from '../../services/memoryManager';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { logger } from '../../utils/logger';
interface CameraButtonProps {
  onPhotoCapture: (imageInfo: {
    uri: string;
    width: number;
    height: number;
  } | null) => void;
  style?: ViewStyle;
  onProcessingStateChange?: (isProcessing: boolean) => void;
  disabled?: boolean;
  onDisabledPress?: () => void;
  darkDisabled?: boolean;
}

export default function CameraButton({ onPhotoCapture, style, onProcessingStateChange, disabled = false, onDisabledPress, darkDisabled = false }: CameraButtonProps) {
  const [hasPhoto, setHasPhoto] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('camera.permissionDenied'));
      }
    })();
  }, [t]);

  const takePhoto = async () => {
    if (disabled) {
      if (onDisabledPress) {
        onDisabledPress();
      }
      return;
    }
    
    // Add haptic feedback when camera is launched
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const memoryManager = MemoryManager.getInstance();
    
    try {
      // Clear iOS ImagePicker/Camera cache before capture
      logger.log('[CameraButton] Clearing iOS cache before photo capture');
      
      // Force garbage collection
      const globalAny = global as any;
      if (globalAny.gc) {
        globalAny.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8, // Reduced quality to save memory
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // Disable built-in editing to prevent memory conflicts
        exif: false, // Disable EXIF to reduce memory usage
        base64: false, // Disable base64 to save memory
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setHasPhoto(true);

        // Show loading indicator for image processing
        onProcessingStateChange?.(true);

        logger.log('[CameraButton] Processing captured image:', asset.uri, 
          `${asset.width}x${asset.height}`);

        // Get standard processing configuration
        const standardConfig = memoryManager.getStandardImageConfig();

        let normalised;
        let retryCount = 0;
        const maxRetries = 1;
        
        // Retry logic for camera processing
        while (retryCount <= maxRetries) {
          try {
            logger.log(`[CameraButton] Processing attempt ${retryCount + 1}/${maxRetries + 1}`);
            
            // Use more aggressive compression for retries
            const compressionLevel = retryCount === 0 ? standardConfig.compress : 0.6;
            
            normalised = await ImageManipulator.manipulateAsync(
              asset.uri,
              [],
              { 
                compress: compressionLevel, 
                format: ImageManipulator.SaveFormat.JPEG
              }
            );

                         // Validate the processed image by actually loading it
             if (normalised && normalised.width > 0 && normalised.height > 0) {
               // Additional validation: verify the image file can be loaded properly
               try {
                 const imageInfo = await ImageManipulator.manipulateAsync(
                   normalised.uri,
                   [],
                   { format: ImageManipulator.SaveFormat.JPEG, compress: 0.1 }
                 );
                 if (imageInfo.width === normalised.width && imageInfo.height === normalised.height) {
                   logger.log('[CameraButton] Processed captured image validated:', 
                     `${normalised.width}x${normalised.height}`, 'URI:', normalised.uri);
                   break; // Success
                 } else {
                   throw new Error(`Image file dimensions mismatch: expected ${normalised.width}x${normalised.height}, got ${imageInfo.width}x${imageInfo.height}`);
                 }
               } catch (validationError) {
                 throw new Error(`Image validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`);
               }
             } else {
               throw new Error('Invalid processed image dimensions');
             }
            
          } catch (processingError) {
            logger.error(`[CameraButton] Processing attempt ${retryCount + 1} failed:`, processingError);
            
            if (retryCount < maxRetries) {
              // Additional cleanup between retries
              await memoryManager.forceCleanup();
              retryCount++;
            } else {
              throw processingError; // Re-throw if all retries failed
            }
          }
        }

                 if (!normalised) {
           // Final fallback: use original camera image with a warning
           logger.warn('[CameraButton] Camera image processing failed, using original image');
           
           // Use original camera image as fallback
           normalised = {
             uri: asset.uri,
             width: asset.width || 0,
             height: asset.height || 0
           };
           
           logger.log('[CameraButton] Using original camera image as fallback:', 
             `${normalised.width}x${normalised.height}`, 'URI:', normalised.uri);
         }

        // Track the processed image
        memoryManager.trackProcessedImage(normalised.uri);

        onPhotoCapture({
          uri: normalised.uri,
          width: normalised.width,
          height: normalised.height,
        });
        
        onProcessingStateChange?.(false);
      }
    } catch (error) {
      onProcessingStateChange?.(false);
      
      // Attempt recovery by forcing cleanup
      await memoryManager.forceCleanup();
      
      let errorMessage = 'Failed to take photo. Please try again.';
      
      Alert.alert(t('common.error'), errorMessage);
      logger.error(error);
    }
  };

  const handleBack = () => {
    setHasPhoto(false);
    onPhotoCapture(null);
  };

  return (
    <View style={[styles.container, style]}>
      {hasPhoto ? (
        <PokedexButton
          onPress={handleBack}
          icon="arrow-back"
          size="medium"
          shape="square"
        />
      ) : (
        <PokedexButton
          onPress={takePhoto}
          icon={disabled ? "lock-closed" : "camera"}
          size="medium"
          shape="square"
          disabled={false}
          darkDisabled={darkDisabled}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 