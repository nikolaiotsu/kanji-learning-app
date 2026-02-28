/**
 * Gemini API backup translation service.
 * Used when Claude API is unavailable (e.g., 529 overload, network error).
 * Provides translation-only fallback with same output shape as Claude.
 */
import Constants from 'expo-constants';
import axios from 'axios';
import { cleanJsonString, parseWordScopeResponse } from './claude/responseParser';
import { logger } from '../utils/logger';
import {
  japaneseTranslationSystemPromptLite,
  chineseTranslationSystemPromptLite,
  koreanTranslationSystemPromptLite,
  arabicTranslationSystemPromptLite,
  hindiTranslationSystemPromptLite,
  thaiTranslationSystemPromptLite,
  russianTranslationSystemPromptLite,
  simpleTranslationPromptLite,
  ACCURATE_TRANSLATION_POLICY,
} from './claude/prompts';

const LANGUAGE_NAMES_MAP: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  ru: 'Russian',
  ko: 'Korean',
  zh: 'Chinese',
  tl: 'Tagalog',
  ja: 'Japanese',
  ar: 'Arabic',
  pt: 'Portuguese',
  de: 'German',
  hi: 'Hindi',
  eo: 'Esperanto',
  th: 'Thai',
  vi: 'Vietnamese',
};

// gemini-2.5-flash-lite has the most generous free tier: 15 RPM, 1,000 RPD
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

/** Compatible with ClaudeResponse for drop-in fallback. */
interface GeminiTranslationResult {
  readingsText: string;
  translatedText: string;
  errorCode?: 'API_ERROR';
}
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Selects the appropriate translation prompt based on source language (forcedLanguage).
 */
function getSystemPromptForLanguage(
  forcedLanguage: string,
  targetLanguage: string,
  outputNeedsReadings: boolean
): string {
  const targetLangName = LANGUAGE_NAMES_MAP[targetLanguage] || 'English';
  const normalizedForced = (forcedLanguage || 'en').toLowerCase();

  const promptMap: Record<string, string> = {
    ja: japaneseTranslationSystemPromptLite,
    zh: chineseTranslationSystemPromptLite,
    ko: koreanTranslationSystemPromptLite,
    ar: arabicTranslationSystemPromptLite,
    hi: hindiTranslationSystemPromptLite,
    th: thaiTranslationSystemPromptLite,
    ru: russianTranslationSystemPromptLite,
  };

  const basePrompt = promptMap[normalizedForced] || simpleTranslationPromptLite;

  const targetInstruction =
    normalizedForced in promptMap
      ? `Target language for translation: ${targetLangName}. `
      : `Translate to ${targetLangName}. `;

  return targetInstruction + basePrompt + ACCURATE_TRANSLATION_POLICY;
}

/**
 * Processes text with Gemini API as backup when Claude is unavailable.
 * Returns ClaudeResponse shape for drop-in compatibility.
 */
export async function processWithGemini(
  text: string,
  targetLanguage: string = 'en',
  forcedLanguage: string = 'ja',
  _onProgress?: (checkpoint: number) => void,
  _subscriptionPlan?: 'PREMIUM' | 'FREE',
  outputNeedsReadings?: boolean
): Promise<GeminiTranslationResult> {
  const apiKey =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20) {
    logger.warn('[Gemini API] API key not configured or invalid, skipping fallback');
    return {
      readingsText: '',
      translatedText: '',
      errorCode: 'API_ERROR',
    };
  }

  const systemPrompt = getSystemPromptForLanguage(
    forcedLanguage,
    targetLanguage,
    outputNeedsReadings ?? false
  );
  const userMessage = `Translate this text. Output valid JSON with keys readingsText and translatedText only.\n\n"${text}"`;

  const fullPrompt = `${systemPrompt}\n\n${userMessage}`;

  try {
    logger.log('[Gemini API] Attempting backup translation...');

    const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      },
      {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const candidate = response.data?.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text;

    if (!content || typeof content !== 'string') {
      logger.error('[Gemini API] Empty or invalid response structure');
      return {
        readingsText: '',
        translatedText: '',
        errorCode: 'API_ERROR',
      };
    }

    const cleaned = cleanJsonString(content);
    const parsed = parseWordScopeResponse(cleaned);

    const readingsText = parsed?.readingsText ?? '';
    const translatedText = parsed?.translatedText ?? '';

    if (!translatedText.trim()) {
      logger.error('[Gemini API] No translatedText in parsed response');
      return {
        readingsText: '',
        translatedText: '',
        errorCode: 'API_ERROR',
      };
    }

    logger.log('[Gemini API] Backup translation succeeded');

    return {
      readingsText: readingsText || '',
      translatedText: translatedText.trim(),
    };
  } catch (error) {
    logger.error('[Gemini API] Fallback failed:', error instanceof Error ? error.message : error);
    return {
      readingsText: '',
      translatedText: '',
      errorCode: 'API_ERROR',
    };
  }
}
