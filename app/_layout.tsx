import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import AuthGuard from './components/auth/AuthGuard';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGuard>
          <Stack>
            <Stack.Screen name="(screens)" options={{ headerShown: false }} />
            <Stack.Screen name="flashcards" options={{ title: 'Japanese Flashcard' }} />
            <Stack.Screen name="saved-flashcards" options={{ title: 'Saved Flashcards' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="login" options={{ title: 'Login', headerShown: false }} />
            <Stack.Screen name="signup" options={{ title: 'Sign Up', headerShown: false }} />
            <Stack.Screen name="reset-password" options={{ title: 'Reset Password' }} />
          </Stack>
        </AuthGuard>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
