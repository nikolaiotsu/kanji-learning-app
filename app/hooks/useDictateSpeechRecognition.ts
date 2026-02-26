import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Audio } from 'expo-av';
import {
  AVAudioSessionCategory,
  AVAudioSessionCategoryOptions,
  AVAudioSessionMode,
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { logger } from '../utils/logger';

/**
 * Restore playback-friendly audio mode after speech recognition stops (fixes reduced output volume).
 * Best practice per expo-speech-recognition docs: explicitly deactivate the iOS audio session
 * so expo-av (TTS, video) can use full volume when playing.
 */
async function restoreAudioModeForPlayback() {
  try {
    if (Platform.OS === 'ios') {
      ExpoSpeechRecognitionModule.setAudioSessionActiveIOS(false, {
        notifyOthersOnDeactivation: true,
      });
      await new Promise((r) => setTimeout(r, 100));
      // Switch to playback category+mode; speech recognition leaves session in
      // playAndRecord+measurement which causes "lower-output playback level" (Apple docs)
      ExpoSpeechRecognitionModule.setCategoryIOS({
        category: AVAudioSessionCategory.playback,
        categoryOptions: [AVAudioSessionCategoryOptions.mixWithOthers],
        mode: AVAudioSessionMode.default,
      });
    }
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (e) {
    logger.warn('Failed to restore audio mode after speech recognition:', e);
  }
}

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
  const volume = useSharedValue(0);

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    volume.value = 0;
    restoreAudioModeForPlayback();
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    volume.value = event.value ?? 0;
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript?.trim();
    if (transcript) {
      onTranscript(transcript, event.isFinal ?? false);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    volume.value = 0;
    restoreAudioModeForPlayback();
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

      const startOpts = {
        lang: locale,
        interimResults: true,
        continuous: true,
        ...(Platform.OS === 'ios' && { iosTaskHint: 'dictation' as const }),
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      };
      ExpoSpeechRecognitionModule.start(startOpts);
    } catch (err) {
      logger.error('Speech recognition start error:', err);
      setError('unknown');
    }
  }, [locale]);

  const stopListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
      // Restore audio mode immediately when user stops - don't rely on 'end' event
      // which may fire late or never if component unmounts (e.g. closing modal/navigating)
      restoreAudioModeForPlayback();
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
    volume,
  };
}
