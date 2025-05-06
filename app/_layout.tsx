import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import SettingsProvider from './context/SettingsContext';
import AuthGuard from './components/auth/AuthGuard';
import { StyleSheet, View } from 'react-native';
import { COLORS } from './constants/colors';

export default function RootLayout() {
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
                    backgroundColor: COLORS.darkSurface, // Dark navy for header
                  },
                  headerTintColor: COLORS.text, // Pale blue for header text
                  headerTitleStyle: {
                    fontWeight: 'bold',
                  },
                  // Set back button text to 'Back'
                  headerBackTitle: 'Back',
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
  },
});
