import Constants from 'expo-constants';
import axios, { AxiosError } from 'axios';
import { Alert } from 'react-native';
import { 
  containsJapanese, 
  containsChinese, 
  containsKoreanText,
  containsItalianText,
  containsTagalogText,
  containsFrenchText,
  containsSpanishText,
  containsPortugueseText,
  containsGermanText,
  containsEnglishText,
  containsRussianText,
  containsArabicText,
  containsHindiText,
  containsEsperantoText,
  containsKanji
} from '../utils/textFormatting';

// Define response structure
interface ClaudeResponse {
  furiganaText: string;
  translatedText: string;
}

// Map for language code to name for prompts
const LANGUAGE_NAMES_MAP = {
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
  eo: 'Esperanto'
};

// Define Claude API response content structure
interface ClaudeContentItem {
  type: string;
  text?: string;
}

/**
 * Sleep function for delay between retries
 * @param ms Milliseconds to sleep
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Cleans common JSON formatting issues from LLM responses
 * @param jsonString The potentially malformed JSON string
 * @returns Cleaned JSON string that should parse correctly
 */
function cleanJsonString(jsonString: string): string {
  let cleaned = jsonString;
  
  // First, try to extract JSON from the text more aggressively
  // Look for the first opening brace and last closing brace
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    // Extract just the JSON part
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  console.log('🧹 Starting cleanup for:', cleaned.substring(0, 100) + '...');
  
  // EMERGENCY APPROACH: Extract values directly and rebuild JSON from scratch
  // This bypasses all JSON parsing issues by manually extracting the actual content
  
  try {
    // Find furiganaText value using simple string methods
    const furiganaStart = cleaned.indexOf('"furiganaText"');
    const translationStart = cleaned.indexOf('"translatedText"');
    
    if (furiganaStart === -1 || translationStart === -1) {
      throw new Error('Could not find required fields');
    }
    
    // Extract furiganaText value
    const furiganaColonIndex = cleaned.indexOf(':', furiganaStart);
    const furiganaQuoteStart = cleaned.indexOf('"', furiganaColonIndex) + 1;
    let furiganaQuoteEnd = furiganaQuoteStart;
    
    // Find the end quote, handling escaped quotes
    while (furiganaQuoteEnd < cleaned.length) {
      if (cleaned[furiganaQuoteEnd] === '"' && cleaned[furiganaQuoteEnd - 1] !== '\\') {
        break;
      }
      furiganaQuoteEnd++;
    }
    
    // Extract translatedText value
    const translationColonIndex = cleaned.indexOf(':', translationStart);
    const translationQuoteStart = cleaned.indexOf('"', translationColonIndex) + 1;
    let translationQuoteEnd = translationQuoteStart;
    
    // Find the end quote, handling escaped quotes
    while (translationQuoteEnd < cleaned.length) {
      if (cleaned[translationQuoteEnd] === '"' && cleaned[translationQuoteEnd - 1] !== '\\') {
        break;
      }
      translationQuoteEnd++;
    }
    
    // Extract the raw values
    let furiganaValue = cleaned.substring(furiganaQuoteStart, furiganaQuoteEnd);
    let translationValue = cleaned.substring(translationQuoteStart, translationQuoteEnd);
    
    // Clean up the extracted values - remove ALL problematic characters
    furiganaValue = furiganaValue
      .replace(/[""‚„«»]/g, '"')     // Unicode quotes → regular quotes
      .replace(/[''‛‹›]/g, "'")      // Unicode single quotes → regular quotes  
      .replace(/[–—]/g, '-')         // Unicode dashes → regular dashes
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ') // Unicode spaces → regular spaces
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '') // Remove zero-width characters
      .replace(/[\n\r\t]/g, ' ')     // Replace line breaks and tabs with spaces
      .replace(/\s+/g, ' ')          // Normalize multiple spaces
      .trim();
    
    translationValue = translationValue
      .replace(/[""‚„«»]/g, '"')     // Unicode quotes → regular quotes
      .replace(/[''‛‹›]/g, "'")      // Unicode single quotes → regular quotes
      .replace(/[–—]/g, '-')         // Unicode dashes → regular dashes
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ') // Unicode spaces → regular spaces
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '') // Remove zero-width characters
      .replace(/[\n\r\t]/g, ' ')     // Replace line breaks and tabs with spaces
      .replace(/\s+/g, ' ')          // Normalize multiple spaces
      .trim();
    
    // Build clean JSON from scratch with properly escaped values
    const cleanJson = JSON.stringify({
      furiganaText: furiganaValue,
      translatedText: translationValue
    });
    
    console.log('✅ Successfully rebuilt JSON:', cleanJson.substring(0, 150) + '...');
    return cleanJson;
    
  } catch (extractionError) {
    console.warn('❌ Direct extraction failed, trying fallback...', extractionError);
    
    // Final fallback: comprehensive Unicode replacement and basic cleanup
    cleaned = cleaned
      .replace(/[""‚„«»]/g, '\\"')   // Replace Unicode quotes with escaped quotes
      .replace(/[''‛‹›]/g, "'")      // Replace Unicode single quotes
      .replace(/[–—]/g, '-')         // Replace Unicode dashes
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ') // Replace Unicode spaces
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '') // Remove zero-width characters
      .replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\') // Fix invalid escapes
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      .replace(/,+/g, ',')           // Fix multiple commas
      .trim();
    
    console.log('🔧 Fallback cleanup result:', cleaned);
    return cleaned;
  }
}

/**
 * Determines the primary language of a text while acknowledging it may contain other languages
 * @param text The text to analyze
 * @param forcedLanguage Optional code to force a specific language detection
 * @returns The detected primary language
 */
