import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import SettingsProvider from './context/SettingsContext';
import AuthGuard from './components/auth/AuthGuard';
import { StyleSheet, View } from 'react-native';
import { COLORS } from './constants/colors';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

export default function RootLayout() {
  // Initialize WebBrowser to handle OAuth redirects
  useEffect(() => {
    // This enables redirect handling for Google and Apple auth
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaProvider>
        <AuthProvider>
          <SettingsProvider>
            <AuthGuard>
              <Stack 
                screenOptions={{
                  headerShown: true,
                  headerStyle: {
                    backgroundColor: COLORS.background,
                  },
                  headerTintColor: COLORS.text,
                  headerTitleStyle: {
                    fontWeight: 'bold',
                  },
                  headerBackTitle: 'Back',
                  contentStyle: {
                    backgroundColor: COLORS.background,
                  },
                  // Add border and shadow to make headers pop
                  headerShadowVisible: true,
                }}
              >
                <Stack.Screen name="(screens)" options={{ headerShown: false }} />
                <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
                <Stack.Screen name="flashcards" options={{ title: 'Make a Flashcard' }} />
                <Stack.Screen 
                  name="saved-flashcards" 
                  options={{ 
                    title: 'Saved Flashcards',
                  }} 
                />
                <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                <Stack.Screen name="login" options={{ title: 'Login', headerShown: false }} />
                <Stack.Screen name="signup" options={{ title: 'Sign Up', headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ title: 'Reset Password' }} />
              </Stack>
            </AuthGuard>
          </SettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
