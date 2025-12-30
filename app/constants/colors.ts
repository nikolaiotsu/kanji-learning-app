export const COLORS = {
  primary: '#3B82F6', // Vibrant blue
  secondary: '#FF9500', // Example secondary color (orange)
  accent: '#8B5CF6', // Purple accent
  accentLight: '#C4B5FD', // Light purple for highlights
  accentMedium: '#A78BFA', // Medium purple accent
  
  background: '#0A1628', // Deep navy blue
  // Modern textured background alternatives
  backgroundGradient: 'linear-gradient(135deg, #1E3A5F 0%, #0F2847 50%, #0A1628 100%)', // Sophisticated blue gradient
  backgroundRadial: 'radial-gradient(circle at 30% 20%, #2563EB 0%, #1E40AF 40%, #1E3A8A 100%)', // Radial depth
  backgroundSubtle: 'linear-gradient(45deg, #1E3A5F 0%, #1E40AF 25%, #1E3A5F 50%, #1E40AF 75%, #1E3A5F 100%)', // Subtle texture
  backgroundModern: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 25%, #1E40AF 50%, #1E3A8A 75%, #0F172A 100%)', // Modern variation
  text: '#FFFFFF', // White text for contrast
  textSecondary: '#94A3B8', // Softer secondary text
  lightGray: '#CBD5E1', // Light gray for borders
  darkGray: '#64748B', // Slate gray
  disabledDark: '#334155', // Slate dark for disabled
  danger: '#EF4444', // Modern red
  success: '#22C55E', // Modern green
  warning: '#F59E0B', // Modern amber
  
  // Pokedex specific colors - modernized
  pokedexBlue: '#3B82F6', // Vibrant blue
  pokedexGreen: '#22C55E', // Modern green
  pokedexYellow: '#FBBF24', // Warm amber
  pokedexPurple: '#A855F7', // Vibrant purple
  pokedexBlack: '#0F172A', // Deep slate for outlines
  pokedexDarkRed: '#DC2626', // Modern red
  rubberGrey: '#475569', // Slate grey for buttons

  // UI Element Colors
  surface: '#1E293B', // Slate surface
  mediumSurface: '#334155', // Medium slate
  screenBackground: '#0F172A', // Deep slate screen
  flashcardScreenBackground: '#0F172A', // Consistent dark
  darkSurface: '#1E293B', // Slate dark surface
  
  // Premium/subscription colors
  premium: '#FBBF24', // Amber gold
  premiumLight: '#FEF3C7', // Light amber
  border: '#334155', // Slate border
  muted: '#64748B', // Muted slate
  error: '#EF4444', // Modern red
  royalBlue: '#3B82F6', // Vibrant blue for flashcard borders
  pokedexAmber: '#F59E0B',      // Modern amber for flashcard main light
  pokedexAmberDark: '#D97706',  // Darker amber
  pokedexAmberGlow: '#FBBF24',  // Lighter amber glow
  pokedexAmberPulse: '#FDE68A', // Pale amber pulse
  
  // NEW: Gradient colors for modern buttons
  gradient: {
    // Primary blue gradient (vibrant)
    blueStart: '#3B82F6',
    blueEnd: '#1D4ED8',
    blueMid: '#2563EB',
    
    // Glassmorphism effects
    glassLight: 'rgba(255, 255, 255, 0.15)',
    glassMedium: 'rgba(255, 255, 255, 0.08)',
    glassDark: 'rgba(255, 255, 255, 0.03)',
    glassBorder: 'rgba(255, 255, 255, 0.2)',
    
    // Button gradient overlays
    buttonOverlay: 'rgba(59, 130, 246, 0.3)',
    buttonHighlight: 'rgba(255, 255, 255, 0.25)',
    buttonShadow: 'rgba(15, 23, 42, 0.5)',
    
    // Accent gradients
    purpleStart: '#8B5CF6',
    purpleEnd: '#6D28D9',
    cyanStart: '#06B6D4',
    cyanEnd: '#0891B2',
  },
};

// Add this default export to satisfy Expo Router
export default { COLORS }; 