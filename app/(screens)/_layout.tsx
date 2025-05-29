import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';

export default function ScreensLayout() {
  return (
    <SafeAreaProvider>
      <Stack 
        screenOptions={{ 
          headerShown: false,
          contentStyle: { 
            backgroundColor: COLORS.background 
          }
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen 
          name="camera" 
          options={{ 
            gestureEnabled: false 
          }} 
        />
        <Stack.Screen name="flashcards" />
      </Stack>
    </SafeAreaProvider>
  );
} 