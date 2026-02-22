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
        mediaTypes: 'images',
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
        const assetWidth = asset.width || 0;
        const assetHeight = asset.height || 0;

        // Resize to max 2000px (same as gallery large-image path) so subsequent rotate/crop
        // are fast. Camera photos are typically 12MP (4032x3024) - without resize, rotation is slow.
        const safeMaxDimension = 2000;
        const needsResize = assetWidth > safeMaxDimension || assetHeight > safeMaxDimension;
        const scale = needsResize ? safeMaxDimension / Math.max(assetWidth, assetHeight) : 1;
        const resizeWidth = Math.round(assetWidth * scale);
        const resizeHeight = Math.round(assetHeight * scale);

        const transformations = needsResize
          ? [{ resize: { width: resizeWidth, height: resizeHeight } }]
          : [];

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
              transformations,
              { 
                compress: compressionLevel, 
                format: ImageManipulator.SaveFormat.JPEG
              }
            );

            if (normalised && normalised.width > 0 && normalised.height > 0) {
              logger.log('[CameraButton] Processed captured image:', 
                `${normalised.width}x${normalised.height}`, 'URI:', normalised.uri);
              break;
            } else {
              throw new Error('Invalid processed image dimensions');
            }
            
          } catch (processingError) {
            logger.error(`[CameraButton] Processing attempt ${retryCount + 1} failed:`, processingError);
            
            if (retryCount < maxRetries) {
              // Retry with smaller dimensions on memory pressure
              if (needsResize) {
                const retryMax = Math.round(safeMaxDimension * 0.6);
                const retryScale = retryMax / Math.max(assetWidth, assetHeight);
                transformations.length = 0;
                transformations.push({
                  resize: {
                    width: Math.round(assetWidth * retryScale),
                    height: Math.round(assetHeight * retryScale),
                  },
                });
              }
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
        
        // Note: onProcessingStateChange?.(false) is now called by 
        // ImageHighlighter's onImageLoaded callback to prevent flicker
        // The loading overlay stays visible until the image actually loads
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
          iconColor="grey"
          color="grey"
          size="large"
          shape="square"
        />
      ) : (
        <PokedexButton
          onPress={takePhoto}
          icon={disabled ? "lock-closed" : "camera"}
          iconColor="grey"
          color="grey"
          size="large"
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