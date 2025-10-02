/**
 * Input validation utilities for flashcard app
 * Simple, industry-standard validation for abuse prevention
 */

// Validation limits (industry standard for flashcard apps)
export const VALIDATION_LIMITS = {
  // Image limits
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB - prevent storage abuse
  ALLOWED_IMAGE_TYPES: ['jpg', 'jpeg', 'png'], // Standard image formats
  
  // Text limits  
  MAX_TEXT_LENGTH: 5000, // Prevent Claude API abuse
  MAX_FLASHCARD_TEXT: 500, // Reasonable flashcard size
  MAX_DECK_NAME_LENGTH: 50, // Reasonable deck name
};

/**
 * Validate image file before upload
 * @param imageUri Local URI of the image
 * @param getFileInfo Function to get file info (size)
 * @returns Object with isValid flag and error message
 */
export async function validateImageFile(
  imageUri: string,
  getFileInfo: (uri: string) => Promise<{ size?: number }>
): Promise<{ isValid: boolean; error?: string }> {
  try {
    // Check file extension
    const fileExt = imageUri.split('.').pop()?.toLowerCase();
    if (!fileExt || !VALIDATION_LIMITS.ALLOWED_IMAGE_TYPES.includes(fileExt)) {
      return {
        isValid: false,
        error: `Invalid file type. Only ${VALIDATION_LIMITS.ALLOWED_IMAGE_TYPES.join(', ')} files are allowed.`
      };
    }

    // Check file size
    const fileInfo = await getFileInfo(imageUri);
    if (fileInfo.size && fileInfo.size > VALIDATION_LIMITS.MAX_IMAGE_SIZE) {
      const sizeMB = (fileInfo.size / (1024 * 1024)).toFixed(1);
      const maxMB = (VALIDATION_LIMITS.MAX_IMAGE_SIZE / (1024 * 1024)).toFixed(0);
      return {
        isValid: false,
        error: `Image is too large (${sizeMB}MB). Maximum size is ${maxMB}MB.`
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error('Error validating image:', error);
    return {
      isValid: false,
      error: 'Failed to validate image file.'
    };
  }
}

/**
 * Validate text input length
 * @param text The text to validate
 * @param maxLength Maximum allowed length (default: API text limit)
 * @returns Object with isValid flag and error message
 */
export function validateTextLength(
  text: string,
  maxLength: number = VALIDATION_LIMITS.MAX_TEXT_LENGTH
): { isValid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return {
      isValid: false,
      error: 'Text cannot be empty.'
    };
  }

  if (text.length > maxLength) {
    return {
      isValid: false,
      error: `Text is too long (${text.length} characters). Maximum is ${maxLength} characters.`
    };
  }

  return { isValid: true };
}

/**
 * Validate flashcard text (stricter limit for better UX)
 * @param text The flashcard text to validate
 * @returns Object with isValid flag and error message
 */
export function validateFlashcardText(text: string): { isValid: boolean; error?: string } {
  return validateTextLength(text, VALIDATION_LIMITS.MAX_FLASHCARD_TEXT);
}

/**
 * Validate deck name
 * @param name The deck name to validate
 * @returns Object with isValid flag and error message
 */
export function validateDeckName(name: string): { isValid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return {
      isValid: false,
      error: 'Deck name cannot be empty.'
    };
  }

  if (name.length > VALIDATION_LIMITS.MAX_DECK_NAME_LENGTH) {
    return {
      isValid: false,
      error: `Deck name is too long. Maximum is ${VALIDATION_LIMITS.MAX_DECK_NAME_LENGTH} characters.`
    };
  }

  return { isValid: true };
}

