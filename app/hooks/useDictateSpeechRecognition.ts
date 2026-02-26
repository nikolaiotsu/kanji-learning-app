import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { logger } from '../utils/logger';

const SPEECH_LOCALE_MAP: Record<string, string> = {
  ja: 'ja-JP',
  zh: 'zh-CN',
  ko: 'ko-KR',
  en: 'en-US',
  fr: 'fr-FR',
  ru: 'ru-RU',
  ar: 'ar-SA',
  hi: 'hi-IN',
  th: 'th-TH',
  vi: 'vi-VN',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-BR',
};

export function getSpeechLocaleForLanguage(langCode: string): string {
  return SPEECH_LOCALE_MAP[langCode] ?? 'en-US';
}

export interface UseDictateSpeechRecognitionOptions {
  /** BCP-47 locale for speech recognition (e.g. "en-US"). Use getSpeechLocaleForLanguage(targetLanguage) for Dictate, since input expects target language. */
  locale: string;
  /** Called when transcript is available. isFinal: true = append to input; false = interim (optional preview). */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Whether the Dictate modal is visible. When false, stops listening on next effect. */
  isActive?: boolean;
}

export function useDictateSpeechRecognition({
  locale,
  onTranscript,
  isActive = true,
}: UseDictateSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript?.trim();
    if (transcript) {
      onTranscript(transcript, event.isFinal ?? false);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    const code = event.error ?? 'unknown';
    const msg = event.message ?? '';
    logger.warn('Speech recognition error:', code, msg);
    setError(code);
  });

  const startListening = useCallback(async () => {
    setError(null);
    try {
      const available = await ExpoSpeechRecognitionModule.isRecognitionAvailable();
      setIsAvailable(available);
      if (!available) {
        setError('service-not-allowed');
        return;
      }

      const micResult = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
      setHasPermission(micResult.granted);
      if (!micResult.granted) {
        setError('not-allowed');
        return;
      }

      const startOpts = { lang: locale, interimResults: true, continuous: true, ...(Platform.OS === 'ios' && { iosTaskHint: 'dictation' }) };
      ExpoSpeechRecognitionModule.start(startOpts);
    } catch (err) {
      logger.error('Speech recognition start error:', err);
      setError('unknown');
    }
  }, [locale]);

  const stopListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore
    }
  }, []);

  // Stop listening when modal is closed
  useEffect(() => {
    if (!isActive && isListening) {
      stopListening();
    }
  }, [isActive, isListening, stopListening]);

  return {
    isListening,
    startListening,
    stopListening,
    error,
    hasPermission,
    isAvailable,
  };
}
