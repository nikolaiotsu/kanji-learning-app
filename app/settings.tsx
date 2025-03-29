import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './context/AuthContext';
import { clearFlashcardsAndDecks } from './utils/clearLocalStorage';
import { checkLocalStorage } from './utils/checkLocalStorage';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [hasLocalData, setHasLocalData] = useState(false);
  const [isCheckingStorage, setIsCheckingStorage] = useState(true);

  // Check local storage on component mount
  useEffect(() => {
    checkLocalData();
  }, []);

  // Function to check if there's data in local storage
  const checkLocalData = async () => {
    setIsCheckingStorage(true);
    try {
      const { hasDecks, hasFlashcards } = await checkLocalStorage();
      setHasLocalData(hasDecks || hasFlashcards);
    } catch (error) {
      console.error('Error checking local storage:', error);
    } finally {
      setIsCheckingStorage(false);
    }
  };

  // Function to handle storage cleanup
  const handleClearLocalStorage = () => {
    Alert.alert(
      'Clear Local Data',
      'This will remove any old flashcards and decks stored locally that might not be synced to your account. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: async () => {
            try {
              await clearFlashcardsAndDecks();
              setHasLocalData(false);
              Alert.alert('Success', 'Local flashcards and decks have been cleared.');
            } catch (error) {
              console.error('Error clearing local storage:', error);
              Alert.alert('Error', 'Failed to clear local storage.');
            }
          } 
        }
      ]
    );
  };

  // Function to handle sign out
  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {user ? (
            <View style={styles.profileInfo}>
              <Text style={styles.emailText}>{user.email}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => router.push('/login')}
            >
              <Ionicons name="log-in-outline" size={24} color="#007AFF" style={styles.settingIcon} />
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Sign In</Text>
                <Text style={styles.settingDescription}>
                  Log in to sync your flashcards across devices
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleClearLocalStorage}
            disabled={!hasLocalData && !isCheckingStorage}
          >
            <Ionicons 
              name="trash-outline" 
              size={24} 
              color={hasLocalData ? "#FF3B30" : "#CCCCCC"} 
              style={styles.settingIcon} 
            />
            <View style={styles.settingTextContainer}>
              <Text 
                style={[
                  styles.settingLabel, 
                  { color: hasLocalData ? "#FF3B30" : "#CCCCCC" }
                ]}
              >
                Clear Local Storage
              </Text>
              <Text style={styles.settingDescription}>
                {isCheckingStorage 
                  ? "Checking for local data..."
                  : hasLocalData 
                  ? "Old flashcards and decks detected in local storage"
                  : "No local data to clear"
                }
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {user && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={24} color="#FF3B30" style={styles.settingIcon} />
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingLabel, { color: '#FF3B30' }]}>Sign Out</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  section: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    marginLeft: 16,
    marginBottom: 8,
    marginTop: -10,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  settingIcon: {
    marginRight: 16,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  profileInfo: {
    padding: 16,
  },
  emailText: {
    fontSize: 16,
    color: '#333333',
  },
}); 