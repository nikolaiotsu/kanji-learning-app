import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Text, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';
import SocialAuth from '../components/SocialAuth';
import PokedexLayout from '../components/shared/PokedexLayout';
import { COLORS } from '../constants/colors';

const SignupScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp, devSignUpAndSignIn } = useAuth();

  const handleDevSignup = async () => {
    let testEmail = email;
    let testPassword = password;
    let testConfirmPassword = confirmPassword;
    
    // Auto-fill empty fields with test values
    if (!testEmail) {
      testEmail = `test${Math.floor(Math.random() * 10000)}@example.com`;
      setEmail(testEmail);
      console.log('Auto-filled test email:', testEmail);
    }
    
    if (!testPassword) {
      testPassword = 'password123';
      setPassword(testPassword);
      console.log('Auto-filled test password');
    }
    
    if (!testConfirmPassword) {
      testConfirmPassword = testPassword;
      setConfirmPassword(testConfirmPassword);
      console.log('Auto-filled test confirm password');
    }
    
    // Check if passwords match
    if (testPassword !== testConfirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    
    // Check password length
    if (testPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      console.log(`Attempting dev sign-in with: ${testEmail}`);
      await devSignUpAndSignIn(testEmail, testPassword);
      // If we get here, sign in was successful
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Dev signup error:', error);
      Alert.alert('Dev Signup Failed', error.message || 'Failed to create account in dev mode.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    // Validate inputs
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      await signUp(email, password);
      Alert.alert(
        'Account Created',
        'We\'ve sent a verification link to your email address. Please check your inbox and click the link to verify your account before logging in.',
        [
          { 
            text: 'OK', 
            onPress: () => router.replace('/login') 
          }
        ]
      );
    } catch (error: any) {
      // Handle specific signup errors
      if (error.message && error.message.includes('User already registered')) {
        Alert.alert(
          'Account Already Exists', 
          'An account with this email already exists. Please log in instead.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Login', onPress: () => router.replace('/login') }
          ]
        );
      } else {
        Alert.alert('Registration Failed', error.message || 'Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const navigateToLogin = () => {
    router.push('/login');
  };

  return (
    <PokedexLayout>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.form}>
          <Text style={styles.title}>Create Your Account</Text>
          
          <Text style={styles.subtitle}>
            Create an account to start collecting words.
          </Text>
          
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Sign up with</Text>
            <View style={styles.dividerLine} />
          </View>
          
          {/* Social authentication options */}
          <SocialAuth mode="signup" />
          
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or with email</Text>
            <View style={styles.dividerLine} />
          </View>
          
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          
          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <Text style={styles.passwordHint}>
            Password must be at least 6 characters long.
          </Text>
          
          <TouchableOpacity 
            style={styles.button}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>
          
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity 
            style={styles.loginButton}
            onPress={navigateToLogin}
          >
            <Text style={styles.loginButtonText}>Log In with Existing Account</Text>
          </TouchableOpacity>

          {/* DEV MODE button - REMOVE BEFORE PRODUCTION */}
          <TouchableOpacity 
            style={[styles.button, styles.devButton]}
            onPress={handleDevSignup}
            disabled={loading}
          >
            <Text style={styles.devButtonText}>DEV MODE: Auto-fill & Skip Verification</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </PokedexLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  form: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  passwordHint: {
    color: '#666',
    fontSize: 12,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  button: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 30,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#666',
  },
  loginButton: {
    borderWidth: 1,
    borderColor: '#007BFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#007BFF',
    fontSize: 16,
    fontWeight: '500',
  },
  links: {
    marginTop: 20,
    alignItems: 'center',
  },
  link: {
    color: '#007BFF',
    fontSize: 14,
    marginVertical: 5,
  },
  devButton: {
    backgroundColor: '#ff6b6b',
    marginTop: 20,
  },
  devButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default SignupScreen; 