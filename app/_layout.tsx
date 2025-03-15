import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack>
        <Stack.Screen name="(screens)" options={{ headerShown: false }} />
        <Stack.Screen name="flashcards" options={{ title: 'Japanese Flashcard' }} />
        <Stack.Screen name="saved-flashcards" options={{ title: 'Saved Flashcards' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
