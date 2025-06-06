import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function Layout() {
  return (
    <SafeAreaProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: "Language Learning App" }} />
        <Stack.Screen name="camera" options={{ title: "Take Picture" }} />
        <Stack.Screen name="flashcards" options={{ title: "Flashcards" }} />
      </Stack>
    </SafeAreaProvider>
  );
} 