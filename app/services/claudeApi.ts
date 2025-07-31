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
    
    // Extract furiganaText value - improved extraction to handle large texts
    const furiganaColonIndex = cleaned.indexOf(':', furiganaStart);
    const furiganaQuoteStart = cleaned.indexOf('"', furiganaColonIndex) + 1;
    
    // Find the end quote, handling escaped quotes
    // Use a more robust approach to find the closing quote
    let furiganaQuoteEnd = furiganaQuoteStart;
    let inEscape = false;
    
    while (furiganaQuoteEnd < cleaned.length) {
      const char = cleaned[furiganaQuoteEnd];
      
      if (inEscape) {
        inEscape = false;
      } else if (char === '\\') {
        inEscape = true;
      } else if (char === '"') {
        // Found unescaped quote
        break;
      }
      
      furiganaQuoteEnd++;
    }
    
    // Extract translatedText value with the same improved approach
    const translationColonIndex = cleaned.indexOf(':', translationStart);
    const translationQuoteStart = cleaned.indexOf('"', translationColonIndex) + 1;
    
    let translationQuoteEnd = translationQuoteStart;
    inEscape = false;
    
    while (translationQuoteEnd < cleaned.length) {
      const char = cleaned[translationQuoteEnd];
      
      if (inEscape) {
        inEscape = false;
      } else if (char === '\\') {
        inEscape = true;
      } else if (char === '"') {
        // Found unescaped quote
        break;
      }
      
      translationQuoteEnd++;
    }
    
    // Extract the raw values
    let furiganaValue = cleaned.substring(furiganaQuoteStart, furiganaQuoteEnd);
    let translationValue = cleaned.substring(translationQuoteStart, translationQuoteEnd);
    
    // Log the extracted values length for debugging
    console.log(`Extracted furigana length: ${furiganaValue.length}`);
    console.log(`Extracted translation length: ${translationValue.length}`);
    
    // Clean up the extracted values - remove ALL problematic characters
    furiganaValue = furiganaValue
      .replace(/[""‚„«»]/g, '"')     // Unicode quotes → regular quotes
      .replace(/[''‛‹›]/g, "'")      // Unicode single quotes → regular quotes  
      .replace(/[–—]/g, '-')         // Unicode dashes → regular dashes
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ') // Unicode spaces → regular spaces
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '') // Remove zero-width characters
      .replace(/\s+/g, ' ')          // Normalize multiple spaces
      .trim();
    
    translationValue = translationValue
      .replace(/[""‚„«»]/g, '"')     // Unicode quotes → regular quotes
      .replace(/[''‛‹›]/g, "'")      // Unicode single quotes → regular quotes
      .replace(/[–—]/g, '-')         // Unicode dashes → regular dashes
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ') // Unicode spaces → regular spaces
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '') // Remove zero-width characters
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
  forcedLanguage: string = 'auto',
  onProgress?: (checkpoint: number) => void
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

  // Checkpoint 1: Language validation complete, starting processing
  console.log('🎯 [Claude API] Checkpoint 1: Language validation complete');
  onProgress?.(1);

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
6. Translate into ${targetLangName}

CRITICAL WORD-LEVEL READING PRIORITY:
- FIRST analyze the text for compound words, counter words, and context-dependent readings
- Compound words should be read as single units with their contextual pronunciation
- Counter words undergo sound changes (rendaku) and must be read as complete units
- Only split into individual kanji readings when words cannot be read as compounds

SELF-VERIFICATION REQUIREMENT:
After generating furigana readings, you MUST perform these verification steps:
1. Review EVERY kanji compound word in your output
2. For each compound, verify if the reading is the standard dictionary reading (not just combining individual kanji readings)
3. Pay special attention to words where the compound reading differs from individual kanji readings
4. If you find any errors, correct them before finalizing your response
5. Double-check all compounds against the common examples provided below

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
- "車道" → "車道(しゃどう)" [REQUIRED - compound word with special reading]
- "自動車" → "自動車(じどうしゃ)" [REQUIRED - compound word]
- "電車" → "電車(でんしゃ)" [REQUIRED - compound word]

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
- 車道 = しゃどう (NOT くるまみち)
- 歩道 = ほどう (NOT あるきみち)
- 自転車 = じてんしゃ (compound)
- 新聞 = しんぶん (NOT しんもん)
- 会社 = かいしゃ (compound)
- 銀行 = ぎんこう (compound)
- 食堂 = しょくどう (compound)
- 病院 = びょういん (compound)
- 市場 = いちば (NOT しじょう, context dependent)
- 今朝 = けさ (NOT いまあさ)
- 今晩 = こんばん (compound)
- 毎日 = まいにち (compound)
- 毎週 = まいしゅう (compound)
- 毎月 = まいつき (compound)
- 毎年 = まいとし/まいねん (context dependent)

ERROR HANDLING:
If you encounter a kanji whose reading you're uncertain about, use the most common reading and add [?] after the furigana like this: "難(むずか)[?]しい"

CRITICAL RESPONSE FORMAT REQUIREMENTS:
1. Format your response as valid JSON with these exact keys
2. Do NOT truncate or abbreviate any part of the response
3. Include the COMPLETE furiganaText and translatedText without omissions
4. Ensure all special characters are properly escaped in the JSON
5. Do NOT use ellipses (...) or any other abbreviation markers
6. Do NOT split the response into multiple parts
7. CRITICAL: Your response MUST include a COMPLETE translation - partial translations will cause errors
8. CRITICAL: The translation must be a complete sentence that fully captures the meaning of the original text

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Japanese text with furigana after EVERY kanji word as shown in examples - THIS IS MANDATORY AND MUST BE COMPLETE",
  "translatedText": "Complete and accurate translation in ${targetLangName} without any truncation or abbreviation"
}`;
      } else if (primaryLanguage === "Chinese" || forcedLanguage === 'zh') {
        console.log(`[DEBUG] Using Chinese prompt (pinyin) for primaryLanguage: ${primaryLanguage}, forcedLanguage: ${forcedLanguage}`);
        // Enhanced Chinese-specific prompt with comprehensive pinyin rules
        userMessage = `
${promptTopSection}
You are a Chinese language expert. I need you to analyze and add pinyin to this Chinese text: "${text}"

CRITICAL FORMATTING REQUIREMENTS - THESE ARE MANDATORY:
1. KEEP ALL ORIGINAL CHINESE CHARACTERS in the text exactly as they appear
2. For EACH Chinese word/phrase, add pinyin in parentheses IMMEDIATELY AFTER the Chinese characters
3. Format: 中文(zhōngwén) - Chinese characters followed by pinyin in parentheses
4. Do NOT replace Chinese characters with pinyin - ADD pinyin after Chinese characters
5. Use STANDARD Hanyu Pinyin with proper tone marks (ā é ǐ ò ū ǖ)
6. For compound words, provide pinyin for the COMPLETE word unit, not individual characters
7. Keep all non-Chinese content (English, numbers, punctuation) exactly as is - do NOT add pinyin to non-Chinese content
8. Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

CRITICAL COMPOUND WORD PRIORITY:
- FIRST analyze the text for compound words, proper nouns, and multi-character expressions
- Compound words should be read as single units with their standard pronunciation
- Institution names, place names, and common phrases must be treated as complete units
- Only split into individual character readings when words cannot be read as compounds

