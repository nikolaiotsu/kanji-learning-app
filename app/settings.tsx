import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './context/AuthContext';
import { useSettings, AVAILABLE_LANGUAGES, DETECTABLE_LANGUAGES } from './context/SettingsContext';
import { clearFlashcardsAndDecks } from './utils/clearLocalStorage';
import { checkLocalStorage } from './utils/checkLocalStorage';
import { useRouter } from 'expo-router';
import { COLORS } from './constants/colors';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { 
    targetLanguage, 
    setTargetLanguage, 
    forcedDetectionLanguage, 
    setForcedDetectionLanguage,
    availableLanguages,
    detectableLanguages 
  } = useSettings();
  
  const router = useRouter();
  const [hasLocalData, setHasLocalData] = useState(false);
  const [isCheckingStorage, setIsCheckingStorage] = useState(true);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showDetectionSelector, setShowDetectionSelector] = useState(false);

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

  // Function to show language selector modal
  const handleShowLanguageSelector = () => {
    setShowLanguageSelector(true);
  };

  // Function to show detection language selector modal
  const handleShowDetectionSelector = () => {
    setShowDetectionSelector(true);
  };

  // Function to select a language
  const handleSelectLanguage = async (langCode: string) => {
    try {
      await setTargetLanguage(langCode);
      setShowLanguageSelector(false);
    } catch (error) {
      console.error('Error setting language:', error);
      Alert.alert('Error', 'Failed to set language. Please try again.');
    }
  };

  // Function to select a detection language
  const handleSelectDetectionLanguage = async (langCode: string) => {
    try {
      await setForcedDetectionLanguage(langCode);
      setShowDetectionSelector(false);
    } catch (error) {
      console.error('Error setting detection language:', error);
      Alert.alert('Error', 'Failed to set detection language. Please try again.');
    }
  };

  // Get language data for the flat list
  const languageData = Object.entries(availableLanguages).map(([code, name]) => ({
    code,
    name
  }));

  // Get detection language data for the flat list
  const detectionLanguageData = Object.entries(detectableLanguages).map(([code, name]) => ({
    code,
    name
  }));

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
              <Ionicons name="log-in-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
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
          <Text style={styles.sectionTitle}>Preferences</Text>
          
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleShowLanguageSelector}
          >
            <Ionicons name="language-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Target Language</Text>
              <Text style={styles.settingDescription}>
                {availableLanguages[targetLanguage as keyof typeof availableLanguages]} (tap to change)
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleShowDetectionSelector}
          >
            <Ionicons name="scan-outline" size={24} color={COLORS.primary} style={styles.settingIcon} />
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Forced Language Detection</Text>
              <Text style={styles.settingDescription}>
                {detectableLanguages[forcedDetectionLanguage as keyof typeof detectableLanguages]} (tap to change)
              </Text>
            </View>
            {forcedDetectionLanguage !== 'auto' && (
              <TouchableOpacity 
                style={styles.resetButton} 
                onPress={() => handleSelectDetectionLanguage('auto')}
              >
                <Ionicons name="refresh" size={20} color={COLORS.text} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
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
              color={hasLocalData ? COLORS.danger : COLORS.darkGray} 
              style={styles.settingIcon} 
            />
            <View style={styles.settingTextContainer}>
              <Text 
                style={[
                  styles.settingLabel, 
                  { color: hasLocalData ? COLORS.danger : COLORS.darkGray }
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
              <Ionicons name="log-out-outline" size={24} color={COLORS.danger} style={styles.settingIcon} />
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingLabel, { color: COLORS.danger }]}>Sign Out</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Language selector modal */}
      <Modal
        visible={showLanguageSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLanguageSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Target Language</Text>
              <TouchableOpacity onPress={() => setShowLanguageSelector(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={languageData}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.languageItem,
                    targetLanguage === item.code && styles.selectedLanguageItem
                  ]}
                  onPress={() => handleSelectLanguage(item.code)}
                >
                  <Text 
                    style={[
                      styles.languageText,
                      targetLanguage === item.code && styles.selectedLanguageText
                    ]}
                  >
                    {item.name}
                  </Text>
                  {targetLanguage === item.code && (
                    <Ionicons name="checkmark" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowLanguageSelector(false)}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Detection language selector modal */}
      <Modal
        visible={showDetectionSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDetectionSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Force Language Detection</Text>
              <TouchableOpacity onPress={() => setShowDetectionSelector(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              This setting forces the app to treat the text as being in a specific language, bypassing automatic detection. 
              Use this when working with languages that may be confused with each other.
            </Text>
            <FlatList
              data={detectionLanguageData}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.languageItem,
                    forcedDetectionLanguage === item.code && styles.selectedLanguageItem
                  ]}
                  onPress={() => handleSelectDetectionLanguage(item.code)}
                >
                  <Text 
                    style={[
                      styles.languageText,
                      forcedDetectionLanguage === item.code && styles.selectedLanguageText
                    ]}
                  >
                    {item.name}
                  </Text>
                  {forcedDetectionLanguage === item.code && (
                    <Ionicons name="checkmark" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowDetectionSelector(false)}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 16,
    backgroundColor: COLORS.darkSurface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  section: {
    marginTop: 20,
    backgroundColor: COLORS.darkSurface,
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accentMedium,
    marginLeft: 16,
    marginBottom: 8,
    marginTop: -10,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
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
    color: COLORS.text,
  },
  settingDescription: {
    fontSize: 14,
    color: COLORS.darkGray,
  },
  profileInfo: {
    padding: 16,
  },
  emailText: {
    fontSize: 16,
    color: COLORS.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxHeight: '70%',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 10,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalDescription: {
    fontSize: 14,
    color: COLORS.darkGray,
    marginBottom: 16,
    lineHeight: 20,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  selectedLanguageItem: {
    backgroundColor: COLORS.primary + '33', // Semi-transparent primary color
  },
  languageText: {
    fontSize: 16,
    color: COLORS.text,
  },
  selectedLanguageText: {
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  closeButton: {
    marginTop: 16,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.text,
    fontWeight: '500',
  },
  resetButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.darkSurface,
  },
}); 