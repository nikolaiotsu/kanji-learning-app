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
  de: 'German'
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
      default: return forcedLanguage; // Return the forced language code instead of "unknown"
    }
  }

  // Count characters by language category
  let russianChars = 0;
  let japaneseChars = 0;
  let chineseChars = 0;
  let koreanChars = 0;
  let arabicChars = 0;
  
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
  }
  
  // Check for Italian based on patterns (simpler approach)
  if (containsItalianText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars)) {
    return "Italian";
  }
  
  // Check for Tagalog based on patterns
  if (containsTagalogText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars)) {
    return "Tagalog";
  }
  
  // Check for French based on patterns
  if (containsFrenchText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars)) {
    return "French";
  }
  
  // Check for Spanish based on patterns
  if (containsSpanishText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars)) {
    return "Spanish";
  }
  
  // Check for Portuguese based on patterns
  if (containsPortugueseText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars)) {
    return "Portuguese";
  }
  
  // Check for German based on patterns
  if (containsGermanText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars)) {
    return "German";
  }
  
  // Return language with highest character count
  const counts = [
    { lang: "Russian", count: russianChars },
    { lang: "Japanese", count: japaneseChars },
    { lang: "Chinese", count: chineseChars },
    { lang: "Korean", count: koreanChars },
    { lang: "Arabic", count: arabicChars }
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
    
    // For Japanese forced mode, require hiragana/katakana presence
    if (expectedLanguage === 'Japanese' && !containsJapanese(text)) {
      console.log('[validateTextMatchesLanguage] Japanese expected but no Japanese characters found');
      return false;
    }
    
    // Add additional debugging for Japanese validation
    if (expectedLanguage === 'Japanese') {
      console.log(`[validateTextMatchesLanguage] Japanese validation: containsJapanese=${containsJapanese(text)}`);
      console.log(`[validateTextMatchesLanguage] Japanese validation: containsChinese=${containsChinese(text)}`);
      console.log(`[validateTextMatchesLanguage] Text sample: "${text.substring(0, 50)}..."`);
    }
    // For Korean forced mode, require Hangul presence
    if (expectedLanguage === 'Korean' && !containsKoreanText(text)) {
      console.log('[validateTextMatchesLanguage] Korean expected but no Korean characters found');
      return false;
    }
    // For Chinese forced mode, require Chinese characters without significant Japanese kana
    if (expectedLanguage === 'Chinese' && (containsJapanese(text) || !containsChinese(text))) {
      console.log('[validateTextMatchesLanguage] Chinese expected but found Japanese or no Chinese characters');
      return false;
    }
  }
  
  // Case 2: Latin-based languages (English, Italian, Spanish, etc.)
  // These can be harder to distinguish from each other, but we can check for language-specific patterns
  const latinLanguages = ['English', 'Italian', 'Spanish', 'French', 'Portuguese', 'German'];
  if (latinLanguages.includes(expectedLanguage) && latinLanguages.includes(detectedLang)) {
    console.log('[validateTextMatchesLanguage] Handling Latin language validation');
    console.log(`[validateTextMatchesLanguage] Expected: ${expectedLanguage}, Detected: ${detectedLang}`);
    
    // Check for language-specific patterns when that language is forced
    
    // Check for Italian-specific patterns when Italian is forced
    if (expectedLanguage === 'Italian' && containsItalianText(text)) {
      console.log('[validateTextMatchesLanguage] Italian patterns found, returning true');
      return true;
    }
    
    // Check for French-specific patterns when French is forced
    if (expectedLanguage === 'French' && containsFrenchText(text)) {
      console.log('[validateTextMatchesLanguage] French patterns found, returning true');
      return true;
    }
    
    // Check for Spanish-specific patterns when Spanish is forced
    if (expectedLanguage === 'Spanish' && containsSpanishText(text)) {
      console.log('[validateTextMatchesLanguage] Spanish patterns found, returning true');
      return true;
    }
    
    // Check for Portuguese-specific patterns when Portuguese is forced
    if (expectedLanguage === 'Portuguese' && containsPortugueseText(text)) {
      console.log('[validateTextMatchesLanguage] Portuguese patterns found, returning true');
      return true;
    }
    
    // Check for German-specific patterns when German is forced
    if (expectedLanguage === 'German' && containsGermanText(text)) {
      console.log('[validateTextMatchesLanguage] German patterns found, returning true');
      return true;
    }
    
    // Check for Tagalog-specific patterns when Tagalog is forced
    if (expectedLanguage === 'Tagalog' && containsTagalogText(text)) {
      console.log('[validateTextMatchesLanguage] Tagalog patterns found, returning true');
      return true;
    }
    
    // Check for English-specific patterns when English is forced
    if (expectedLanguage === 'English' && containsEnglishText(text)) {
      console.log('[validateTextMatchesLanguage] English patterns found, returning true');
      return true;
    }
    
    // Additional validation completed for all supported languages
    
    // If the expected language doesn't match the detected language and we can't find
    // specific patterns for the expected language, return false
    if (expectedLanguage !== detectedLang) {
      console.log(`[validateTextMatchesLanguage] Expected ${expectedLanguage} !== Detected ${detectedLang}, returning false`);
      return false;
    }
    
    // If both expected and detected are the same, allow it
    console.log('[validateTextMatchesLanguage] Expected and detected languages match, returning true');
    return true;
  }
  
  // Standard comparison for other languages
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
      } else if (primaryLanguage === "Chinese") {
        console.log(`[DEBUG] Using Chinese prompt (pinyin) for primaryLanguage: ${primaryLanguage}`);
        // Chinese-specific prompt with pinyin
        userMessage = `
${promptTopSection}
You are a Chinese language expert. I need you to analyze and translate this text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR CHINESE TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- For each Chinese character or word, add the Hanyu Pinyin romanization in parentheses immediately after
- Do NOT add romanization to English words or numbers
- The pinyin should include tone marks (e.g., "你好" should become "你好(nǐ hǎo)")
- Do NOT use Japanese furigana/hiragana style - only use pinyin with Latin characters and tone marks
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Example of correct Chinese pinyin formatting:
- "中国" should become "中国(zhōngguó)"
- "我爱你" should become "我爱你(wǒ ài nǐ)"
- NOT "中国(ちゅうごく)" or any other non-pinyin format

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Chinese text with pinyin after each character/word as described",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Korean") {
        // Korean-specific prompt with Revised Romanization
        userMessage = `
${promptTopSection}
You are a Korean language expert. I need you to analyze and translate this text: "${text}"

IMPORTANT: You must follow this EXACT format:
- Keep all original text as is (including any English words, numbers, or punctuation)
- For each Korean word, add the Revised Romanization in parentheses immediately after
- Do NOT add romanization to English words or numbers
- Follow the official Revised Romanization system rules
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Korean text with Revised Romanization after each word in parentheses",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Russian") {
        // Russian-specific prompt with Practical Romanization
        userMessage = `
${promptTopSection}
You are a Russian language expert. I need you to analyze and translate this text: "${text}"

IMPORTANT: You must follow this EXACT format:
- Keep all original text as is (including any English words, numbers, or punctuation)
- For each Russian word, add the Practical Romanization in parentheses immediately after
- Do NOT add romanization to English words or numbers
- Follow practical, easy-to-read romanization standards
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Russian text with Practical Romanization after each word in parentheses",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Arabic") {
        // Arabic-specific prompt with Arabic Chat Alphabet
        userMessage = `
${promptTopSection}
You are an Arabic language expert. I need you to analyze and translate this text: "${text}"

IMPORTANT: You must follow this EXACT format:
- Keep all original text as is (including any English words, numbers, or punctuation)
- For each Arabic word, add the Arabic Chat Alphabet (Franco-Arabic) transliteration in parentheses immediately after
- Do NOT add transliteration to English words or numbers
- Follow common Arabic Chat Alphabet conventions used in online messaging
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Arabic text with Arabic Chat Alphabet transliteration after each word in parentheses",
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
            const jsonString = jsonMatch ? jsonMatch[0] : textContent.text;
            const parsedContent = JSON.parse(jsonString);
            
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
                        const retryJsonString = retryJsonMatch ? retryJsonMatch[0] : retryTextContent.text;
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