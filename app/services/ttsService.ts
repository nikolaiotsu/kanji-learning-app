import { Audio } from 'expo-av';
import { supabase } from './supabaseClient';
import { getCachedAudioUri, cacheAudio } from './audioCache';
import { Flashcard } from '../types/Flashcard';
import { logger } from '../utils/logger';

const EDGE_FUNCTION_URL = 'text-to-speech';

/**
 * Map detected language display name to BCP-47 code for Google Cloud TTS.
 * Covers both display names (e.g. "Italian") and language codes (e.g. "it") from Settings.
 */
const DETECTED_LANGUAGE_TO_BCP47: Record<string, string> = {
  Japanese: 'ja-JP',
  Chinese: 'cmn-CN',
  Korean: 'ko-KR',
  Russian: 'ru-RU',
  Arabic: 'ar-XA',
  Hindi: 'hi-IN',
  Thai: 'th-TH',
  Italian: 'it-IT',
  Tagalog: 'fil-PH',
  English: 'en-US',
  Esperanto: 'en-US',
  Spanish: 'es-ES',
  French: 'fr-FR',
  Portuguese: 'pt-BR',
  German: 'de-DE',
  Vietnamese: 'vi-VN',
  unknown: 'en-US',
  // Language codes from Settings (forcedDetectionLanguage)
  ja: 'ja-JP',
  zh: 'cmn-CN',
  ko: 'ko-KR',
  ru: 'ru-RU',
  ar: 'ar-XA',
  hi: 'hi-IN',
  th: 'th-TH',
  it: 'it-IT',
  tl: 'fil-PH',
  en: 'en-US',
  eo: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-BR',
  de: 'de-DE',
  vi: 'vi-VN',
};

export type TTSResult = { success: true } | { success: false; error: string };

export interface SynthesizeAndPlayParams {
  flashcard: Flashcard;
  detectedLanguage: string;
  userId: string;
}

/**
 * Derive BCP-47 language code from detected language name or code.
 * Exported for use when deleting cached audio on card removal.
 */
export function getLanguageCode(detectedLanguage: string): string {
  return DETECTED_LANGUAGE_TO_BCP47[detectedLanguage] ?? 'en-US';
}

/**
 * Synthesize speech for the flashcard's originalText and play it.
 * Uses cache when available; otherwise calls edge function, caches, then plays.
 */
export async function synthesizeAndPlay(params: SynthesizeAndPlayParams): Promise<TTSResult> {
  const { flashcard, detectedLanguage, userId } = params;
  const text = flashcard.originalText?.trim();

  if (!text) {
    return { success: false, error: 'No text to speak' };
  }

  const languageCode = getLanguageCode(detectedLanguage);

  try {
    // Check cache first
    let audioUri = await getCachedAudioUri(userId, text, languageCode);

    if (!audioUri) {
      // Cache miss: call edge function
      const { data, error } = await supabase.functions.invoke<{ audioContent: string }>(
        EDGE_FUNCTION_URL,
        { body: { text, languageCode } }
      );

      if (error) {
        logger.error('TTS edge function error:', error);
        return { success: false, error: error.message || 'Speech synthesis failed' };
      }

      if (!data?.audioContent) {
        return { success: false, error: 'No audio received from server' };
      }

      audioUri = await cacheAudio(userId, text, languageCode, data.audioContent);
      if (!audioUri) {
        return { success: false, error: 'Failed to cache audio' };
      }
    }

    // Configure audio mode for playback
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: audioUri },
      { shouldPlay: true }
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish && !status.isLooping) {
        sound.unloadAsync().catch(() => {});
      }
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('TTS synthesizeAndPlay error:', message);
    return { success: false, error: message };
  }
}
