import * as ImageManipulator from 'expo-image-manipulator';
import MemoryManager from './memoryManager';

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
    // PERFORMANCE OPTIMIZATION: Use minimal processing just to get dimensions
    const info = await ImageManipulator.manipulateAsync(
      imageUri,
      [], // No operations, just getting info
      { 
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.1 // Use minimal quality since we're only getting dimensions
      }
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
    
    // PERFORMANCE OPTIMIZATION: Skip getting original info if not needed for debugging
    // const originalInfo = await getImageInfo(imageUri);
    // console.log('[ProcessImage] Original image dimensions:', originalInfo.width, 'x', originalInfo.height);
    
    // Use ImageManipulator to rotate the image with balanced quality settings
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        { rotate: angle }
      ],
      { 
        format: ImageManipulator.SaveFormat.JPEG, 
        compress: 0.8,  // Better balance between quality and speed
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

// Process image with multiple operations (crop and rotate) - Memory-aware version
export async function processImage(
  imageUri: string, 
  operations: { crop?: Region; rotate?: number }
): Promise<string> {
  const memoryManager = MemoryManager.getInstance();
  
  try {
    console.log('[ProcessImage] Processing image with operations:', operations);
    
    // Simple cleanup check before processing
    if (await memoryManager.shouldCleanup()) {
      console.log('[ProcessImage] Performing cleanup before processing');
      await memoryManager.cleanupPreviousImages(imageUri);
    }
    
    // Small delay for all builds to prevent rapid image operations
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get original image info
    const originalInfo = await getImageInfo(imageUri);
    const standardConfig = memoryManager.getStandardImageConfig();
    
    console.log('[ProcessImage] Original image dimensions:', originalInfo.width, 'x', originalInfo.height);
    
    // Check if this is a rotation-only operation
    const isRotationOnly = !operations.crop && operations.rotate !== undefined;
    
    if (isRotationOnly) {
      // For rotation-only operations, ensure the entire image is preserved without resizing
      console.log('[ProcessImage] Performing rotation-only operation');
      
              // Rotate the image with standard quality settings
        const rotatedResult = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ rotate: operations.rotate! }],
          { 
            format: ImageManipulator.SaveFormat.JPEG, 
            compress: standardConfig.compress, // Use standard compression
          }
        );
      
      console.log('[ProcessImage] Rotated image dimensions:', rotatedResult.width, 'x', rotatedResult.height);
      
      // Track the processed image
      memoryManager.trackProcessedImage(rotatedResult.uri);
      
      return rotatedResult.uri;
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
      
      // Process the image with standard settings
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        manipulations,
        { 
          format: ImageManipulator.SaveFormat.JPEG, 
          compress: standardConfig.compress // Use standard compression
        }
      );
      
      console.log('[ProcessImage] Processed image dimensions:', result.width, 'x', result.height);
      
      // Track the processed image
      memoryManager.trackProcessedImage(result.uri);
      
      return result.uri;
    }
  } catch (error) {
    console.error('Error processing image:', error);
    // Attempt recovery with emergency cleanup for memory pressure situations
    try {
      await memoryManager.emergencyCleanup();
      console.log('[ProcessImage] Emergency cleanup completed, retrying operation');
    } catch (cleanupError) {
      console.error('[ProcessImage] Emergency cleanup failed:', cleanupError);
    }
    throw error;
  }
} 