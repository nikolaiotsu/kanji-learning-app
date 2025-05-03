export const COLORS = {
  primary: '#5F7ADB', // Medium blue (was Lavender purple)
  secondary: '#61A0AF', // Teal blue (was Jade green)
  danger: '#FF6B6B', // Coral (was Pastel coral)
  background: '#0a1929', // Keep the dark navy blue background
  text: '#EDF2FB', // Pale blue for text (was Off-white)
  lightGray: '#2B2D42', // Dark navy for subtle elements (was Medium gray)
  darkGray: '#8E8E93', // Keeping this as-is for now
  // Additional colors that complement the scheme
  accentLight: '#EDF2FB', // Pale blue for highlights
  accentMedium: '#5F7ADB', // Medium blue for accents
  accentDark: '#2B2D42', // Dark navy for surfaces
  // Re-add pastel colors with new color scheme
  pastelPurple: '#8A9BE9', // Lighter variant of primary (medium blue)
  pastelGreen: '#8AC0CA', // Lighter variant of secondary (teal blue)
  pastelYellow: '#FFF9C4', // Light yellow that complements the palette
  pastelBlue: '#B6CCFE', // Light blue that complements the palette
  // Background variants
  darkSurface: '#2B2D42', // Dark navy for cards/surfaces (was slightly lighter than background)
  mediumSurface: '#384059', // Slightly lighter than darkSurface for elements
};

// Add this default export to satisfy Expo Router
export default { COLORS }; 