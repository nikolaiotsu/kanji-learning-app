import * as ImageManipulator from 'expo-image-manipulator';

// Define the Region interface to match visionApi.ts
interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Get image information (width and height)
export async function getImageInfo(imageUri: string): Promise<{ width: number; height: number }> {
  try {
    const info = await ImageManipulator.manipulateAsync(
      imageUri,
      [], // No operations, just getting info
      { format: ImageManipulator.SaveFormat.JPEG }
    );
    
    return {
      width: info.width,
      height: info.height
    };
  } catch (error) {
    console.error('Error getting image info:', error);
    throw error;
  }
}

// Rotate an image by a specified angle
export async function rotateImage(imageUri: string, angle: number): Promise<string> {
  try {
    console.log('[ProcessImage] Rotating image by angle:', angle);
    
    // Get original image info for logging
    const originalInfo = await getImageInfo(imageUri);
    console.log('[ProcessImage] Original image dimensions:', originalInfo.width, 'x', originalInfo.height);
    
    // Use ImageManipulator to rotate the image with higher quality settings
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        { rotate: angle }
      ],
      { 
        format: ImageManipulator.SaveFormat.JPEG, 
        compress: 1.0,  // Use highest quality (no compression)
      }
    );
    
    console.log('[ProcessImage] Rotated image dimensions:', result.width, 'x', result.height);
    return result.uri;
  } catch (error) {
    console.error('Error rotating image:', error);
    throw error;
  }
}

// Crop an image to a specified region
export async function cropImage(imageUri: string, region: Region): Promise<string> {
  try {
    console.log('[ProcessImage] Cropping image to region:', region);
    
    // First, get the dimensions of the source image to validate crop boundaries
    const sourceImage = await ImageManipulator.manipulateAsync(
      imageUri,
      [],
      { format: ImageManipulator.SaveFormat.JPEG }
    );
    
    // Validate and adjust the crop region to fit within the image boundaries
    const originX = Math.max(0, Math.min(Math.round(region.x), sourceImage.width - 1));
    const originY = Math.max(0, Math.min(Math.round(region.y), sourceImage.height - 1));
    
    // Calculate maximum possible width and height based on the origin point
    const maxWidth = sourceImage.width - originX;
    const maxHeight = sourceImage.height - originY;
    
    // Ensure width and height are within bounds
    const width = Math.max(1, Math.min(Math.round(region.width), maxWidth));
    const height = Math.max(1, Math.min(Math.round(region.height), maxHeight));
    
    const safeRegion = {
      originX,
      originY,
      width,
      height
    };
    
    // Use ImageManipulator to crop the image with the validated region
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        { crop: safeRegion }
      ],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
    );
    
    console.log('[ProcessImage] Cropped image dimensions:', result.width, 'x', result.height);
    return result.uri;
  } catch (error) {
    console.error('Error cropping image:', error);
    throw error;
  }
}

// Process image with multiple operations (crop and rotate)
export async function processImage(
  imageUri: string, 
  operations: { crop?: Region; rotate?: number }
): Promise<string> {
  try {
    console.log('[ProcessImage] Processing image with operations:', operations);
    
    // Get original image info for reference
    const originalInfo = await getImageInfo(imageUri);
    console.log('[ProcessImage] Original image dimensions:', originalInfo.width, 'x', originalInfo.height);
    
    // Check if this is a rotation-only operation
    const isRotationOnly = !operations.crop && operations.rotate !== undefined;
    
    if (isRotationOnly) {
      // For rotation-only operations, we'll rotate and then maintain original dimensions
      
      // Step 1: Rotate the image with high quality
      const rotatedResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ rotate: operations.rotate! }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 1.0 }
      );
      
      console.log('[ProcessImage] Rotated image dimensions:', rotatedResult.width, 'x', rotatedResult.height);
      
      // Step 2: Scale and crop to original dimensions
      // Calculate the scale factor needed to ensure the entire original content remains visible
      const widthRatio = originalInfo.width / rotatedResult.width;
      const heightRatio = originalInfo.height / rotatedResult.height;
      
      // Use the smaller ratio to ensure the entire image fits
      const scaleFactor = Math.min(widthRatio, heightRatio);
      
      // Create a center crop that maintains the exact original dimensions
      const centerCrop = {
        originX: Math.max(0, Math.round((rotatedResult.width - originalInfo.width) / 2)),
        originY: Math.max(0, Math.round((rotatedResult.height - originalInfo.height) / 2)),
        width: originalInfo.width,
        height: originalInfo.height
      };
      
      console.log('[ProcessImage] Applying center crop to maintain original dimensions:', centerCrop);
      
      // Apply the crop to match original dimensions
      const finalResult = await ImageManipulator.manipulateAsync(
        rotatedResult.uri,
        [{ crop: centerCrop }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 1.0 }
      );
      
      console.log('[ProcessImage] Final processed dimensions:', finalResult.width, 'x', finalResult.height);
      return finalResult.uri;
    } else {
      // For other operations (crop + optional rotate, or just crop)
      const manipulations = [];
      
      // Add crop operation if specified
      if (operations.crop) {
        const region = operations.crop;
        manipulations.push({
          crop: {
            originX: Math.max(0, Math.round(region.x)),
            originY: Math.max(0, Math.round(region.y)),
            width: Math.max(1, Math.round(region.width)),
            height: Math.max(1, Math.round(region.height))
          }
        });
      }
      
      // Add rotate operation if specified
      if (operations.rotate !== undefined) {
        manipulations.push({ rotate: operations.rotate });
      }
      
      // If no operations, return original image
      if (manipulations.length === 0) {
        return imageUri;
      }
      
      // Process the image with all specified operations
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        manipulations,
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
      );
      
      console.log('[ProcessImage] Processed image dimensions:', result.width, 'x', result.height);
      return result.uri;
    }
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
} 