MANDATORY TONE SANDHI RULES:
- 不 (bù) becomes (bú) before fourth tone: 不是(búshì), 不对(búduì), 不要(búyào)
- 不 (bù) becomes (bù) before first, second, third tones: 不好(bùhǎo), 不来(bùlái)
- 一 changes tone based on following tone:
  * 一 + first tone = yī: 一天(yītiān)
  * 一 + second/third tone = yí: 一年(yínián), 一点(yìdiǎn)
  * 一 + fourth tone = yí: 一个(yíge), 一样(yíyàng)
- Third tone + third tone: first becomes second tone: 你好(níhǎo), 老老实(láolǎoshí)
- Neutral tone particles (的, 了, 吗, 吧, 呢) - mark without tone marks: de, le, ma, ba, ne

CONTEXT-DEPENDENT READINGS - Verify meaning before choosing:
- 行: háng (bank, row, industry) vs xíng (walk, do, travel)
- 长: cháng (long, length) vs zhǎng (grow, elder, leader)
- 数: shù (number, amount) vs shǔ (count, enumerate)
- 调: diào (tone, tune, melody) vs tiáo (adjust, regulate)
- 当: dāng (when, should, ought) vs dàng (suitable, proper)
- 好: hǎo (good, well) vs hào (like, fond of)
- 中: zhōng (middle, center) vs zhòng (hit target)
- 重: zhòng (heavy, serious) vs chóng (repeat, duplicate)

SELF-VERIFICATION REQUIREMENT:
After generating pinyin, you MUST perform these verification steps:
1. Review EVERY Chinese compound word in your output
2. For each compound, verify the reading is the standard dictionary pronunciation (not just combining individual character readings)
3. Check that all tone sandhi rules are correctly applied
4. Ensure context-dependent characters use the appropriate reading for their meaning
5. Verify all tone marks are present and correct (including neutral tones marked without tone marks)
6. Double-check compound words against the examples below

Examples of MANDATORY correct Chinese pinyin formatting:

COMPOUND WORDS (READ AS SINGLE UNITS):
- "普通话" → "普通话(pǔtōnghuà)" [REQUIRED - complete compound, not individual characters]
- "中华人民共和国" → "中华人民共和国(Zhōnghuá Rénmín Gònghéguó)" [REQUIRED - proper noun as unit]
- "北京大学" → "北京大学(Běijīng Dàxué)" [REQUIRED - institution name as unit]
- "第一次" → "第一次(dì-yī-cì)" [REQUIRED - ordinal compound with tone sandhi]
- "电视机" → "电视机(diànshìjī)" [REQUIRED - compound word]
- "计算机" → "计算机(jìsuànjī)" [REQUIRED - compound word]
- "图书馆" → "图书馆(túshūguǎn)" [REQUIRED - compound word]
- "飞机场" → "飞机场(fēijīchǎng)" [REQUIRED - compound word]
- "火车站" → "火车站(huǒchēzhàn)" [REQUIRED - compound word]
- "大学生" → "大学生(dàxuéshēng)" [REQUIRED - compound word]
- "中国人" → "中国人(Zhōngguórén)" [REQUIRED - nationality compound]
- "外国人" → "外国人(wàiguórén)" [REQUIRED - compound word]

TONE SANDHI EXAMPLES (CRITICAL ACCURACY):
- "不是" → "不是(búshì)" [REQUIRED - 不 becomes bú before 4th tone]
- "不对" → "不对(búduì)" [REQUIRED - 不 becomes bú before 4th tone]
- "不好" → "不好(bùhǎo)" [REQUIRED - 不 stays bù before 3rd tone]
- "一个" → "一个(yíge)" [REQUIRED - 一 becomes yí before 4th tone]
- "一年" → "一年(yínián)" [REQUIRED - 一 becomes yí before 2nd tone]
- "一天" → "一天(yītiān)" [REQUIRED - 一 stays yī before 1st tone]
- "你好" → "你好(níhǎo)" [REQUIRED - 3rd+3rd tone sandhi]

CONTEXT-DEPENDENT EXAMPLES:
- "银行" → "银行(yínháng)" [háng = bank/institution]
- "行走" → "行走(xíngzǒu)" [xíng = walk/travel]
- "很长" → "很长(hěn cháng)" [cháng = long/length]
- "班长" → "班长(bānzhǎng)" [zhǎng = leader/head]
- "数学" → "数学(shùxué)" [shù = mathematics/number]
- "数一数" → "数一数(shǔ yī shǔ)" [shǔ = count/enumerate]

NEUTRAL TONE EXAMPLES:
- "的" → "的(de)" [REQUIRED - no tone mark for neutral tone]
- "了" → "了(le)" [REQUIRED - no tone mark for neutral tone]  
- "吗" → "吗(ma)" [REQUIRED - no tone mark for neutral tone]
- "走了" → "走了(zǒu le)" [REQUIRED - neutral tone for particle]
- "我的" → "我的(wǒ de)" [REQUIRED - neutral tone for possessive]

COMPLEX SENTENCE EXAMPLES - EXACT FORMAT REQUIRED:
- "今天天气很好" → "今天(jīntiān)天气(tiānqì)很(hěn)好(hǎo)"
- "我在北京大学学习中文" → "我(wǒ)在(zài)北京大学(Běijīng Dàxué)学习(xuéxí)中文(zhōngwén)"
- "这是一本很有意思的书" → "这(zhè)是(shì)一(yì)本(běn)很(hěn)有意思(yǒu yìsi)的(de)书(shū)"

CRITICAL: Notice how EVERY example keeps the original Chinese characters and adds pinyin in parentheses after them!

MIXED CONTENT FORMATTING:
- "Hello 中国" → "Hello 中国(Zhōngguó)" [English unchanged, Chinese with pinyin]
- "我爱你 and I love you" → "我爱你(wǒ ài nǐ) and I love you" [Mixed content]
- "中国語を勉強している" → "中国語(zhōngguóyǔ)を勉強している" [Chinese-Japanese mixed]

VALIDATION CHECKLIST - Verify each item before responding:
✓ Are all tone marks correct and complete? (including neutral tones without marks)
✓ Are compound words treated as units with correct standard readings?
✓ Are tone sandhi rules properly applied (不, 一, third tone combinations)?
✓ Do context-dependent characters use appropriate readings for their meaning?
✓ Are there any missing pinyin for Chinese characters?
✓ Do all readings match the context, not just dictionary defaults?

ERROR HANDLING:
If you encounter a character whose reading you're uncertain about, use the most common contextual reading and add [?] after the pinyin like this: "难(nán)[?]"

CRITICAL RESPONSE FORMAT REQUIREMENTS:
1. Format your response as valid JSON with these exact keys
2. Do NOT truncate or abbreviate any part of the response
3. Include the COMPLETE furiganaText and translatedText without omissions
4. Ensure all special characters are properly escaped in the JSON
5. Do NOT use ellipses (...) or any other abbreviation markers
6. CRITICAL: Your response MUST include a COMPLETE translation - partial translations will cause errors

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "ORIGINAL Chinese characters with pinyin in parentheses after each word as shown in examples above - DO NOT REPLACE Chinese characters with pinyin, ADD pinyin after them",
  "translatedText": "Complete and accurate translation in ${targetLangName} without any truncation or abbreviation"
}

