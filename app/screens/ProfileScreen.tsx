import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import { router } from 'expo-router';

const ProfileScreen = () => {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/login');
    } catch (error: any) {
      Alert.alert('Sign Out Failed', error.message);
    }
  };

  // Function to check login provider
  const getAuthProvider = () => {
    if (!user) return 'Not logged in';
    
    if (user.app_metadata?.provider === 'google') {
      return 'Google';
    } else if (user.app_metadata?.provider === 'apple') {
      return 'Apple';
    } else {
      return 'Email/Password';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Profile</Text>
        
        <View style={styles.card}>
          <Text style={styles.label}>Authentication Status:</Text>
          <Text style={styles.value}>{user ? 'Authenticated' : 'Not Authenticated'}</Text>
          
          <Text style={styles.label}>Provider:</Text>
          <Text style={styles.value}>{getAuthProvider()}</Text>
          
          <Text style={styles.label}>User ID:</Text>
          <Text style={styles.value}>{user?.id || 'N/A'}</Text>
          
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.value}>{user?.email || 'N/A'}</Text>
          
          <Text style={styles.label}>Created At:</Text>
          <Text style={styles.value}>
            {user?.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}
          </Text>
          
          <Text style={styles.label}>Last Sign In:</Text>
          <Text style={styles.value}>
            {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'N/A'}
          </Text>
        </View>
        
        <Text style={styles.sectionTitle}>Authentication Metadata</Text>
        <View style={styles.metadataContainer}>
          <Text style={styles.codeBlock}>
            {JSON.stringify(user?.app_metadata || {}, null, 2)}
          </Text>
        </View>
        
        <TouchableOpacity style={styles.button} onPress={handleSignOut}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: COLORS.text,
  },
  sectionTitle: {
    fontFamily: FONTS.sansBold,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  label: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.accentMedium,
    marginBottom: 4,
  },
  value: {
    fontFamily: FONTS.sansMedium,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 16,
    fontWeight: '500',
  },
  metadataContainer: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  codeBlock: {
    fontFamily: 'monospace',
    color: COLORS.text,
    fontSize: 14,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    fontFamily: FONTS.sansBold,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ProfileScreen; 