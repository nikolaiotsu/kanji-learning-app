export const COLORS = {
  primary: '#3B82F6', // Vibrant blue
  secondary: '#FF9500', // Example secondary color (orange)
  accent: '#8B5CF6', // Purple accent
  accentLight: '#C4B5FD', // Light purple for highlights
  accentMedium: '#A78BFA', // Medium purple accent
  
  background: '#0A1628', // Deep navy blue (canonical base for layout + textured background)
  backgroundLift: '#0B1729',   // Slightly lighter for gradient steps
  backgroundLift2: '#0D1A2F', // Gentle lift
  backgroundLift3: '#0C182B',  // Soft return
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
  royalBlue50: 'rgba(59, 130, 246, 0.5)', // 50% opacity highlight
  appleLiquidGrey: 'rgba(142, 142, 147, 0.4)', // Apple liquid border style grey
  pokedexAmber: '#F59E0B',      // Modern amber for flashcard main light
  pokedexAmberDark: '#D97706',  // Darker amber
  pokedexAmberGlow: '#FBBF24',  // Lighter amber glow
  pokedexAmberPulse: '#FDE68A', // Pale amber pulse
  
  // Shared blue tints for PokedexLayout + TexturedBackground (consistent blue)
  blueTint: {
    accent: 'rgba(59, 130, 246, 0.15)',   // Stronger for gradient variant
    strong: 'rgba(59, 130, 246, 0.08)',
    medium: 'rgba(59, 130, 246, 0.04)',
    subtle: 'rgba(59, 130, 246, 0.025)',
    faint: 'rgba(59, 130, 246, 0.02)',
    veryFaint: 'rgba(59, 130, 246, 0.015)',
  },
  blueTintMid: 'rgba(37, 99, 235, 0.03)',       // blueMid
  blueTintMidStrong: 'rgba(37, 99, 235, 0.1)', // for gradient variant
  blueTintEnd: 'rgba(30, 64, 175, 0.02)',      // blueEnd

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
  
  // Modern depth & shading system
  depth: {
    // Highlights (top/left edges for 3D effect)
    highlightStrong: 'rgba(255, 255, 255, 0.18)',
    highlightMedium: 'rgba(255, 255, 255, 0.12)',
    highlightSubtle: 'rgba(255, 255, 255, 0.06)',
    highlightFaint: 'rgba(255, 255, 255, 0.03)',
    
    // Shadows (bottom/right edges for 3D effect)
    shadowStrong: 'rgba(0, 0, 0, 0.45)',
    shadowMedium: 'rgba(0, 0, 0, 0.30)',
    shadowSubtle: 'rgba(0, 0, 0, 0.18)',
    shadowFaint: 'rgba(0, 0, 0, 0.08)',
    
    // Inset shadows for pressed/recessed look
    insetLight: 'rgba(0, 0, 0, 0.25)',
    insetMedium: 'rgba(0, 0, 0, 0.35)',
    insetDeep: 'rgba(0, 0, 0, 0.50)',
    
    // Ambient glow effects
    glowBlue: 'rgba(59, 130, 246, 0.25)',
    glowBlueSoft: 'rgba(59, 130, 246, 0.12)',
    glowPurple: 'rgba(139, 92, 246, 0.25)',
    glowAmber: 'rgba(251, 191, 36, 0.25)',
    
    // Surface elevation levels
    surface0: 'rgba(15, 23, 42, 0.95)',  // Base level
    surface1: 'rgba(30, 41, 59, 0.90)',  // Slightly elevated
    surface2: 'rgba(51, 65, 85, 0.85)',  // More elevated
    surface3: 'rgba(71, 85, 105, 0.80)',  // Highest elevation
    
    // Rim lighting for edge highlights
    rimLight: 'rgba(148, 163, 184, 0.20)',
    rimLightStrong: 'rgba(148, 163, 184, 0.35)',
    
    // Bevel colors for 3D buttons
    bevelTop: 'rgba(255, 255, 255, 0.15)',
    bevelBottom: 'rgba(0, 0, 0, 0.35)',
    bevelLeft: 'rgba(255, 255, 255, 0.08)',
    bevelRight: 'rgba(0, 0, 0, 0.20)',
  },
  
  // Noise/texture overlay
  texture: {
    noiseLight: 'rgba(255, 255, 255, 0.015)',
    noiseDark: 'rgba(0, 0, 0, 0.02)',
    grain: 'rgba(128, 128, 128, 0.03)',
  },
};

// Add this default export to satisfy Expo Router
export default { COLORS }; 