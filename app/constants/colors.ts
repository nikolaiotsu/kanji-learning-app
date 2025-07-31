export const COLORS = {
  primary: '#2a62fa', // Changed to custom blue
  secondary: '#FF9500', // Example secondary color (orange)
  accent: '#FF2D55', // Example accent color (pink)
  accentLight: '#FFCAD4', // Light accent for highlights or backgrounds
  accentMedium: '#FFB3C1', // Medium accent
  
  background: '#0a0342', // Changed to darker blue
  // Modern textured background alternatives
  backgroundGradient: 'linear-gradient(135deg, #006ad6 0%, #004ba0 50%, #003875 100%)', // Sophisticated blue gradient
  backgroundRadial: 'radial-gradient(circle at 30% 20%, #0080ff 0%, #006ad6 40%, #004080 100%)', // Radial depth
  backgroundSubtle: 'linear-gradient(45deg, #006ad6 0%, #0074e6 25%, #006ad6 50%, #0074e6 75%, #006ad6 100%)', // Subtle texture
  backgroundModern: 'linear-gradient(135deg, #006ad6 0%, #0074e6 25%, #005bb8 50%, #0074e6 75%, #006ad6 100%)', // Modern variation
  text: '#FFFFFF', // White text for contrast
  lightGray: '#D3D3D3', // Light gray for borders or secondary text
  darkGray: '#A9A9A9', // Darker gray for less emphasis
  disabledDark: '#4A4A4A', // Much darker gray for disabled buttons
  danger: '#DC3545', // Red for errors or destructive actions
  success: '#28A745', // Green for success messages
  warning: '#FFC107', // Yellow for warnings
  
  // Pokedex specific colors
  pokedexBlue: '#2a62fa', // Changed to custom blue
  pokedexGreen: '#4CAF50', // Green accent (like the light or buttons)
  pokedexYellow: '#FFCC00', // Yellow accent (like the light or buttons)
  pokedexPurple: '#8E44AD', // Purple accent for secondary lights
  pokedexBlack: '#1C1C1C', // Deep black for outlines and details
  pokedexDarkRed: '#A6221B', // Darker red for accents or variants
  rubberGrey: '#808080', // Rubber grey for buttons

  // UI Element Colors
  surface: '#1E1E1E', // Dark surface for cards, modals
  mediumSurface: '#333333', // Slightly lighter for elements
  screenBackground: '#111B29', // Dark blue/black for the "screen" area
  flashcardScreenBackground: '#1A1A1A', // Even darker for flashcard screen variant
  darkSurface: '#212121', // Adding darkSurface back
  
  // Premium/subscription colors
  premium: '#FFD700', // Gold for premium features
  premiumLight: '#FFF8DC', // Light gold background
  border: '#444444', // Border color for UI elements
  muted: '#888888', // Muted text color
  error: '#DC3545', // Error color
  royalBlue: '#2a62fa', // Changed to custom blue for flashcard borders
  pokedexAmber: '#E67E22',      // Deep orange for flashcard main light
  pokedexAmberDark: '#B35400',  // Darker orange for flashcard main light accents
  pokedexAmberGlow: '#F39C12',   // Lighter orange for flashcard main light glow
  pokedexAmberPulse: '#FAD7A0', // Pale orange for flashcard main light pulse
};

// Add this default export to satisfy Expo Router
export default { COLORS }; 