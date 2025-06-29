import { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ViewStyle } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import PokedexButton from '../shared/PokedexButton';

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

  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Sorry, we need camera permissions to make this work!');
      }
    })();
  }, []);

  const takePhoto = async () => {
    if (disabled) {
      if (onDisabledPress) {
        onDisabledPress();
      }
      return;
    }
    
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 1,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        exif: true,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setHasPhoto(true);

        // Show loading indicator for image processing
        onProcessingStateChange?.(true);
        
        // Add small delay to ensure loading indicator shows before heavy processing
        await new Promise(resolve => setTimeout(resolve, 50));

        console.log('[CameraButton] Processing captured image:', asset.uri, 
          `${asset.width}x${asset.height}`);

        // Normalize orientation so width/height reflect the actual bitmap after EXIF is stripped
        const normalised = await ImageManipulator.manipulateAsync(
          asset.uri,
          [],
          { compress: 1, format: ImageManipulator.SaveFormat.PNG }
        );

        console.log('[CameraButton] Processed captured image:', 
          `${normalised.width}x${normalised.height}`, 'URI:', normalised.uri);

        onPhotoCapture({
          uri: normalised.uri,
          width: normalised.width,
          height: normalised.height,
        });
        
        onProcessingStateChange?.(false);
      }
    } catch (error) {
      onProcessingStateChange?.(false);
      Alert.alert('Error', 'Failed to take photo');
      console.error(error);
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