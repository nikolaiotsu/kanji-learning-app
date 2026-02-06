import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Text, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';
import SocialAuth from '../components/SocialAuth';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/typography';
import PokedexLayout from '../components/shared/PokedexLayout';

import { logger } from '../utils/logger';
// Import the logo image
const worddexLogo = require('../../assets/images/worddexlogo.png');

const LoginScreen = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    logger.log('🔐 [LoginScreen] Starting email login process...');
    logger.log('🔐 [LoginScreen] Email:', email);
    logger.log('🔐 [LoginScreen] Password length:', password.length);
    
    if (!email || !password) {
      logger.log('❌ [LoginScreen] Missing credentials');
      Alert.alert(t('common.error'), t('auth.login.missingCredentials'));
      return;
    }
    
    setLoading(true);
    try {
      logger.log('🔐 [LoginScreen] Calling signIn function...');
      await signIn(email, password);
      logger.log('✅ [LoginScreen] signIn completed successfully');
      logger.log('🔐 [LoginScreen] Authentication successful, letting AuthGuard handle navigation...');
    } catch (error: any) {
      logger.error('❌ [LoginScreen] Login error:', error);
      logger.error('❌ [LoginScreen] Error message:', error.message);
      logger.error('❌ [LoginScreen] Error details:', JSON.stringify(error));
      Alert.alert(t('auth.login.loginFailed'), error.message || 'Failed to login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const navigateToSignUp = () => {
    router.push('/signup');
  };

  const navigateToResetPassword = () => {
    router.push('/reset-password');
  };

  return (
    <PokedexLayout 
      logoSource={worddexLogo}
      logoStyle={{ 
        width: 80,
        height: 65,
        right: 10,
        top: 0
      }}
    >
      <View style={styles.form}>
        <Text style={styles.title}>{t('auth.login.title')}</Text>
        
        <View style={styles.newUserContainer}>
          <Text style={styles.newUserText}>{t('auth.login.newUser')}</Text>
          <TouchableOpacity 
            style={styles.signUpButton} 
            onPress={navigateToSignUp}
          >
            <Text style={styles.signUpButtonText}>{t('auth.login.createAccount')}</Text>
          </TouchableOpacity>
        </View>
        
        <TextInput
          style={styles.input}
          placeholder={t('auth.login.emailPlaceholder')}
          placeholderTextColor="#A0A0A0"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        
        <TextInput
          style={styles.input}
          placeholder={t('auth.login.passwordPlaceholder')}
          placeholderTextColor="#A0A0A0"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        
        <TouchableOpacity 
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('auth.login.loginButton')}</Text>
          )}
        </TouchableOpacity>
        
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('common.or')}</Text>
          <View style={styles.dividerLine} />
        </View>
        
        <SocialAuth mode="login" />
        
        <View style={styles.links}>
          <TouchableOpacity onPress={navigateToResetPassword}>
            <Text style={styles.link}>{t('auth.login.forgotPassword')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </PokedexLayout>
  );
};

const styles = StyleSheet.create({
  form: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.sansBold,
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: COLORS.text,
  },
  newUserContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    backgroundColor: COLORS.darkSurface,
    padding: 15,
    borderRadius: 8,
  },
  newUserText: {
    fontFamily: FONTS.sans,
    fontSize: 16,
    marginRight: 10,
    color: COLORS.text,
  },
  signUpButton: {
    backgroundColor: COLORS.secondary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  signUpButtonText: {
    fontFamily: FONTS.sansBold,
    color: COLORS.text,
    fontWeight: 'bold',
  },
  input: {
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: COLORS.darkGray,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: COLORS.darkSurface,
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    fontFamily: FONTS.sansBold,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  links: {
    marginTop: 20,
    alignItems: 'center',
  },
  link: {
    fontFamily: FONTS.sans,
    color: COLORS.lightGray,
    fontSize: 14,
    marginVertical: 5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.darkGray,
  },
  dividerText: {
    fontFamily: FONTS.sans,
    marginHorizontal: 10,
    color: COLORS.text,
  },
});

export default LoginScreen; 