function detectPrimaryLanguage(text: string, forcedLanguage: string = 'auto'): string {
  // If a specific language is forced, return that instead of detecting
  if (forcedLanguage !== 'auto') {
    console.log(`[detectPrimaryLanguage] Using forced language: ${forcedLanguage}`);
    switch (forcedLanguage) {
      case 'en': return "English";
      case 'zh': return "Chinese";
      case 'ja': return "Japanese";
      case 'ko': return "Korean";
      case 'ru': return "Russian";
      case 'ar': return "Arabic";
      case 'it': return "Italian";
      case 'es': return "Spanish";
      case 'fr': return "French";
      case 'tl': return "Tagalog";
      case 'pt': return "Portuguese";
      case 'de': return "German";
      case 'hi': return "Hindi";
      case 'eo': return "Esperanto";
      default: return forcedLanguage; // Return the forced language code instead of "unknown"
    }
  }

  // Count characters by language category
  let russianChars = 0;
  let japaneseChars = 0;
  let chineseChars = 0;
  let koreanChars = 0;
  let arabicChars = 0;
  let hindiChars = 0;
  
  // Check each character in the text
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Russian (Cyrillic)
    if (/[\u0400-\u04FF]/.test(char)) {
      russianChars++;
    }
    // Japanese specific (hiragana, katakana)
    else if (/[\u3040-\u30ff]/.test(char)) {
      japaneseChars++;
    }
    // CJK characters (could be either Chinese or Japanese kanji)
    else if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(char)) {
      if (!containsJapanese(text)) {
        // If no hiragana/katakana, more likely Chinese
        chineseChars++;
      } else {
        // Otherwise, count as Japanese
        japaneseChars++;
      }
    }
    // Korean
    else if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC]/.test(char)) {
      koreanChars++;
    }
    // Arabic
    else if (/[\u0600-\u06FF\u0750-\u077F]/.test(char)) {
      arabicChars++;
    }
    // Hindi (Devanagari)
    else if (/[\u0900-\u097F]/.test(char)) {
      hindiChars++;
    }
  }
  
  // Check for Italian based on patterns (simpler approach)
  if (containsItalianText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars)) {
    return "Italian";
  }
  
  // Check for Tagalog based on patterns
  if (containsTagalogText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars)) {
    return "Tagalog";
  }
  
  // Check for French based on patterns
  if (containsFrenchText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars)) {
    return "French";
  }
  
  // Check for Spanish based on patterns
  if (containsSpanishText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars)) {
    return "Spanish";
  }
  
  // Check for Portuguese based on patterns
  if (containsPortugueseText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars)) {
    return "Portuguese";
  }
  
  // Check for German based on patterns
  if (containsGermanText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars)) {
    return "German";
  }
  
  // Check for Esperanto based on patterns
  if (containsEsperantoText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars)) {
    return "Esperanto";
  }
  
  // Return language with highest character count
  const counts = [
    { lang: "Russian", count: russianChars },
    { lang: "Japanese", count: japaneseChars },
    { lang: "Chinese", count: chineseChars },
    { lang: "Korean", count: koreanChars },
    { lang: "Arabic", count: arabicChars },
    { lang: "Hindi", count: hindiChars }
  ];
  
  counts.sort((a, b) => b.count - a.count);
  
  // If the highest count is 0, check if this might be English or another Latin-based language
  if (counts[0].count === 0) {
    // Check if the text is primarily Latin characters (English and many European languages)
    const latinChars = text.replace(/\s+/g, '').split('').filter(char => /[a-zA-Z]/.test(char)).length;
    const totalNonSpaceChars = text.replace(/\s+/g, '').length;
    const latinRatio = totalNonSpaceChars > 0 ? latinChars / totalNonSpaceChars : 0;
    
    console.log(`[detectPrimaryLanguage] No special chars found. Latin chars: ${latinChars}, Total: ${totalNonSpaceChars}, Ratio: ${latinRatio}`);
    
    if (latinChars > 0 && latinRatio >= 0.5) {
      console.log(`[detectPrimaryLanguage] Defaulting to English for Latin-based text: "${text.substring(0, 50)}..."`);
      return "English"; // Default to English for Latin-based text
    }
    console.log(`[detectPrimaryLanguage] Returning unknown for text: "${text.substring(0, 50)}..."`);
    return "unknown";
  }
  
  console.log(`[detectPrimaryLanguage] Highest count language: ${counts[0].lang} (${counts[0].count} chars)`);
  return counts[0].lang;
}

/**
 * Validates if the text contains the specified forced language
 * @param text The text to validate
 * @param forcedLanguage The language code to validate against
 * @returns True if the text matches the forced language or if forcedLanguage is 'auto', false otherwise
 */
