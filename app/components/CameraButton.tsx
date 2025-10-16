import { useState, useEffect } from 'react';
import { TouchableOpacity, View, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

import { logger } from '../utils/logger';
interface CameraButtonProps {
  onPhotoCapture: (imageInfo: {
    uri: string;
    width: number;
    height: number;
  } | null) => void;
}

export default function CameraButton({ onPhotoCapture }: CameraButtonProps) {
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
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setHasPhoto(true);
        onPhotoCapture({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
      logger.error(error);
    }
  };

  const handleBack = () => {
    setHasPhoto(false);
    onPhotoCapture(null);
  };

  return (
    <View style={styles.container}>
      {hasPhoto ? (
        <TouchableOpacity style={styles.button} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.button} onPress={takePhoto}>
          <Ionicons name="camera" size={24} color="white" />
        </TouchableOpacity>
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
  button: {
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    width: 80,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  }
}); 