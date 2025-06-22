import { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ViewStyle } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { COLORS } from '../../constants/colors';
import PokedexButton from '../shared/PokedexButton';

interface CameraButtonProps {
  onPhotoCapture: (imageInfo: {
    uri: string;
    width: number;
    height: number;
  } | null) => void;
  style?: ViewStyle;
}

export default function CameraButton({ onPhotoCapture, style }: CameraButtonProps) {
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
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 1,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        exif: true,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setHasPhoto(true);

        // Normalize orientation so width/height reflect the actual bitmap after EXIF is stripped
        const normalised = await ImageManipulator.manipulateAsync(
          asset.uri,
          [],
          { compress: 1, format: ImageManipulator.SaveFormat.PNG }
        );

        onPhotoCapture({
          uri: normalised.uri,
          width: normalised.width,
          height: normalised.height,
        });
      }
    } catch (error) {
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
          icon="camera"
          size="medium"
          shape="square"
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