export function validateTextMatchesLanguage(text: string, forcedLanguage: string = 'auto'): boolean {
  // If auto-detect is enabled, always return true (no validation needed)
  if (forcedLanguage === 'auto') {
    console.log('[validateTextMatchesLanguage] Auto-detect enabled, returning true');
    return true;
  }

  // If text is too short, don't validate (prevent false rejections for very short inputs)
  if (text.trim().length < 2) {
    console.log('[validateTextMatchesLanguage] Text too short, returning true');
    return true;
  }

  // Detect the actual language in the text
  const detectedLang = detectPrimaryLanguage(text, 'auto'); // Force auto-detection for validation
  
  // Map the forced language code to the language name format used in detection
  let expectedLanguage: string;
  switch (forcedLanguage) {
    case 'en': expectedLanguage = 'English'; break;
    case 'zh': expectedLanguage = 'Chinese'; break;
    case 'ja': expectedLanguage = 'Japanese'; break;
    case 'ko': expectedLanguage = 'Korean'; break;
    case 'ru': expectedLanguage = 'Russian'; break;
    case 'ar': expectedLanguage = 'Arabic'; break;
    case 'it': expectedLanguage = 'Italian'; break;
    case 'es': expectedLanguage = 'Spanish'; break;
    case 'fr': expectedLanguage = 'French'; break;
    case 'tl': expectedLanguage = 'Tagalog'; break;
    case 'pt': expectedLanguage = 'Portuguese'; break;
    case 'de': expectedLanguage = 'German'; break;
    case 'hi': expectedLanguage = 'Hindi'; break;
    case 'eo': expectedLanguage = 'Esperanto'; break;
    default: expectedLanguage = forcedLanguage;
  }
  
  console.log(`[validateTextMatchesLanguage] Validating language: Expected ${expectedLanguage}, Detected ${detectedLang}`);
  console.log(`[validateTextMatchesLanguage] Text sample: "${text.substring(0, 50)}..."`);
  
  // Special handling for similar languages or scripts that might be confused
  
  // Case 1: CJK languages (Chinese, Japanese, Korean) 
  // These can sometimes be confused due to shared characters
  const cjkLanguages = ['Chinese', 'Japanese', 'Korean'];
  if (cjkLanguages.includes(expectedLanguage) && cjkLanguages.includes(detectedLang)) {
    console.log('[validateTextMatchesLanguage] Handling CJK language validation');
    console.log(`[validateTextMatchesLanguage] Expected: ${expectedLanguage}, Detected: ${detectedLang}`);
    
    // For Japanese forced mode, require some Japanese-specific characters or CJK characters
    if (expectedLanguage === 'Japanese') {
      const hasJapaneseSpecific = /[\u3040-\u30ff]/.test(text); // hiragana/katakana
      const hasCJKChars = /[\u4e00-\u9fff]/.test(text); // kanji/CJK
      console.log(`[validateTextMatchesLanguage] Japanese force mode: hasJapaneseSpecific=${hasJapaneseSpecific}, hasCJKChars=${hasCJKChars}`);
      
      if (!hasJapaneseSpecific && !hasCJKChars) {
        console.log('[validateTextMatchesLanguage] Japanese forced but no Japanese characters or CJK characters found');
        return false;
      }
      // In force mode, allow mixed content - let Claude API handle extraction and translation
      console.log('[validateTextMatchesLanguage] Japanese force mode validation passed - allowing mixed content');
      return true;
    }
    
    // Add additional debugging for Japanese validation
    if (expectedLanguage === 'Japanese') {
      console.log(`[validateTextMatchesLanguage] Japanese validation: containsJapanese=${containsJapanese(text)}`);
      console.log(`[validateTextMatchesLanguage] Japanese validation: containsChinese=${containsChinese(text)}`);
      console.log(`[validateTextMatchesLanguage] Text sample: "${text.substring(0, 50)}..."`);
    }
    // For Korean forced mode, require Hangul presence
    if (expectedLanguage === 'Korean') {
      const hasKorean = containsKoreanText(text);
      console.log(`[validateTextMatchesLanguage] Korean force mode: hasKorean=${hasKorean}`);
      
      if (!hasKorean) {
        console.log('[validateTextMatchesLanguage] Korean forced but no Korean characters found');
        return false;
      }
      // In force mode, allow mixed content - let Claude API handle extraction and translation
      console.log('[validateTextMatchesLanguage] Korean force mode validation passed - allowing mixed content');
      return true;
    }
    // For Chinese forced mode, only require that some Chinese characters are present
    // Allow mixed content (Chinese + English, Chinese + Japanese, etc.) since Claude can handle it
    if (expectedLanguage === 'Chinese') {
      // Check if text contains any CJK characters that could be Chinese
      const hasCJKChars = /[\u4e00-\u9fff]/.test(text);
      console.log(`[validateTextMatchesLanguage] Chinese force mode: hasCJKChars=${hasCJKChars}`);
      console.log(`[validateTextMatchesLanguage] Text sample for Chinese validation: "${text.substring(0, 50)}..."`);
      
      if (!hasCJKChars) {
        console.log('[validateTextMatchesLanguage] Chinese forced but no CJK characters found - cannot process as Chinese');
        return false;
      }
      // In force mode, allow mixed content - let Claude API handle extraction and translation
      console.log('[validateTextMatchesLanguage] Chinese force mode validation passed - found CJK characters, allowing mixed content');
      return true;
    }
  }
  
  // Case 2: Latin-based languages (English, Italian, Spanish, etc.)
  // In force mode, be permissive and let Claude API handle the processing
  const latinLanguages = ['English', 'Italian', 'Spanish', 'French', 'Portuguese', 'German', 'Tagalog', 'Esperanto'];
  if (latinLanguages.includes(expectedLanguage)) {
    console.log('[validateTextMatchesLanguage] Handling Latin language force mode validation');
    console.log(`[validateTextMatchesLanguage] Expected: ${expectedLanguage}, Detected: ${detectedLang}`);
    
    // Check if text contains basic Latin characters (most European languages use these)
    const hasLatinChars = /[a-zA-ZÀ-ÿĀ-žñÑ]/.test(text);
    console.log(`[validateTextMatchesLanguage] Latin force mode: hasLatinChars=${hasLatinChars}`);
    
    if (!hasLatinChars) {
      console.log('[validateTextMatchesLanguage] Latin language forced but no Latin characters found');
      return false;
    }
    
    // In force mode, check for specific language patterns when available, but be permissive
    let hasSpecificPatterns = false;
    
    if (expectedLanguage === 'Italian' && containsItalianText(text)) {
      console.log('[validateTextMatchesLanguage] Italian patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'French' && containsFrenchText(text)) {
      console.log('[validateTextMatchesLanguage] French patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'Spanish' && containsSpanishText(text)) {
      console.log('[validateTextMatchesLanguage] Spanish patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'Portuguese' && containsPortugueseText(text)) {
      console.log('[validateTextMatchesLanguage] Portuguese patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'German' && containsGermanText(text)) {
      console.log('[validateTextMatchesLanguage] German patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'Tagalog' && containsTagalogText(text)) {
      console.log('[validateTextMatchesLanguage] Tagalog patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'English' && containsEnglishText(text)) {
      console.log('[validateTextMatchesLanguage] English patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'Esperanto' && containsEsperantoText(text)) {
      console.log('[validateTextMatchesLanguage] Esperanto patterns found');
      hasSpecificPatterns = true;
    }
    
    // In force mode, allow even if specific patterns aren't found - let Claude API handle it
    if (hasSpecificPatterns) {
      console.log('[validateTextMatchesLanguage] Force mode: specific language patterns found, allowing');
    } else {
      console.log('[validateTextMatchesLanguage] Force mode: no specific patterns found, but allowing mixed/unclear content');
    }
    
    return true; // Always allow in force mode if Latin characters are present
  }
  
  // Case 3: Other languages (Russian, Arabic, etc.) - handle force mode permissively
  if (expectedLanguage === 'Russian') {
    const hasRussian = containsRussianText(text);
    console.log(`[validateTextMatchesLanguage] Russian force mode: hasRussian=${hasRussian}`);
    
    if (!hasRussian) {
      console.log('[validateTextMatchesLanguage] Russian forced but no Cyrillic characters found');
      return false;
    }
    console.log('[validateTextMatchesLanguage] Russian force mode validation passed');
    return true;
  }
  
  if (expectedLanguage === 'Arabic') {
    const hasArabic = containsArabicText(text);
    console.log(`[validateTextMatchesLanguage] Arabic force mode: hasArabic=${hasArabic}`);
    
    if (!hasArabic) {
      console.log('[validateTextMatchesLanguage] Arabic forced but no Arabic characters found');
      return false;
    }
    console.log('[validateTextMatchesLanguage] Arabic force mode validation passed');
    return true;
  }
  
  if (expectedLanguage === 'Hindi') {
    const hasHindi = containsHindiText(text);
    console.log(`[validateTextMatchesLanguage] Hindi force mode: hasHindi=${hasHindi}`);
    
    if (!hasHindi) {
      console.log('[validateTextMatchesLanguage] Hindi forced but no Devanagari characters found');
      return false;
    }
    console.log('[validateTextMatchesLanguage] Hindi force mode validation passed');
    return true;
  }
  
  // Standard comparison for any remaining languages (fallback)
  const result = detectedLang === expectedLanguage;
  console.log(`[validateTextMatchesLanguage] Standard comparison: ${detectedLang} === ${expectedLanguage} = ${result}`);
  return result;
}

/**
 * Processes text with Claude AI API to add furigana/romanization and provide translation
 * @param text The text to be processed
 * @param targetLanguage The language to translate into (default: 'en' for English)
 * @param forcedLanguage Optional code to force a specific source language detection
 * @returns Object containing text with furigana/romanization and translation
 */
export async function processWithClaude(
  text: string, 
  targetLanguage: string = 'en',
  forcedLanguage: string = 'auto'
): Promise<ClaudeResponse> {
  // Validate Claude API key
  const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY;
  const apiKeyLength = apiKey ? String(apiKey).length : 0;
  
  console.log(`[Claude API] Key loaded. Length: ${apiKeyLength}.`);

  if (!apiKey || typeof apiKey !== 'string' || apiKeyLength < 20) {
    const errorMessage = `Claude API key is not configured or is invalid. Length: ${apiKeyLength}. Please ensure EXPO_PUBLIC_CLAUDE_API_KEY is set correctly in your environment variables.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Validate that the detected language matches the forced language if specified
  if (forcedLanguage && forcedLanguage !== 'auto') {
    const validationResult = validateTextMatchesLanguage(text, forcedLanguage);
    console.log(`[DEBUG] Language validation for forced ${forcedLanguage}: ${validationResult}`);
    
    if (!validationResult) {
      const autoDetectedLang = detectPrimaryLanguage(text, 'auto');
      console.error(`Claude API: Detected language ${autoDetectedLang} does not match forced language ${forcedLanguage}`);
      console.error(`Text sample: "${text.substring(0, 100)}..."`);
      throw new Error(`Claude API: Detected language ${autoDetectedLang} does not match forced language ${forcedLanguage}`);
    }
  }

  // Maximum number of retry attempts
  const MAX_RETRIES = 3;
  // Initial backoff delay in milliseconds
  const INITIAL_BACKOFF_DELAY = 1000;
  
  let retryCount = 0;
  let lastError: unknown = null;

  // Get target language name or default to English if not found
  const targetLangName = LANGUAGE_NAMES_MAP[targetLanguage as keyof typeof LANGUAGE_NAMES_MAP] || LANGUAGE_NAMES_MAP.en;

  // Detect primary language, respecting any forced language setting
  const primaryLanguage = detectPrimaryLanguage(text, forcedLanguage);
  console.log(`Translating to: ${targetLangName}`);
  if (forcedLanguage !== 'auto') {
    console.log(`Using forced language detection: ${forcedLanguage} (${primaryLanguage})`);
  }
  
  // Add explicit debugging for Japanese forced detection
  if (forcedLanguage === 'ja') {
    console.log(`[DEBUG] Japanese forced detection active. Using Japanese prompt.`);
  }

  while (retryCount < MAX_RETRIES) {
    try {
      // Try to get Claude API key from Constants first (for EAS builds), then fallback to process.env (for local dev)
      const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY || 
                    process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
      
      if (!apiKey) {
        console.error('Claude API key not found. Checked:');
        console.error('- process.env.EXPO_PUBLIC_CLAUDE_API_KEY:', !!process.env.EXPO_PUBLIC_CLAUDE_API_KEY);
        console.error('- Constants.expoConfig.extra:', Constants.expoConfig?.extra);
        console.error('- Constants.manifest:', Constants.manifest);
        throw new Error('Claude API key is not configured. Please add EXPO_PUBLIC_CLAUDE_API_KEY to your environment variables.');
      }

      // Define the user message with our prompt based on language detection
      let userMessage = '';
      
      // Create a standard top section for all prompts that clearly states the target language
      const promptTopSection = `
IMPORTANT INSTRUCTION: YOU MUST TRANSLATE THIS TEXT TO ${targetLangName.toUpperCase()}.

DO NOT TRANSLATE TO ENGLISH. The final translation MUST be in ${targetLangName} language only.
If the target language is Japanese, the translation must use Japanese characters (hiragana, katakana, kanji).
If the target language is Chinese, the translation must use Chinese characters.
If the target language is Korean, the translation must use Korean Hangul.
If the target language is Russian, the translation must use Cyrillic characters.
If the target language is Arabic, the translation must use Arabic script.

`;
      
      // FAILSAFE: If Japanese is forced, always use Japanese prompt regardless of detected language
      if (forcedLanguage === 'ja') {
        console.log(`[DEBUG] FORCED JAPANESE: Using Japanese prompt (furigana) regardless of primaryLanguage: ${primaryLanguage}`);
        // Japanese prompt - Enhanced for contextual compound word readings
        userMessage = `
${promptTopSection}
You are a Japanese language expert. I need you to analyze this text and add furigana to ALL words containing kanji: "${text}"

CRITICAL REQUIREMENTS FOR JAPANESE TEXT - THESE ARE MANDATORY:
1. Keep all original text exactly as is (including any English words, numbers, or punctuation)
2. For EVERY word containing kanji, you MUST add the complete hiragana reading in parentheses immediately after the word
3. The reading should cover the entire word (including any hiragana/katakana parts attached to the kanji)
4. You MUST NOT skip any kanji - every single kanji character must have furigana
5. Non-kanji words (pure hiragana/katakana), English words, and numbers should remain unchanged
6. Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

CRITICAL WORD-LEVEL READING PRIORITY:
- FIRST analyze the text for compound words, counter words, and context-dependent readings
- Compound words should be read as single units with their contextual pronunciation
- Counter words undergo sound changes (rendaku) and must be read as complete units
- Only split into individual kanji readings when words cannot be read as compounds

VALIDATION REQUIREMENT:
Before providing your response, verify that EVERY kanji character in the original text has corresponding furigana in your output. If you cannot determine the reading for any kanji, use the most common reading and mark it with [?].

Examples of MANDATORY correct Japanese furigana formatting:

COMPOUND WORDS (READ AS SINGLE UNITS):
- "東京" → "東京(とうきょう)" [REQUIRED - compound place name]
- "日本語" → "日本語(にほんご)" [REQUIRED - compound word]  
- "勉強する" → "勉強する(べんきょうする)" [REQUIRED - covers entire word]
- "一匹" → "一匹(いっぴき)" [REQUIRED - counter word with rendaku]
- "一人" → "一人(ひとり)" [REQUIRED - special counter reading]
- "三匹" → "三匹(さんびき)" [REQUIRED - counter with rendaku]
- "百匹" → "百匹(ひゃっぴき)" [REQUIRED - counter with rendaku]
- "大学生" → "大学生(だいがくせい)" [REQUIRED - compound word]
- "図書館" → "図書館(としょかん)" [REQUIRED - compound word]

INDIVIDUAL KANJI (ONLY when not part of compound):
- "食べ物" → "食(た)べ物(もの)" [Individual readings when compound reading doesn't exist]
- "読み書き" → "読(よ)み書(か)き" [Individual readings in coordinate compounds]

ERROR HANDLING:
If you encounter a kanji whose reading you're uncertain about, use the most common reading and add [?] after the furigana like this: "難(むずか)[?]しい"

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Japanese text with furigana after EVERY kanji word as shown in examples - THIS IS MANDATORY",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}

FINAL CHECK: Before responding, count the kanji in the original text and ensure your furiganaText has the same number of kanji with furigana readings.
`;
      } else if (primaryLanguage === "Chinese" || forcedLanguage === 'zh') {
        console.log(`[DEBUG] Using Chinese prompt (pinyin) for primaryLanguage: ${primaryLanguage}, forcedLanguage: ${forcedLanguage}`);
        // Chinese-specific prompt with pinyin
        userMessage = `
${promptTopSection}
You are a Chinese language expert. I need you to analyze and translate this text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR CHINESE TEXT:
- Keep all original text as is (including any English words, numbers, punctuation, or other language characters)
- For CHINESE CHARACTERS ONLY, add the Hanyu Pinyin romanization in parentheses immediately after each Chinese word
- Do NOT add pinyin to English words, numbers, Japanese characters, or other non-Chinese content
- The pinyin should include tone marks (e.g., "你好" should become "你好(nǐ hǎo)")
- Do NOT use Japanese furigana/hiragana style - only use pinyin with Latin characters and tone marks
- If the text contains mixed languages, focus on the Chinese parts and leave other languages as-is
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Example of correct Chinese pinyin formatting for mixed content:
- "Hello 中国" should become "Hello 中国(zhōngguó)"
- "我爱你 and I love you" should become "我爱你(wǒ ài nǐ) and I love you"
- Mixed Chinese-Japanese: "中国語を勉強している" should become "中国語(zhōngguóyǔ)を勉強している"

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Text with pinyin added only to Chinese characters/words, other content unchanged",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Korean") {
        // Korean-specific prompt with Revised Romanization
        userMessage = `
${promptTopSection}
You are a Korean language expert. I need you to analyze and translate this Korean text: "${text}"

CRITICAL FORMATTING REQUIREMENTS FOR KOREAN TEXT:
- Keep all original Korean text exactly as is (including any English words, numbers, or punctuation)
- For EVERY Korean word/phrase, add the Revised Romanization in parentheses immediately after the Korean text
- Do NOT add romanization to English words or numbers - leave them unchanged
- Follow the official Revised Romanization system rules
- The format should be: 한국어(han-gug-eo) NOT "han-gug-eo (Korean)" or any other format
- Do NOT mix English translations in the romanization - only provide pronunciation guide
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Examples of CORRECT Korean romanization formatting:
- "안녕하세요" should become "안녕하세요(an-nyeong-ha-se-yo)"
- "저는 학생입니다" should become "저는(jeo-neun) 학생입니다(hag-saeng-im-ni-da)"
- "오늘 날씨가 좋아요" should become "오늘(o-neul) 날씨가(nal-ssi-ga) 좋아요(jo-a-yo)"
- Mixed content: "Hello 한국어" should become "Hello 한국어(han-gug-eo)"

WRONG examples (do NOT use these formats):
- "jeo-neun (I)" ❌
- "han-gug-eo (Korean)" ❌
- "gong-bu-ha-go (study)" ❌

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Korean text with romanization in parentheses immediately after each Korean word - following the examples above",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Russian") {
        // Russian-specific prompt with Practical Romanization
        userMessage = `
${promptTopSection}
You are a Russian language expert. I need you to analyze and translate this Russian text: "${text}"

CRITICAL FORMATTING REQUIREMENTS FOR RUSSIAN TEXT:
- Keep all original Russian text exactly as is (including any English words, numbers, or punctuation)
- For EVERY Russian word, add the Practical Romanization in parentheses immediately after the Cyrillic text
- Do NOT add romanization to English words or numbers - leave them unchanged
- Follow practical, easy-to-read romanization standards
- The format should be: Русский(russkiy) NOT "russkiy (Russian)" or any other format
- Do NOT mix English translations in the romanization - only provide pronunciation guide
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Examples of CORRECT Russian romanization formatting:
- "Привет" should become "Привет(privet)"
- "Я изучаю русский язык" should become "Я(ya) изучаю(izuchayu) русский(russkiy) язык(yazyk)"
- "Сегодня хорошая погода" should become "Сегодня(segodnya) хорошая(khoroshaya) погода(pogoda)"
- Mixed content: "Hello Россия" should become "Hello Россия(rossiya)"

WRONG examples (do NOT use these formats):
- "ya (I)" ❌
- "russkiy (Russian)" ❌
- "izuchayu (study)" ❌

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Russian text with romanization in parentheses immediately after each Russian word - following the examples above",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Arabic") {
        // Arabic-specific prompt with Arabic Chat Alphabet
        userMessage = `
${promptTopSection}
You are an Arabic language expert. I need you to analyze and translate this Arabic text: "${text}"

CRITICAL FORMATTING REQUIREMENTS FOR ARABIC TEXT:
- Keep all original Arabic text exactly as is (including any English words, numbers, or punctuation)
- For EVERY Arabic word, add the Arabic Chat Alphabet (Franco-Arabic) transliteration in parentheses immediately after the Arabic text
- Do NOT add transliteration to English words or numbers - leave them unchanged
- Follow common Arabic Chat Alphabet conventions used in online messaging
- The format should be: العربية(al-arabiya) NOT "al-arabiya (Arabic)" or any other format
- Do NOT mix English translations in the transliteration - only provide pronunciation guide
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Examples of CORRECT Arabic transliteration formatting:
- "مرحبا" should become "مرحبا(marhaba)"
- "أنا أتعلم العربية" should become "أنا(ana) أتعلم(ata3allam) العربية(al-arabiya)"
- "اليوم الطقس جميل" should become "اليوم(al-yawm) الطقس(al-taqs) جميل(jameel)"
- Mixed content: "Hello عربي" should become "Hello عربي(arabi)"

IMPORTANT: Use CONSISTENT romanization throughout - prefer standard romanization over Franco-Arabic numbers (use "taqs" not "6aqs", "arabiya" not "3arabiya") for better learning.

WRONG examples (do NOT use these formats):
- "ana (I)" ❌
- "al-arabiya (Arabic)" ❌
- "ata3allam (learn)" ❌

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Arabic text with transliteration in parentheses immediately after each Arabic word - following the examples above",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Hindi") {
        // Hindi-specific prompt with standard romanization
        userMessage = `
${promptTopSection}
You are a Hindi language expert. I need you to analyze and translate this Hindi text: "${text}"

CRITICAL FORMATTING REQUIREMENTS FOR HINDI TEXT:
- Keep all original Hindi Devanagari text exactly as is (including any English words, numbers, or punctuation)
- For EVERY Hindi word, add the standard romanization in parentheses immediately after the Devanagari text
- Do NOT add romanization to English words or numbers - leave them unchanged
- Follow IAST (International Alphabet of Sanskrit Transliteration) or simplified standard romanization
- The format should be: हिन्दी(hindī) NOT "hindī (Hindi)" or any other format
- Do NOT mix English translations in the romanization - only provide pronunciation guide
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Examples of CORRECT Hindi romanization formatting:
- "नमस्ते" should become "नमस्ते(namaste)"
- "मैं हिन्दी सीख रहा हूँ" should become "मैं(main) हिन्दी(hindī) सीख(sīkh) रहा(rahā) हूँ(hūn)"
- "आज अच्छा मौसम है" should become "आज(āj) अच्छा(acchā) मौसम(mausam) है(hai)"
- "यह बहुत सुन्दर है" should become "यह(yah) बहुत(bahut) सुन्दर(sundar) है(hai)"
- Mixed content: "Hello भारत" should become "Hello भारत(bhārat)"

ROMANIZATION GUIDELINES:
- Use long vowel marks (ā, ī, ū) for accurate pronunciation
- Use 'ch' for च, 'chh' for छ
- Use 'sh' for श, 'shh' for ष
- Use standard conventions for aspirated consonants (kh, gh, ch, jh, th, dh, ph, bh)

WRONG examples (do NOT use these formats):
- "main (I)" ❌
- "hindī (Hindi)" ❌
- "sīkh (learn)" ❌

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Hindi text with romanization in parentheses immediately after each Hindi word - following the examples above",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Esperanto") {
        // Esperanto-specific prompt
        userMessage = `
${promptTopSection}
You are an Esperanto language expert. I need you to translate this Esperanto text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR ESPERANTO TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for Esperanto text (it already uses Latin script)
- Recognize all Esperanto special characters: ĉ, ĝ, ĥ, ĵ, ŝ, ŭ (and their capitals)
- Handle Esperanto grammar rules: accusative -n ending, plural -j ending, adjective agreement
- Understand Esperanto word formation with affixes (mal-, -in-, -et-, -eg-, -ej-, -ist-, etc.)
- Recognize common Esperanto expressions and proper usage
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Italian") {
        // Italian-specific prompt
        userMessage = `
${promptTopSection}
You are an Italian language expert. I need you to translate this Italian text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR ITALIAN TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for Italian text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Spanish") {
        // Spanish-specific prompt
        userMessage = `
${promptTopSection}
You are a Spanish language expert. I need you to translate this Spanish text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR SPANISH TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for Spanish text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "French") {
        // French-specific prompt
        userMessage = `
${promptTopSection}
You are a French language expert. I need you to translate this French text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR FRENCH TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for French text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Portuguese") {
        // Portuguese-specific prompt
        userMessage = `
${promptTopSection}
You are a Portuguese language expert. I need you to translate this Portuguese text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR PORTUGUESE TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for Portuguese text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "German") {
        // German-specific prompt
        userMessage = `
${promptTopSection}
You are a German language expert. I need you to translate this German text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR GERMAN TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for German text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Tagalog") {
        // Tagalog-specific prompt
        userMessage = `
${promptTopSection}
You are a Tagalog language expert. I need you to translate this Tagalog text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR TAGALOG TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for Tagalog text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "English") {
        // English-specific prompt
        userMessage = `
${promptTopSection}
You are an English language expert. I need you to translate this English text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR ENGLISH TEXT:
- Keep all original text as is (including any non-English words, numbers, or punctuation)
- No romanization is needed for English text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Japanese" && forcedLanguage !== 'ja') {
        console.log(`[DEBUG] Using Japanese prompt (furigana) for primaryLanguage: ${primaryLanguage}`);
        // Japanese prompt - Enhanced for contextual compound word readings (only when not using forced detection)
        userMessage = `
${promptTopSection}
You are a Japanese language expert. I need you to analyze this text and add furigana to ALL words containing kanji: "${text}"

CRITICAL REQUIREMENTS FOR JAPANESE TEXT - THESE ARE MANDATORY:
1. Keep all original text exactly as is (including any English words, numbers, or punctuation)
2. For EVERY word containing kanji, you MUST add the complete hiragana reading in parentheses immediately after the word
3. The reading should cover the entire word (including any hiragana/katakana parts attached to the kanji)
4. You MUST NOT skip any kanji - every single kanji character must have furigana
5. Non-kanji words (pure hiragana/katakana), English words, and numbers should remain unchanged
6. Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

CRITICAL WORD-LEVEL READING PRIORITY:
- FIRST analyze the text for compound words, counter words, and context-dependent readings
- Compound words should be read as single units with their contextual pronunciation
- Counter words undergo sound changes (rendaku) and must be read as complete units
- Only split into individual kanji readings when words cannot be read as compounds

VALIDATION REQUIREMENT:
Before providing your response, verify that EVERY kanji character in the original text has corresponding furigana in your output. If you cannot determine the reading for any kanji, use the most common reading and mark it with [?].

Examples of MANDATORY correct Japanese furigana formatting:

COMPOUND WORDS (READ AS SINGLE UNITS):
- "東京" → "東京(とうきょう)" [REQUIRED - compound place name]
- "日本語" → "日本語(にほんご)" [REQUIRED - compound word]  
- "勉強する" → "勉強する(べんきょうする)" [REQUIRED - covers entire word]
- "一匹" → "一匹(いっぴき)" [REQUIRED - counter word with rendaku]
- "一人" → "一人(ひとり)" [REQUIRED - special counter reading]
- "三匹" → "三匹(さんびき)" [REQUIRED - counter with rendaku]
- "百匹" → "百匹(ひゃっぴき)" [REQUIRED - counter with rendaku]
- "大学生" → "大学生(だいがくせい)" [REQUIRED - compound word]
- "図書館" → "図書館(としょかん)" [REQUIRED - compound word]

INDIVIDUAL KANJI (ONLY when not part of compound):
- "食べ物" → "食(た)べ物(もの)" [Individual readings when compound reading doesn't exist]
- "読み書き" → "読(よ)み書(か)き" [Individual readings in coordinate compounds]

COMPLEX EXAMPLES:
- "今日は良い天気ですね" → "今日(きょう)は良(よ)い天気(てんき)ですね"
- "新しい本を読みました" → "新(あたら)しい本(ほん)を読(よ)みました"
- "駅まで歩いて行きます" → "駅(えき)まで歩(ある)いて行(い)きます"
- "猫が三匹います" → "猫(ねこ)が三匹(さんびき)います"

SPECIAL ATTENTION TO COUNTERS:
- Numbers + counters (匹、人、本、個、枚、etc.) should be read as units with proper rendaku
- 一匹 = いっぴき (NOT いちひき)
- 三匹 = さんびき (NOT さんひき)  
- 六匹 = ろっぴき (NOT ろくひき)
- 八匹 = はっぴき (NOT はちひき)
- 十匹 = じゅっぴき (NOT じゅうひき)

COMMON COMPOUND WORDS TO READ AS UNITS:
- 一人 = ひとり, 二人 = ふたり (NOT いちにん、にしん)
- 一つ = ひとつ, 二つ = ふたつ (NOT いちつ、につ)
- 今日 = きょう (NOT いまひ)
- 明日 = あした/あす (NOT みょうにち)
- 昨日 = きのう (NOT さくじつ)
- 大人 = おとな (NOT だいじん)
- 子供 = こども (NOT しきょう)
- 時間 = じかん (compound)
- 学校 = がっこう (compound)
- 電話 = でんわ (compound)

ERROR HANDLING:
If you encounter a kanji whose reading you're uncertain about, use the most common reading and add [?] after the furigana like this: "難(むずか)[?]しい"

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Japanese text with furigana after EVERY kanji word as shown in examples - THIS IS MANDATORY",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}

FINAL CHECK: Before responding, count the kanji in the original text and ensure your furiganaText has the same number of kanji with furigana readings.
`;
      } else {
        console.log(`[DEBUG] Using default prompt for primaryLanguage: ${primaryLanguage}`);
        // Default prompt for other languages
        userMessage = `
${promptTopSection}
I need you to translate this text: "${text}"

IMPORTANT:
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      }

      console.log(`Processing text (${text.substring(0, 40)}${text.length > 40 ? '...' : ''})`);
      console.log('Claude API Key found:', !!apiKey, 'Length:', apiKey?.length);
      
      // Process the prompt to ensure all string interpolation is handled
      const processedPrompt = userMessage
        .replace(/\${targetLangName}/g, targetLangName)
        .replace(/\${promptTopSection}/g, promptTopSection);
      
      // Make API request to Claude using latest API format
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: "claude-3-haiku-20240307",
          max_tokens: 1000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: processedPrompt
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key': apiKey
          }
        }
      );

      console.log("Claude API response received");
      
      // Extract and parse the content from Claude's response
      if (response.data && response.data.content && Array.isArray(response.data.content)) {
        // Get the first content item where type is "text"
        const textContent = response.data.content.find((item: ClaudeContentItem) => item.type === "text");
        
        if (textContent && textContent.text) {
          try {
            // Look for JSON in the response text
            const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
            let jsonString = jsonMatch ? jsonMatch[0] : textContent.text;
            
            // Comprehensive JSON cleaning for common LLM output issues
            jsonString = cleanJsonString(jsonString);
            
            // Add more detailed logging for debugging
            console.log("Raw response text:", textContent.text);
            console.log("Extracted JSON string:", jsonString);
            console.log("First 100 chars of JSON:", jsonString.substring(0, 100));
            
            let parsedContent;
            
            try {
              parsedContent = JSON.parse(jsonString);
            } catch (parseError) {
              console.log('🚨 Initial JSON parse failed, trying emergency fallback...');
              
              // Emergency fallback: manually extract values using regex
              try {
                const furiganaMatch = jsonString.match(/"furiganaText"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
                const translationMatch = jsonString.match(/"translatedText"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
                
                if (furiganaMatch && translationMatch) {
                  // Clean up extracted values
                  const furiganaValue = furiganaMatch[1]
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\')
                    .replace(/[""‚„]/g, '"')
                    .replace(/[''‛‹›]/g, "'");
                    
                  const translationValue = translationMatch[1]
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\')
                    .replace(/[""‚„]/g, '"')
                    .replace(/[''‛‹›]/g, "'");
                  
                  parsedContent = {
                    furiganaText: furiganaValue,
                    translatedText: translationValue
                  };
                  
                  console.log('✅ Emergency fallback parsing successful');
                } else {
                  throw new Error('Could not extract values with regex fallback');
                }
              } catch (fallbackError) {
                console.error('❌ Emergency fallback also failed:', fallbackError);
                throw parseError; // Re-throw original error
              }
            }
            
            // Check if the translation appears to be in the target language or if it's likely still in English
            const translatedText = parsedContent.translatedText || "";
            const translatedPreview = translatedText.substring(0, 60) + (translatedText.length > 60 ? "..." : "");
            console.log(`Translation complete: "${translatedPreview}"`);
            
            // For Japanese text, validate furigana coverage
            let furiganaText = parsedContent.furiganaText || "";
            if ((primaryLanguage === "Japanese" || forcedLanguage === 'ja') && furiganaText) {
              const validation = validateJapaneseFurigana(text, furiganaText);
              console.log(`Furigana validation: ${validation.details}`);
              
              if (!validation.isValid) {
                console.warn(`Incomplete furigana coverage: ${validation.details}`);
                
                // If this is the first attempt and we have significant missing furigana, retry with more aggressive prompt
                if (retryCount === 0 && validation.missingKanjiCount > 0) {
                  console.log("Retrying with more aggressive furigana prompt...");
                  retryCount++;
                  
                  // Create a more aggressive prompt for retry
                  const aggressivePrompt = `
${promptTopSection}
CRITICAL FURIGANA RETRY - PREVIOUS ATTEMPT FAILED

You are a Japanese language expert. The previous attempt failed to add furigana to ALL kanji. You MUST fix this.

Original text: "${text}"
Previous result had ${validation.missingKanjiCount} missing furigana out of ${validation.totalKanjiCount} total kanji.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. EVERY SINGLE KANJI CHARACTER must have furigana in parentheses
2. Count the kanji in the original text: ${validation.totalKanjiCount} kanji total
3. Your response must have exactly ${validation.totalKanjiCount} kanji with furigana
4. If you're unsure of a reading, use the most common one and add [?]
5. DO NOT SKIP ANY KANJI - this is mandatory

CRITICAL: PRIORITIZE COMPOUND WORD CONTEXTUAL READINGS:
- Look for compound words, counter words, and context-dependent readings FIRST
- Numbers + counters (匹、人、本、個、etc.) should be read as units with rendaku
- 一匹 = いっぴき (NOT いちひき), 三匹 = さんびき (NOT さんひき)
- Only split into individual kanji when no compound reading exists

MANDATORY FORMAT for each kanji word:
- Counter words: 一匹(いっぴき), 三匹(さんびき), 一人(ひとり)
- Compound words: 東京(とうきょう), 日本語(にほんご), 大学生(だいがくせい)
- Mixed words: 勉強する(べんきょうする)
- Individual kanji (only when not compound): 食(た)べ物(もの)

VERIFICATION STEP: Before responding, manually count:
- Original kanji count: ${validation.totalKanjiCount}
- Your furigana count: [must equal ${validation.totalKanjiCount}]

Format as JSON:
{
  "furiganaText": "Text with furigana for ALL ${validation.totalKanjiCount} kanji - MANDATORY",
  "translatedText": "Translation in ${targetLangName}"
}`;

                  // Make retry request
                  const retryResponse = await axios.post(
                    'https://api.anthropic.com/v1/messages',
                    {
                      model: "claude-3-haiku-20240307",
                      max_tokens: 1000,
                      temperature: 0,
                      messages: [
                        {
                          role: "user",
                          content: aggressivePrompt
                        }
                      ]
                    },
                    {
                      headers: {
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01',
                        'x-api-key': apiKey
                      }
                    }
                  );

                  // Process retry response
                  if (retryResponse.data && retryResponse.data.content && Array.isArray(retryResponse.data.content)) {
                    const retryTextContent = retryResponse.data.content.find((item: ClaudeContentItem) => item.type === "text");
                    
                    if (retryTextContent && retryTextContent.text) {
                      try {
                        const retryJsonMatch = retryTextContent.text.match(/\{[\s\S]*\}/);
                        let retryJsonString = retryJsonMatch ? retryJsonMatch[0] : retryTextContent.text;
                        
                        // Comprehensive JSON cleaning for common LLM output issues
                        retryJsonString = cleanJsonString(retryJsonString);
                        
                        // Add detailed logging for retry attempt
                        console.log("Retry raw response text:", retryTextContent.text);
                        console.log("Retry extracted JSON string:", retryJsonString);
                        console.log("Retry first 100 chars of JSON:", retryJsonString.substring(0, 100));
                        
                        const retryParsedContent = JSON.parse(retryJsonString);
                        
                        const retryFuriganaText = retryParsedContent.furiganaText || "";
                        const retryValidation = validateJapaneseFurigana(text, retryFuriganaText);
                        
                        console.log(`Retry furigana validation: ${retryValidation.details}`);
                        
                        if (retryValidation.isValid || retryValidation.missingKanjiCount < validation.missingKanjiCount) {
                          // Use retry result if it's better
                          furiganaText = retryFuriganaText;
                          console.log("Retry successful - using improved furigana result");
                        } else {
                          console.log("Retry did not improve furigana coverage - using original result");
                        }
                      } catch (retryParseError) {
                        console.error("Error parsing retry response:", retryParseError);
                        // Continue with original result
                      }
                    }
                  }
                }
              }
            }
            
            return {
              furiganaText: furiganaText,
              translatedText: translatedText
            };
          } catch (parseError) {
            console.error("Error parsing JSON from Claude response:", parseError);
            console.log("Raw content received:", textContent.text);
            
            // Try alternative JSON extraction methods
            try {
              console.log("Attempting alternative JSON extraction methods...");
              
              // Method 1: Look for JSON blocks with ```json markers
              const jsonBlockMatch = textContent.text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
              if (jsonBlockMatch) {
                console.log("Found JSON block with markers, trying to parse...");
                const blockJsonString = cleanJsonString(jsonBlockMatch[1]);
                const blockParsedContent = JSON.parse(blockJsonString);
                console.log("Successfully parsed JSON from block markers");
                return {
                  furiganaText: blockParsedContent.furiganaText || "",
                  translatedText: blockParsedContent.translatedText || ""
                };
              }
              
              // Method 2: Try to extract JSON with more flexible regex
              const flexibleJsonMatch = textContent.text.match(/\{[^{}]*"furiganaText"[^{}]*"translatedText"[^{}]*\}/);
              if (flexibleJsonMatch) {
                console.log("Found JSON with flexible regex, trying to parse...");
                const flexibleJsonString = cleanJsonString(flexibleJsonMatch[0]);
                const flexibleParsedContent = JSON.parse(flexibleJsonString);
                console.log("Successfully parsed JSON with flexible regex");
                return {
                  furiganaText: flexibleParsedContent.furiganaText || "",
                  translatedText: flexibleParsedContent.translatedText || ""
                };
              }
              
              // Method 3: Try to extract values manually with regex
              const furiganaMatch = textContent.text.match(/"furiganaText":\s*"([^"]*(?:\\.[^"]*)*)"/);
              const translatedMatch = textContent.text.match(/"translatedText":\s*"([^"]*(?:\\.[^"]*)*)"/);
              
              if (furiganaMatch && translatedMatch) {
                console.log("Extracted values manually with regex");
                return {
                  furiganaText: furiganaMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
                  translatedText: translatedMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
                };
              }
              
            } catch (alternativeError) {
              console.error("Alternative JSON extraction also failed:", alternativeError);
            }
            
            throw new Error("Failed to parse Claude API response");
          }
        } else {
          console.error("No text content found in response:", JSON.stringify(response.data));
          throw new Error("No text content in Claude API response");
        }
      } else {
        console.error("Unexpected response structure:", JSON.stringify(response.data));
        throw new Error("Unexpected response structure from Claude API");
      }
    } catch (error: unknown) {
      lastError = error;
      
      // Check if this is an overloaded error that we should retry
      const shouldRetry = error instanceof AxiosError && 
                          (error.response?.status === 529 || 
                           error.response?.headers['x-should-retry'] === 'true');
      
      if (shouldRetry && retryCount < MAX_RETRIES - 1) {
        // Calculate backoff delay with exponential increase
        const backoffDelay = INITIAL_BACKOFF_DELAY * Math.pow(2, retryCount);
        
        console.log(`Claude API overloaded. Retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        // Wait before retrying
        await sleep(backoffDelay);
        
        // Increment retry counter
        retryCount++;
      } else {
        // Max retries reached or non-retryable error, log and exit loop
        console.error('Error processing text with Claude:', error);
        
        // Log more details about the error
        if (error instanceof AxiosError && error.response) {
          // The request was made and the server responded with a status code
          console.error('Error data:', JSON.stringify(error.response.data));
          console.error('Error status:', error.response.status);
          console.error('Error headers:', JSON.stringify(error.response.headers));
        } else if (error instanceof AxiosError && error.request) {
          // The request was made but no response was received
          console.error('No response received:', error.request);
        } else {
          // Something happened in setting up the request
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('Error message:', errorMessage);
        }
        
        break;
      }
    }
  }
  
  // If we've exhausted all retries or encountered a non-retryable error
  if (retryCount >= MAX_RETRIES) {
    console.error(`Claude API still unavailable after ${MAX_RETRIES} retry attempts`);
  }
  
  return {
    furiganaText: '',
    translatedText: 'Error processing text with Claude API. The service may be temporarily overloaded. Please try again later.'
  };
}

// Add default export to satisfy Expo Router's requirement
export default {
  processWithClaude
};

/**
 * Validates that Japanese text with furigana has proper coverage of all kanji
 * @param originalText The original Japanese text
 * @param furiganaText The text with furigana added
 * @returns Object with validation result and details
 */
function validateJapaneseFurigana(originalText: string, furiganaText: string): {
  isValid: boolean;
  missingKanjiCount: number;
  totalKanjiCount: number;
  details: string;
} {
  // Extract all kanji from original text
  const kanjiRegex = /[\u4e00-\u9fff]/g;
  const originalKanji = originalText.match(kanjiRegex) || [];
  const totalKanjiCount = originalKanji.length;
  
  if (totalKanjiCount === 0) {
    return {
      isValid: true,
      missingKanjiCount: 0,
      totalKanjiCount: 0,
      details: "No kanji found in text"
    };
  }
  
  // Count kanji that have furigana in the furigana text
  // Look for patterns like 漢字(かんじ) where kanji is followed by hiragana in parentheses
  const furiganaPattern = /[\u4e00-\u9fff]+\([ぁ-ゟ\?]+\)/g;
  const furiganaMatches = furiganaText.match(furiganaPattern) || [];
  
  // Extract kanji from furigana matches
  const kanjiWithFurigana: string[] = [];
  furiganaMatches.forEach(match => {
    const kanjiPart = match.split('(')[0];
    const kanjiInMatch = kanjiPart.match(kanjiRegex) || [];
    kanjiWithFurigana.push(...kanjiInMatch);
  });
  
  const missingKanjiCount = Math.max(0, totalKanjiCount - kanjiWithFurigana.length);
  const isValid = missingKanjiCount === 0;
  
  const details = isValid 
    ? `All ${totalKanjiCount} kanji have furigana`
    : `${missingKanjiCount} out of ${totalKanjiCount} kanji are missing furigana`;
  
  return {
    isValid,
    missingKanjiCount,
    totalKanjiCount,
    details
  };
}

/**
 * Exported validation function for use in other parts of the app
 */
export { validateJapaneseFurigana }; 