FINAL CHECK BEFORE RESPONDING:
✓ Does your furiganaText contain the ORIGINAL Chinese characters?
✓ Is pinyin added IN PARENTHESES after each Chinese word?
✓ Did you follow the format: 中文(zhōngwén) not just "zhōngwén"?
`;
      } else if (primaryLanguage === "Korean") {
        // Korean-specific prompt with Enhanced Revised Romanization
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

KOREAN-SPECIFIC VALIDATION:
- Double-check ㅓ/ㅗ vowel distinctions (ㅓ = eo, ㅗ = o)
- Ensure consistent ㅡ (eu) vs ㅜ (u) representation
- Verify compound word boundaries are logical
- Check that formal endings (-습니다, -았습니다) are complete

COMMON KOREAN PATTERNS:
- Past tense: -았/었/였 = -ass/-eoss/-yeoss
- Formal polite: -습니다 = -seum-ni-da
- Topic particle: 은/는 = eun/neun
- Object particle: 을/를 = eul/reul
- Causative verb forms: -시키다 = -si-ki-da
- Abstract noun formations: -성 = -seong
- Time expressions: 시 = si, 시간 = si-gan
- Compound words: maintain syllable boundaries clearly

Examples of CORRECT Korean romanization formatting:
- "안녕하세요" should become "안녕하세요(an-nyeong-ha-se-yo)"
- "저는 학생입니다" should become "저는(jeo-neun) 학생입니다(hag-saeng-im-ni-da)"
- "오늘 날씨가 좋아요" should become "오늘(o-neul) 날씨가(nal-ssi-ga) 좋아요(jo-a-yo)"
- "변화시키고" should become "변화시키고(byeon-hwa-si-ki-go)"
- "중요성" should become "중요성(jung-yo-seong)"
- "평생교육" should become "평생교육(pyeong-saeng-gyo-yug)"
- "일곱시" should become "일곱시(il-gop-si)"
- "점심시간" should become "점심시간(jeom-sim-si-gan)"
- "구경했습니다" should become "구경했습니다(gu-gyeong-haess-seum-ni-da)"
- Mixed content: "Hello 한국어" should become "Hello 한국어(han-gug-eo)"

WRONG examples (do NOT use these formats):
- "jeo-neun (I)" ❌
- "han-gug-eo (Korean)" ❌
- "gong-bu-ha-go (study)" ❌
- Inconsistent vowels: "학생" as "hag-sang" instead of "hag-saeng" ❌
- Missing syllable boundaries in compounds ❌

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
6. Translate into ${targetLangName}

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

CRITICAL RESPONSE FORMAT REQUIREMENTS:
1. Format your response as valid JSON with these exact keys
2. Do NOT truncate or abbreviate any part of the response
3. Include the COMPLETE furiganaText and translatedText without omissions
4. Ensure all special characters are properly escaped in the JSON
5. Do NOT use ellipses (...) or any other abbreviation markers
6. Do NOT split the response into multiple parts
7. CRITICAL: Your response MUST include a COMPLETE translation - partial translations will cause errors
8. CRITICAL: The translation must be a complete sentence that fully captures the meaning of the original text

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Japanese text with furigana after EVERY kanji word as shown in examples - THIS IS MANDATORY AND MUST BE COMPLETE",
  "translatedText": "Complete and accurate translation in ${targetLangName} without any truncation or abbreviation"
}`;
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
      console.log('🎯 [Claude API] Starting API request to Claude...');
      
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: "claude-3-haiku-20240307",
          max_tokens: 4000,  // Increased from 1000 to ensure we get complete responses
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

      // Checkpoint 2: API request completed, response received (purple light)
      console.log('🎯 [Claude API] Checkpoint 2: API response received, triggering purple light');
      onProgress?.(2);
      
      // Schedule yellow light to appear after 2 seconds for better visual progression
      const yellowLightTimer = setTimeout(() => {
        console.log('🎯 [Claude API] Checkpoint 3: Scheduled yellow light trigger (2s after purple)');
        onProgress?.(3);
      }, 2000);
      
      // Store timer reference for potential cleanup
      (global as any).yellowLightTimer = yellowLightTimer;

      console.log("Claude API response received");
      
      // API response received, now processing results
      console.log('🎯 [Claude API] API response received, now processing results');
      
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
            console.log("Raw response text length:", textContent.text.length);
            console.log("Extracted JSON string length:", jsonString.length);
            console.log("First 100 chars of JSON:", jsonString.substring(0, 100));
            console.log("Last 100 chars of JSON:", jsonString.substring(Math.max(0, jsonString.length - 100)));
            
            let parsedContent;
            
            try {
              parsedContent = JSON.parse(jsonString);
            } catch (parseError) {
              console.log('🚨 Initial JSON parse failed, trying emergency fallback...');
              
              // Emergency fallback: manually extract values using regex
              try {
                // Use a more comprehensive regex pattern that can handle multi-line values
                const furiganaMatch = textContent.text.match(/"furiganaText"\s*:\s*"((?:\\.|[^"\\])*?)"/s);
                const translationMatch = textContent.text.match(/"translatedText"\s*:\s*"((?:\\.|[^"\\])*?)"/s);
                
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
                  
                  console.log("Extracted furigana length:", furiganaValue.length);
                  console.log("Extracted translation length:", translationValue.length);
                  
                  parsedContent = {
                    furiganaText: furiganaValue,
                    translatedText: translationValue
                  };
                  
                  console.log('✅ Emergency fallback parsing successful');
                } else {
                  // Try even more aggressive extraction
                  console.log("Regex extraction failed, trying direct string search...");
                  
                  const furiganaTextKey = '"furiganaText":';
                  const translatedTextKey = '"translatedText":';
                  
                  if (textContent.text.includes(furiganaTextKey) && textContent.text.includes(translatedTextKey)) {
                    // Find the start positions
                    const furiganaKeyPos = textContent.text.indexOf(furiganaTextKey);
                    const translatedKeyPos = textContent.text.indexOf(translatedTextKey);
                    
                    // Determine which key comes first to extract values in correct order
                    let firstKey, secondKey, firstKeyPos, secondKeyPos;
                    
                    if (furiganaKeyPos < translatedKeyPos) {
                      firstKey = furiganaTextKey;
                      secondKey = translatedTextKey;
                      firstKeyPos = furiganaKeyPos;
                      secondKeyPos = translatedKeyPos;
                    } else {
                      firstKey = translatedTextKey;
                      secondKey = furiganaTextKey;
                      firstKeyPos = translatedKeyPos;
                      secondKeyPos = furiganaKeyPos;
                    }
                    
                    // Extract the first value (from after its key until the second key or end)
                    const firstValueStart = textContent.text.indexOf('"', firstKeyPos + firstKey.length) + 1;
                    const firstValueEnd = textContent.text.lastIndexOf('"', secondKeyPos);
                    const firstValue = textContent.text.substring(firstValueStart, firstValueEnd);
                    
                    // Extract the second value (from after its key until the end)
                    const secondValueStart = textContent.text.indexOf('"', secondKeyPos + secondKey.length) + 1;
                    
                    // More robust approach to find the end of the second value
                    // Look for the closing quote of the JSON value
                    let secondValueEnd = secondValueStart;
                    let inEscape = false;
                    let braceCount = 0;
                    
                    // Scan through the text to find the proper end of the value
                    while (secondValueEnd < textContent.text.length) {
                      const char = textContent.text[secondValueEnd];
                      
                      if (inEscape) {
                        inEscape = false;
                      } else if (char === '\\') {
                        inEscape = true;
                      } else if (char === '{') {
                        braceCount++;
                      } else if (char === '}') {
                        if (braceCount > 0) {
                          braceCount--;
                        } else {
                          // We've reached the end of the JSON object
                          // Look backward for the last quote before this closing brace
                          const lastQuotePos = textContent.text.lastIndexOf('"', secondValueEnd);
                          if (lastQuotePos > secondValueStart) {
                            secondValueEnd = lastQuotePos;
                          }
                          break;
                        }
                      } else if (char === '"' && !inEscape && braceCount === 0) {
                        // Found unescaped quote outside of any nested objects
                        break;
                      }
                      
                      secondValueEnd++;
                    }
                    
                    const secondValue = textContent.text.substring(secondValueStart, secondValueEnd);
                    
                    // Assign values to correct fields
                    const furiganaValue = firstKey === furiganaTextKey ? firstValue : secondValue;
                    const translationValue = firstKey === translatedTextKey ? firstValue : secondValue;
                    
                    console.log("Direct extraction furigana length:", furiganaValue.length);
                    console.log("Direct extraction translation length:", translationValue.length);
                    
                    parsedContent = {
                      furiganaText: furiganaValue,
                      translatedText: translationValue
                    };
                    
                    console.log('✅ Direct string extraction successful');
                  } else {
                    throw new Error('Could not extract values with direct string search');
                  }
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
            
            // Translation processing complete (yellow light now triggers on timer)
            console.log('🎯 [Claude API] Translation processing complete (yellow light on timer)');
            
            // Always verify translation completeness regardless of length
            if (retryCount < MAX_RETRIES - 1) {
              console.log("Verifying translation completeness...");
              
              // Increment retry counter
              retryCount++;
              
              // Create a self-verification prompt
              const verificationPrompt = `
${promptTopSection}
You are a translation quality expert. I need you to verify if the following translation is complete.

Original text in source language: "${text}"

Current translation: "${translatedText}"

VERIFICATION TASK:
1. Compare the original text and the translation
2. Determine if the translation captures ALL content from the original text
3. Check if any parts of the original text are missing from the translation
4. Verify that the translation is a complete, coherent sentence/paragraph

If the translation is incomplete, provide a new complete translation.

Format your response as valid JSON with these exact keys:
{
  "isComplete": true/false (boolean indicating if the current translation is complete),
  "analysis": "Brief explanation of what's missing or incomplete (if applicable)",
  "furiganaText": "${parsedContent.furiganaText || ""}", 
  "translatedText": "Complete and accurate translation in ${targetLangName} - either the original if it was complete, or a new complete translation if it wasn't"
}`;

              // Make verification request
              const verificationResponse = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                  model: "claude-3-haiku-20240307",
                  max_tokens: 4000,
                  temperature: 0,
                  messages: [
                    {
                      role: "user",
                      content: verificationPrompt
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
              
              // Process verification response
              if (verificationResponse.data && verificationResponse.data.content && Array.isArray(verificationResponse.data.content)) {
                const verificationTextContent = verificationResponse.data.content.find((item: ClaudeContentItem) => item.type === "text");
                
                if (verificationTextContent && verificationTextContent.text) {
                  try {
                    const verificationJsonMatch = verificationTextContent.text.match(/\{[\s\S]*\}/);
                    let verificationJsonString = verificationJsonMatch ? verificationJsonMatch[0] : verificationTextContent.text;
                    
                    // Comprehensive JSON cleaning for common LLM output issues
                    verificationJsonString = cleanJsonString(verificationJsonString);
                    
                    // Add detailed logging for verification attempt
                    console.log("Verification raw response text length:", verificationTextContent.text.length);
                    console.log("Verification extracted JSON string length:", verificationJsonString.length);
                    
                    const verificationParsedContent = JSON.parse(verificationJsonString);
                    const isComplete = verificationParsedContent.isComplete === true;
                    const analysis = verificationParsedContent.analysis || "";
                    const verifiedTranslatedText = verificationParsedContent.translatedText || "";
                    
                    if (!isComplete && verifiedTranslatedText.length > translatedText.length) {
                      console.log(`Translation was incomplete. Analysis: ${analysis}`);
                      console.log("Using improved translation from verification");
                      console.log(`New translation: "${verifiedTranslatedText.substring(0, 60)}${verifiedTranslatedText.length > 60 ? '...' : ''}"`);
                      
                            // Clear yellow light timer if processing completes early
      if ((global as any).yellowLightTimer) {
        clearTimeout((global as any).yellowLightTimer);
        console.log('🎯 [Claude API] Cleared yellow light timer - processing completed early');
      }
      
      // Checkpoint 4: Processing complete successfully
      console.log('🎯 [Claude API] Checkpoint 4: Processing complete successfully (verification path)');
      onProgress?.(4);
                      
                      return {
                        furiganaText: parsedContent.furiganaText || "",
                        translatedText: verifiedTranslatedText
                      };
                    } else {
                      console.log(`Translation verification result: ${isComplete ? 'Complete' : 'Incomplete'}`);
                      if (!isComplete) {
                        console.log(`Analysis: ${analysis}`);
                        console.log("Verification did not provide a better translation - using original");
                      }
                    }
                  } catch (verificationParseError) {
                    console.error("Error parsing verification response:", verificationParseError);
                    // Continue with original result
                  }
                }
              }
            }
            
            // For Japanese text, validate furigana coverage
            let furiganaText = parsedContent.furiganaText || "";
            
            // Universal verification for readings (furigana, pinyin, etc.)
            if (furiganaText && retryCount < MAX_RETRIES - 1) {
              console.log("Verifying reading completeness...");
              
              // Increment retry counter
              retryCount++;
              
              // Create language-specific verification instructions
              let readingType = "readings";
              let readingSpecificInstructions = "";
              
              if (primaryLanguage === "Japanese" || forcedLanguage === 'ja') {
                readingType = "furigana";
                readingSpecificInstructions = `
For Japanese text:
- EVERY kanji character or compound must have furigana readings
- Readings should follow the pattern: 漢字(かんじ)
- Check for any missing readings, especially in compound words
- Verify readings are correct based on context`;
              } else if (primaryLanguage === "Chinese" || forcedLanguage === 'zh') {
                readingType = "pinyin";
                readingSpecificInstructions = `
For Chinese text:
- EVERY hanzi character or compound must have pinyin readings with tone marks
- Readings should follow the pattern: 汉字(hànzì)
- Check for any missing readings or incorrect tones
- Verify readings are correct based on context`;
              } else if (primaryLanguage === "Korean" || forcedLanguage === 'ko') {
                readingType = "romanization";
                readingSpecificInstructions = `
For Korean text:
- EVERY hangul word should have romanization
- Readings should follow the pattern: 한국어(han-gug-eo)
- Check for any missing romanization
- Verify romanization follows the Revised Romanization system
- Ensure ㅓ/ㅗ vowel distinctions are correct (ㅓ = eo, ㅗ = o)
- Verify ㅡ (eu) vs ㅜ (u) consistency
- Check compound word boundaries are logical with clear syllable separation
- Validate formal endings are complete (-습니다 = -seum-ni-da, -았습니다 = -ass-seum-ni-da)
- Verify common patterns: particles (은/는 = eun/neun), time expressions (시 = si), causative forms (-시키다 = -si-ki-da)`;
              } else if (primaryLanguage === "Russian" || forcedLanguage === 'ru') {
                readingType = "transliteration";
                readingSpecificInstructions = `
For Russian text:
- EVERY Cyrillic word should have transliteration
- Readings should follow the pattern: Русский(russkiy)
- Check for any missing transliteration
- Verify transliteration follows standard conventions`;
              } else {
                readingType = "pronunciation guide";
                readingSpecificInstructions = `
For this language:
- EVERY non-Latin word should have a pronunciation guide
- Check for any missing pronunciation guides
- Verify the guides are consistent and follow standard conventions for this language`;
              }
              
              // Create a reading verification prompt
              const readingVerificationPrompt = `
${promptTopSection}
You are a language expert. I need you to verify if the following text with ${readingType} is complete.

Original text: "${text}"

Current text with ${readingType}: "${furiganaText}"

${readingSpecificInstructions}

VERIFICATION TASK:
1. Compare the original text and the text with ${readingType}
2. Determine if EVERY word that needs ${readingType} has them
3. Check if any parts of the original text are missing ${readingType}
4. Verify that the ${readingType} are correct and consistent

If the ${readingType} are incomplete, provide a new complete version.

Format your response as valid JSON with these exact keys:
{
  "isComplete": true/false (boolean indicating if the current ${readingType} are complete),
  "analysis": "Brief explanation of what's missing or incomplete (if applicable)",
  "furiganaText": "Complete text with ${readingType} for ALL appropriate words - either the original if it was complete, or a new complete version if it wasn't",
  "translatedText": "${parsedContent.translatedText || ""}"
}`;

              // Make reading verification request
              const readingVerificationResponse = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                  model: "claude-3-haiku-20240307",
                  max_tokens: 4000,
                  temperature: 0,
                  messages: [
                    {
                      role: "user",
                      content: readingVerificationPrompt
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
              
              // Process reading verification response
              if (readingVerificationResponse.data && readingVerificationResponse.data.content && Array.isArray(readingVerificationResponse.data.content)) {
                const readingVerificationTextContent = readingVerificationResponse.data.content.find((item: ClaudeContentItem) => item.type === "text");
                
                if (readingVerificationTextContent && readingVerificationTextContent.text) {
                  try {
                    const readingVerificationJsonMatch = readingVerificationTextContent.text.match(/\{[\s\S]*\}/);
                    let readingVerificationJsonString = readingVerificationJsonMatch ? readingVerificationJsonMatch[0] : readingVerificationTextContent.text;
                    
                    // Comprehensive JSON cleaning for common LLM output issues
                    readingVerificationJsonString = cleanJsonString(readingVerificationJsonString);
                    
                    // Add detailed logging for reading verification attempt
                    console.log("Reading verification raw response text length:", readingVerificationTextContent.text.length);
                    console.log("Reading verification extracted JSON string length:", readingVerificationJsonString.length);
                    
                    const readingVerificationParsedContent = JSON.parse(readingVerificationJsonString);
                    const isReadingComplete = readingVerificationParsedContent.isComplete === true;
                    const readingAnalysis = readingVerificationParsedContent.analysis || "";
                    const verifiedFuriganaText = readingVerificationParsedContent.furiganaText || "";
                    
                    if (!isReadingComplete && verifiedFuriganaText.length > furiganaText.length) {
                      console.log(`${readingType} were incomplete. Analysis: ${readingAnalysis}`);
                      console.log(`Using improved ${readingType} from verification`);
                      furiganaText = verifiedFuriganaText;
                    } else {
                      console.log(`${readingType} verification result: ${isReadingComplete ? 'Complete' : 'Incomplete'}`);
                      if (!isReadingComplete) {
                        console.log(`Analysis: ${readingAnalysis}`);
                        console.log(`Verification did not provide better ${readingType} - using original`);
                      }
                    }
                  } catch (readingVerificationParseError) {
                    console.error("Error parsing reading verification response:", readingVerificationParseError);
                    // Continue with original result
                  }
                }
              }
            }
            
            if ((primaryLanguage === "Japanese" || forcedLanguage === 'ja') && furiganaText) {
              const validation = validateJapaneseFurigana(text, furiganaText);
              console.log(`Furigana validation: ${validation.details}`);
              
              if (!validation.isValid) {
                console.warn(`Incomplete furigana coverage: ${validation.details}`);
                
                // If this is the first attempt and we have significant missing furigana, retry with more aggressive prompt
                if (retryCount === 0 && (validation.missingKanjiCount > 0 || validation.details.includes("incorrect readings"))) {
                  console.log("Retrying with more aggressive furigana prompt...");
                  retryCount++;
                  
                  // Create a more aggressive prompt for retry
                  const aggressivePrompt = `
${promptTopSection}
CRITICAL FURIGANA RETRY - PREVIOUS ATTEMPT FAILED

You are a Japanese language expert. The previous attempt failed to add furigana to ALL kanji or used incorrect readings for compound words. You MUST fix this.

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

COMPOUND WORD VERIFICATION - MANDATORY:
You MUST check these common compounds for their correct readings:
- 車道 = しゃどう (NOT くるまみち)
- 歩道 = ほどう (NOT あるきみち)
- 自転車 = じてんしゃ (NOT じでんしゃ)
- 新聞 = しんぶん (NOT しんもん)
- 今朝 = けさ (NOT いまあさ)
- 市場 = いちば (context dependent)
- 一人 = ひとり (NOT いちにん)
- 二人 = ふたり (NOT ににん)
- 今日 = きょう (NOT いまひ/こんにち)
- 明日 = あした/あす (NOT みょうにち)
- 昨日 = きのう (NOT さくじつ)
- 大人 = おとな (NOT だいじん)
- 子供 = こども (NOT しきょう)

MANDATORY FORMAT for each kanji word:
- Counter words: 一匹(いっぴき), 三匹(さんびき), 一人(ひとり)
- Compound words: 東京(とうきょう), 日本語(にほんご), 大学生(だいがくせい)
- Mixed words: 勉強する(べんきょうする)
- Individual kanji (only when not compound): 食(た)べ物(もの)

VERIFICATION STEP: Before responding, manually check:
1. Original kanji count: ${validation.totalKanjiCount}
2. Your furigana count: [must equal ${validation.totalKanjiCount}]
3. All compound words have correct dictionary readings, not just individual kanji readings

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
                      max_tokens: 4000,  // Increased from 1000 to ensure we get complete responses
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
                        console.log("Retry last 100 chars of JSON:", retryJsonString.substring(Math.max(0, retryJsonString.length - 100)));
                        
                        const retryParsedContent = JSON.parse(retryJsonString);
                        
                        const retryFuriganaText = retryParsedContent.furiganaText || "";
                        const retryValidation = validateJapaneseFurigana(text, retryFuriganaText);
                        
                        console.log(`Retry furigana validation: ${retryValidation.details}`);
                        
                        if (retryValidation.isValid || 
                            retryValidation.missingKanjiCount < validation.missingKanjiCount || 
                            (!retryValidation.details.includes("incorrect readings") && validation.details.includes("incorrect readings"))) {
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

            // Chinese pinyin validation and smart retry logic
            if ((primaryLanguage === "Chinese" || forcedLanguage === 'zh') && furiganaText) {
              const validation = validatePinyinAccuracy(text, furiganaText);
              console.log(`Pinyin validation: ${validation.details}`);
              
              if (!validation.isValid && validation.accuracy < 85) {
                console.warn(`Pinyin quality issues detected: ${validation.details}`);
                
                // If this is the first attempt and we have significant issues, retry with enhanced correction prompt
                if (retryCount === 0 && validation.issues.length > 0) {
                  console.log("Retrying with enhanced pinyin correction prompt...");
                  retryCount++;
                  
                  // Create specific correction prompt based on validation issues
                  const correctionPrompt = `
${promptTopSection}
CRITICAL PINYIN RETRY - PREVIOUS ATTEMPT HAD QUALITY ISSUES

You are a Chinese language expert. The previous attempt had these specific issues that must be fixed:

DETECTED ISSUES:
${validation.issues.map(issue => `- ${issue}`).join('\n')}

SUGGESTED CORRECTIONS:
${validation.suggestions.map(suggestion => `- ${suggestion}`).join('\n')}

Original text: "${text}"
Previous result accuracy: ${validation.accuracy}%

MANDATORY CORRECTIONS - Fix these specific problems:
1. ${validation.issues.includes('Missing tone mark') ? 'ADD ALL MISSING TONE MARKS - every syllable needs proper tone marks (ā é ǐ ò ū)' : ''}
2. ${validation.issues.some(i => i.includes('Tone sandhi')) ? 'APPLY TONE SANDHI RULES CORRECTLY - 不 becomes bú before 4th tone, 一 changes based on following tone' : ''}
3. ${validation.issues.some(i => i.includes('compound')) ? 'USE STANDARD COMPOUND READINGS - treat multi-character words as units with dictionary pronunciations' : ''}
4. ${validation.issues.some(i => i.includes('coverage')) ? 'ENSURE COMPLETE COVERAGE - every Chinese character must have pinyin' : ''}

CRITICAL REQUIREMENTS FOR RETRY:
- Use STANDARD Hanyu Pinyin with proper tone marks (ā é ǐ ò ū ǖ)
- For compound words, provide pinyin for the COMPLETE word unit, not individual characters
- Apply tone sandhi rules correctly:
  * 不 + 4th tone = bú: 不是(búshì), 不对(búduì)
  * 一 + 4th tone = yí: 一个(yíge), 一样(yíyàng)  
  * 3rd + 3rd tone = 2nd+3rd: 你好(níhǎo)
- Neutral tone particles without tone marks: 的(de), 了(le), 吗(ma)

Examples of CORRECT formatting:
- "普通话" → "普通话(pǔtōnghuà)" [compound word]
- "不是" → "不是(búshì)" [tone sandhi]
- "一个" → "一个(yíge)" [tone sandhi]
- "你好" → "你好(níhǎo)" [3rd+3rd tone sandhi]
- "我的" → "我的(wǒ de)" [neutral tone]

SELF-VERIFICATION BEFORE RESPONDING:
✓ Are all tone marks present and correct?
✓ Are compound words treated as units?
✓ Are tone sandhi rules applied?
✓ Is coverage complete for all Chinese characters?

Format as JSON:
{
  "furiganaText": "Chinese text with corrected pinyin addressing all issues above",
  "translatedText": "Translation in ${targetLangName}"
}`;

                  // Make retry request
                  const retryResponse = await axios.post(
                    'https://api.anthropic.com/v1/messages',
                    {
                      model: "claude-3-haiku-20240307",
                      max_tokens: 4000,
                      temperature: 0,
                      messages: [
                        {
                          role: "user",
                          content: correctionPrompt
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
                        
                        retryJsonString = cleanJsonString(retryJsonString);
                        const retryParsedContent = JSON.parse(retryJsonString);
                        
                        const retryPinyinText = retryParsedContent.furiganaText || "";
                        const retryValidation = validatePinyinAccuracy(text, retryPinyinText);
                        
                        console.log(`Retry pinyin validation: ${retryValidation.details}`);
                        console.log(`Retry accuracy: ${retryValidation.accuracy}%`);
                        
                        // Use retry result if it's significantly better
                        if (retryValidation.accuracy > validation.accuracy + 10 || 
                            (retryValidation.isValid && !validation.isValid)) {
                          furiganaText = retryPinyinText;
                          console.log(`Retry successful - improved accuracy from ${validation.accuracy}% to ${retryValidation.accuracy}%`);
                        } else {
                          console.log(`Retry did not significantly improve pinyin quality - using original result`);
                        }
                      } catch (retryParseError) {
                        console.error("Error parsing pinyin retry response:", retryParseError);
                        // Continue with original result
                      }
                    }
                  }
                }
              } else if (validation.isValid) {
                console.log(`Pinyin validation passed with ${validation.accuracy}% accuracy`);
              }
            }

            // Korean romanization validation and smart retry logic
            if ((primaryLanguage === "Korean" || forcedLanguage === 'ko') && furiganaText) {
              const validation = validateKoreanRomanization(text, furiganaText);
              console.log(`Korean romanization validation: ${validation.details}`);
              
              if (!validation.isValid && validation.accuracy < 90) {
                console.warn(`Korean romanization quality issues detected: ${validation.details}`);
                
                // If this is the first attempt and we have significant issues, retry with enhanced correction prompt
                if (retryCount === 0 && validation.issues.length > 0) {
                  console.log("Retrying with enhanced Korean romanization correction prompt...");
                  retryCount++;
                  
                  // Create specific correction prompt based on validation issues
                  const correctionPrompt = `
${promptTopSection}
CRITICAL KOREAN ROMANIZATION RETRY - PREVIOUS ATTEMPT HAD QUALITY ISSUES

You are a Korean language expert. The previous attempt had these specific issues that must be fixed:

DETECTED ISSUES:
${validation.issues.map(issue => `- ${issue}`).join('\n')}

SUGGESTED CORRECTIONS:
${validation.suggestions.map(suggestion => `- ${suggestion}`).join('\n')}

Original text: "${text}"
Previous result accuracy: ${validation.accuracy}%

MANDATORY CORRECTIONS - Fix these specific problems:
1. ${validation.issues.some(i => i.includes('Vowel distinction')) ? 'FIX VOWEL DISTINCTIONS - ㅓ = eo, ㅗ = o, ㅡ = eu, ㅜ = u' : ''}
2. ${validation.issues.some(i => i.includes('formal ending')) ? 'COMPLETE FORMAL ENDINGS - ensure -습니다 = -seum-ni-da, past tense endings are complete' : ''}
3. ${validation.issues.some(i => i.includes('compound')) ? 'MAINTAIN SYLLABLE BOUNDARIES - compound words need clear hyphen separation' : ''}
4. ${validation.issues.some(i => i.includes('coverage')) ? 'ENSURE COMPLETE COVERAGE - every Korean word must have romanization' : ''}
5. ${validation.issues.some(i => i.includes('romanization')) ? 'USE STANDARD ROMANIZATION - follow Revised Romanization system exactly' : ''}

SPECIFIC PATTERN FIXES REQUIRED:
- Past tense: -았/었/였 = -ass/-eoss/-yeoss  
- Formal polite: -습니다 = -seum-ni-da
- Particles: 은/는 = eun/neun, 을/를 = eul/reul
- Time expressions: 시 = si, 시간 = si-gan
- Causative forms: -시키다 = -si-ki-da

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Korean text with corrected romanization addressing all issues above",
  "translatedText": "Accurate translation in ${targetLangName} language"
}

CRITICAL: Address every issue listed above. Double-check vowel distinctions and syllable boundaries.
`;

                  try {
                    console.log('Making Korean romanization correction request to Claude...');
                    const retryResponse = await axios.post(
                      'https://api.anthropic.com/v1/messages',
                      {
                        model: "claude-3-5-sonnet-20241022",
                        max_tokens: 4000,
                        temperature: 0.1,
                        messages: [{
                          role: "user",
                          content: correctionPrompt
                        }]
                      },
                      {
                        headers: {
                          'Authorization': `Bearer ${apiKey}`,
                          'Content-Type': 'application/json',
                          'anthropic-version': '2023-06-01'
                        },
                        timeout: 60000
                      }
                    );

                    if (retryResponse.data && retryResponse.data.content && retryResponse.data.content[0] && retryResponse.data.content[0].text) {
                      try {
                        const retryResponseText = retryResponse.data.content[0].text;
                        console.log("Retry response received:", retryResponseText.substring(0, 200) + "...");
                        
                        const retryCleanedJson = cleanJsonString(retryResponseText);
                        const retryParsedResponse = JSON.parse(retryCleanedJson);
                        const retryRomanizedText = retryParsedResponse.furiganaText;
                        
                        // Validate the retry result
                        const retryValidation = validateKoreanRomanization(text, retryRomanizedText);
                        console.log(`Korean retry validation: ${retryValidation.details}`);
                        
                        // Use retry result if it's significantly better
                        if (retryValidation.accuracy > validation.accuracy + 5 || 
                            (retryValidation.isValid && !validation.isValid)) {
                          furiganaText = retryRomanizedText;
                          console.log(`Korean retry successful - improved accuracy from ${validation.accuracy}% to ${retryValidation.accuracy}%`);
                        } else {
                          console.log(`Korean retry did not significantly improve romanization quality - using original result`);
                        }
                      } catch (retryParseError) {
                        console.error("Error parsing Korean romanization retry response:", retryParseError);
                        // Continue with original result
                      }
                    }
                  } catch (retryError) {
                    console.error("Error during Korean romanization retry:", retryError);
                    // Continue with original result
                  }
                }
              } else if (validation.isValid) {
                console.log(`Korean romanization validation passed with ${validation.accuracy}% accuracy`);
              }
            }
            
                  // Clear yellow light timer if processing completes early
      if ((global as any).yellowLightTimer) {
        clearTimeout((global as any).yellowLightTimer);
        console.log('🎯 [Claude API] Cleared yellow light timer - processing completed early');
      }
      
      // Checkpoint 4: Processing complete successfully
      console.log('🎯 [Claude API] Checkpoint 4: Processing complete successfully');
      onProgress?.(4);
            
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
 * Validates that Chinese text with pinyin has proper coverage and accuracy
 * @param originalText The original Chinese text
 * @param pinyinText The text with pinyin added
 * @returns Object with validation result and details
 */
function validatePinyinAccuracy(originalText: string, pinyinText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  accuracy: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Extract all Chinese characters from original text
  const chineseCharRegex = /[\u4e00-\u9fff]/g;
  const originalChinese = originalText.match(chineseCharRegex) || [];
  const totalChineseCount = originalChinese.length;
  
  if (totalChineseCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      accuracy: 100,
      details: "No Chinese characters found in text"
    };
  }
  
  // Check 1: Tone mark consistency
  const toneMarkRegex = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g;
  const pinyinSections = pinyinText.match(/[\u4e00-\u9fff]+\([^)]+\)/g) || [];
  
  let missingToneMarks = 0;
  pinyinSections.forEach(section => {
    const pinyinPart = section.split('(')[1]?.split(')')[0] || '';
    const syllables = pinyinPart.split(/[\s\-]+/).filter(s => s.length > 0);
    
    syllables.forEach(syllable => {
      // Check for missing tone marks (excluding neutral tone particles)
      if (!/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(syllable) && 
          !['de', 'le', 'ma', 'ba', 'ne', 'zi', 'zhe'].includes(syllable)) {
        issues.push(`Missing tone mark: ${syllable}`);
        suggestions.push(`Add appropriate tone mark to ${syllable}`);
        missingToneMarks++;
      }
    });
  });
  
  // Check 2: Complete coverage - ensure all Chinese characters have pinyin
  const chineseWordsWithPinyin = pinyinText.match(/[\u4e00-\u9fff]+(?=\([^)]+\))/g) || [];
  const totalCoveredChars = chineseWordsWithPinyin.join('').length;
  
  if (totalCoveredChars < totalChineseCount * 0.9) { // Allow 10% tolerance for edge cases
    issues.push("Incomplete pinyin coverage - some Chinese characters missing pinyin");
    suggestions.push("Ensure all Chinese characters have pinyin readings");
  }
  
  // Check 3: Common tone sandhi validation
  const toneSandhiPatterns = [
    { pattern: /不是\(bùshì\)/g, correct: '不是(búshì)', rule: '不 + 4th tone should be bú' },
    { pattern: /不对\(bùduì\)/g, correct: '不对(búduì)', rule: '不 + 4th tone should be bú' },
    { pattern: /一个\(yīge\)/g, correct: '一个(yíge)', rule: '一 + 4th tone should be yí' },
    { pattern: /你好\(nǐhǎo\)/g, correct: '你好(níhǎo)', rule: '3rd + 3rd tone: first becomes 2nd' }
  ];
  
  toneSandhiPatterns.forEach(({ pattern, correct, rule }) => {
    if (pattern.test(pinyinText)) {
      issues.push(`Tone sandhi error detected - ${rule}`);
      suggestions.push(`Use ${correct} instead`);
    }
  });
  
  // Check 4: Common compound word validation
  const commonCompounds: Record<string, string> = {
    '普通话': 'pǔtōnghuà',
    '北京大学': 'Běijīng Dàxué',
    '中华人民共和国': 'Zhōnghuá Rénmín Gònghéguó',
    '电视机': 'diànshìjī',
    '计算机': 'jìsuànjī',
    '图书馆': 'túshūguǎn',
    '大学生': 'dàxuéshēng',
    '火车站': 'huǒchēzhàn'
  };
  
  Object.entries(commonCompounds).forEach(([compound, correctPinyin]) => {
    if (originalText.includes(compound)) {
      const compoundPattern = new RegExp(`${compound}\\(([^)]+)\\)`);
      const match = pinyinText.match(compoundPattern);
      if (match && match[1] !== correctPinyin) {
        issues.push(`Incorrect compound reading: ${compound}(${match[1]})`);
        suggestions.push(`Use standard reading: ${compound}(${correctPinyin})`);
      }
    }
  });
  
  // Calculate accuracy score
  const maxIssues = Math.max(1, totalChineseCount / 2); // Reasonable max issues threshold
  const accuracy = Math.max(0, Math.round(100 - (issues.length / maxIssues) * 100));
  
  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
    accuracy,
    details: `Checked ${totalChineseCount} Chinese characters, found ${issues.length} issues`
  };
}

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
  
  // Check for common compound words with special readings
  const commonCompounds: Record<string, string> = {
    '車道': 'しゃどう',
    '歩道': 'ほどう',
    '自転車': 'じてんしゃ',
    '新聞': 'しんぶん',
    '今朝': 'けさ',
    '市場': 'いちば',
    '一人': 'ひとり',
    '二人': 'ふたり',
    '今日': 'きょう',
    '明日': 'あした',
    '昨日': 'きのう',
    '大人': 'おとな',
    '子供': 'こども'
  };
  
  // Find all compound words in the text and check their readings
  let incorrectReadings = 0;
  Object.keys(commonCompounds).forEach(compound => {
    if (originalText.includes(compound)) {
      const expectedReading = commonCompounds[compound];
      const compoundPattern = new RegExp(`${compound}\\(([^)]+)\\)`, 'g');
      const match = compoundPattern.exec(furiganaText);
      
      if (match && match[1] !== expectedReading) {
        console.log(`Incorrect reading for ${compound}: got ${match[1]}, expected ${expectedReading}`);
        incorrectReadings++;
      }
    }
  });
  
  const missingKanjiCount = Math.max(0, totalKanjiCount - kanjiWithFurigana.length);
  const isValid = missingKanjiCount === 0 && incorrectReadings === 0;
  
  let details = '';
  if (missingKanjiCount > 0) {
    details += `${missingKanjiCount} out of ${totalKanjiCount} kanji are missing furigana. `;
  } else {
    details += `All ${totalKanjiCount} kanji have furigana. `;
  }
  
  if (incorrectReadings > 0) {
    details += `Found ${incorrectReadings} compound words with incorrect readings.`;
  } else {
    details += `No incorrect compound readings detected.`;
  }
  
  return {
    isValid,
    missingKanjiCount,
    totalKanjiCount,
    details
  };
}

/**
 * Validates Korean text with romanization for accuracy and completeness
 * @param originalText The original Korean text
 * @param romanizedText The text with romanization added
 * @returns Object with validation result and details
 */
function validateKoreanRomanization(originalText: string, romanizedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  accuracy: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Extract all Korean characters from original text (Hangul syllables)
  const koreanRegex = /[\uAC00-\uD7AF]/g;
  const originalKorean = originalText.match(koreanRegex) || [];
  const totalKoreanCount = originalKorean.length;
  
  if (totalKoreanCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      accuracy: 100,
      details: "No Korean characters found in text"
    };
  }
  
  // Check 1: Complete coverage - ensure all Korean words have romanization
  // Updated regex to handle punctuation between Korean text and romanization
  const koreanWordsWithRomanization = romanizedText.match(/[\uAC00-\uD7AF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = koreanWordsWithRomanization.join('').length;
  
  if (totalCoveredChars < totalKoreanCount * 0.9) { // Allow 10% tolerance for edge cases
    issues.push("Incomplete romanization coverage - some Korean words missing romanization");
    suggestions.push("Ensure all Korean words have romanization readings");
  }
  
  // Check 2: ㅓ/ㅗ vowel distinction accuracy
  const vowelDistinctionChecks = [
    { korean: '서', romanized: 'seo', wrong: 'so', description: 'ㅓ should be "eo" not "o"' },
    { korean: '소', romanized: 'so', wrong: 'seo', description: 'ㅗ should be "o" not "eo"' },
    { korean: '어', romanized: 'eo', wrong: 'o', description: 'ㅓ should be "eo" not "o"' },
    { korean: '오', romanized: 'o', wrong: 'eo', description: 'ㅗ should be "o" not "eo"' }
  ];
  
  vowelDistinctionChecks.forEach(check => {
    const wrongPattern = new RegExp(`${check.korean}[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\([^)]*${check.wrong}[^)]*\\)`, 'g');
    if (wrongPattern.test(romanizedText)) {
      issues.push(`Vowel distinction error: ${check.description}`);
      suggestions.push(`Use "${check.romanized}" for ${check.korean}`);
    }
  });
  
  // Check 3: ㅡ (eu) vs ㅜ (u) consistency
  const euVsUChecks = [
    { korean: '으', romanized: 'eu', wrong: 'u', description: 'ㅡ should be "eu" not "u"' },
    { korean: '우', romanized: 'u', wrong: 'eu', description: 'ㅜ should be "u" not "eu"' }
  ];
  
  euVsUChecks.forEach(check => {
    const wrongPattern = new RegExp(`${check.korean}[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\([^)]*${check.wrong}[^)]*\\)`, 'g');
    if (wrongPattern.test(romanizedText)) {
      issues.push(`Vowel consistency error: ${check.description}`);
      suggestions.push(`Use "${check.romanized}" for ${check.korean}`);
    }
  });
  
  // Check 4: Common Korean pattern validation
  const commonPatterns: Record<string, string> = {
    // Formal polite endings
    '습니다': 'seum-ni-da',
    '했습니다': 'haess-seum-ni-da',
    '갔습니다': 'gass-seum-ni-da',
    '왔습니다': 'wass-seum-ni-da',
    '봤습니다': 'bwass-seum-ni-da',
    '구경했습니다': 'gu-gyeong-haess-seum-ni-da',
    
    // Particles
    '에서': 'e-seo',
    '에게': 'e-ge',
    '에만': 'e-man',
    '에도': 'e-do',
    '은는': 'eun-neun',
    '을를': 'eul-reul',
    
    // Time expressions
    '일곱시': 'il-gop-si',
    '여덟시': 'yeo-deol-si',
    '아홉시': 'a-hop-si',
    '열시': 'yeol-si',
    '점심시간': 'jeom-sim-si-gan',
    '저녁시간': 'jeo-nyeok-si-gan',
    
    // Common compounds
    '변화시키고': 'byeon-hwa-si-ki-go',
    '중요성': 'jung-yo-seong',
    '평생교육': 'pyeong-saeng-gyo-yug',
    '자갈치시장': 'ja-gal-chi-si-jang',
    '김수진': 'gim-su-jin',
    
    // Common verbs and adjectives  
    '좋아요': 'jo-a-yo',
    '좋습니다': 'jo-seum-ni-da',
    '안녕하세요': 'an-nyeong-ha-se-yo',
    '감사합니다': 'gam-sa-ham-ni-da',
    '죄송합니다': 'joe-song-ham-ni-da'
  };
  
  Object.entries(commonPatterns).forEach(([korean, correctRomanization]) => {
    if (originalText.includes(korean)) {
      const pattern = new RegExp(`${korean}[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\(([^)]+)\\)`);
      const match = romanizedText.match(pattern);
      if (match && match[1] !== correctRomanization) {
        issues.push(`Incorrect romanization: ${korean}(${match[1]})`);
        suggestions.push(`Use standard romanization: ${korean}(${correctRomanization})`);
      }
    }
  });
  
  // Check 5: Formal ending completeness
  const formalEndingPatterns = [
    { pattern: /습니다[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]*\)/g, check: 'seum-ni-da', description: 'Formal polite ending' },
    { pattern: /었습니다[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]*\)/g, check: 'eoss-seum-ni-da', description: 'Past formal ending' },
    { pattern: /았습니다[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]*\)/g, check: 'ass-seum-ni-da', description: 'Past formal ending' },
    { pattern: /였습니다[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]*\)/g, check: 'yeoss-seum-ni-da', description: 'Past formal ending' }
  ];
  
  formalEndingPatterns.forEach(({ pattern, check, description }) => {
    const matches = romanizedText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const romanizedPart = match.match(/\(([^)]+)\)/)?.[1];
        if (romanizedPart && !romanizedPart.includes(check.split('-').pop() || '')) {
          issues.push(`Incomplete formal ending: ${description} should end with proper romanization`);
          suggestions.push(`Ensure formal endings are complete (e.g., -seum-ni-da)`);
        }
      });
    }
  });
  
  // Check 6: Common compound word boundary validation
  const compoundBoundaryChecks = [
    { word: '평생교육', expected: 'pyeong-saeng-gyo-yug', description: 'Compound should maintain clear syllable boundaries' },
    { word: '자갈치시장', expected: 'ja-gal-chi-si-jang', description: 'Place names should have clear boundaries' },
    { word: '점심시간', expected: 'jeom-sim-si-gan', description: 'Time compounds should have clear boundaries' }
  ];
  
  compoundBoundaryChecks.forEach(({ word, expected, description }) => {
    if (originalText.includes(word)) {
      const pattern = new RegExp(`${word}[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\(([^)]+)\\)`);
      const match = romanizedText.match(pattern);
      if (match && match[1] && !match[1].includes('-')) {
        issues.push(`Missing syllable boundaries in compound: ${word}`);
        suggestions.push(`Use clear boundaries: ${word}(${expected}) - ${description}`);
      }
    }
  });
  
  // Calculate accuracy score
  const maxIssues = Math.max(1, totalKoreanCount / 3); // Reasonable max issues threshold
  const accuracy = Math.max(0, Math.round(100 - (issues.length / maxIssues) * 100));
  
  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
    accuracy,
    details: `Checked ${totalKoreanCount} Korean characters, found ${issues.length} issues. Accuracy: ${accuracy}%`
  };
}

/**
 * Exported validation functions for use in other parts of the app
 */
export { validateJapaneseFurigana, validateKoreanRomanization }; 