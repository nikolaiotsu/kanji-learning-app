import Constants from 'expo-constants';
import axios, { AxiosError } from 'axios';
import { Alert } from 'react-native';
import { apiLogger, logClaudeAPI, APIUsageMetrics } from './apiUsageLogger';
import { validateTextLength } from '../utils/inputValidation';
import { logger } from '../utils/logger';
import { sanitizeKoreanRomanization, analyzeKoreanRomanization } from './koreanRomanizationGuards';
import { fetchSubscriptionStatus, getSubscriptionPlan } from './receiptValidationService';

// Minimum prompt length (tokens) for prompt caching to apply. Haiku 4.5 requires 4096; Haiku 3.x required 2048.
// See https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#cache-limitations
const MIN_CACHEABLE_TOKENS_HAIKU_45 = 4096;

// Lite Japanese system prompt for WordScope (J→E etc.) - bare minimum
const japaneseWordScopeSystemPromptLite = `Japanese expert: translation + furigana + grammar. Translate naturally; no readings in translation. Furigana: hiragana in ( ) after every kanji word. Be extra careful with compound words; double-check furigana against standard dictionary readings—do not combine individual kanji readings phonetically. Leave hiragana/katakana/numbers/English unchanged; never convert hiragana to kanji. Format: 東京(とうきょう), hiragana only. Respond with JSON: readingsText, translatedText, scopeAnalysis. Do NOT add "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes in strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;

// Lite Japanese system prompt for translation-only (no scope). Haiku 4.5 can follow minimal instructions.
const japaneseTranslationSystemPromptLite = `You are a Japanese translation and furigana expert.

Translate into natural, fluent target language. Preserve meaning and tone. Do not add readings to the translation.

Be extra careful with compound words. Double check the dictionary readings for compounds.

Furigana: For every word containing kanji, add hiragana readings in parentheses immediately after it. Use standard dictionary readings for compounds. Format: 東京(とうきょう). Leave hiragana, katakana, numbers, and English unchanged. Never add furigana to kana-only words. Never convert hiragana to kanji.

Double check that you have included the appropriate furigana for all the words in the text if appropriate.

OUTPUT: Reply with ONLY the JSON object. No preamble, no explanation of the text, no commentary, no notes. translatedText must contain ONLY the translation—nothing else. Do NOT add phrases like "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes. No trailing commas. Example: {"readingsText":"...","translatedText":"..."}`;

// Lite Chinese system prompt for translation-only (no scope). Context-appropriate for pinyin/tone difficulties.
const chineseTranslationSystemPromptLite = `You are a Chinese translation and pinyin expert.

Translate into natural, fluent target language. Preserve meaning and tone. Do not add pinyin to the translation.

Pinyin: Use Hanyu Pinyin with tone marks (ā é ǐ ò ū ǖ). readingsText MUST be the original Chinese text with pinyin in parentheses immediately after each word or character so the app can show pinyin on top. No space before (. WRONG: "※ jià gé hán fú wù fèi" (pinyin only). CORRECT: "※价(jià)格(gé)含(hán)服(fú)务(wù)费(fèi)" (Chinese then (pinyin) for each part). Format: 中文(zhōngwén) or 价格(jiàgé) for compounds. Tone sandhi: 不 bú before 4th (不是 búshì), 一 yī/yí/yì by context, 3rd+3rd→2nd+3rd (你好 níhǎo). Neutral: 的(de), 了(le), 吗(ma). Polyphonic: 行 háng vs xíng by context. Leave English, numbers, symbols unchanged.

Double-check: compound readings and tone sandhi correct; readingsText is inline 汉字(pinyin) for every part so pinyin displays on top of characters.

OUTPUT: Reply with ONLY the JSON object. No preamble, no explanation of the text, no commentary, no notes. translatedText must contain ONLY the translation—nothing else. Do NOT add phrases like "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes. No trailing commas. Example: {"readingsText":"※价(jià)格(gé)含(hán)服(fú)务(wù)费(fèi)","translatedText":"..."}`;

// Lite Chinese system prompt for WordScope (translation + pinyin + grammar). Same principles as Japanese lite.
const chineseWordScopeSystemPromptLite = `Chinese expert: translation + pinyin + grammar. Translate naturally; no readings in translation. readingsText MUST be original Chinese with pinyin in ( ) immediately after each word/character so the app shows pinyin on top. WRONG: pinyin only or on separate line (e.g. "jià gé hán fú wù fèi"). CORRECT: inline 价(jià)格(gé)含(hán)服(fú)务(wù)费(fèi)—no space before (. Format: 中文(zhōngwén) or 价格(jiàgé) for compounds. Tone sandhi: 不 bú, 一 yī/yí/yì, 3rd+3rd→2nd+3rd. Neutral: 的(de), 了(le), 吗(ma). Polyphonic by context. Leave English/numbers/symbols unchanged. Respond with JSON: readingsText, translatedText, scopeAnalysis. Do NOT add "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes in strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;

// Lite Korean system prompt for translation-only (no scope). Same principles as Japanese/Chinese/Arabic/Hindi/Thai lite.
const koreanTranslationSystemPromptLite = `You are a Korean translation and Revised Romanization expert.

Translate into natural, fluent target language. Preserve meaning and tone. Do not add romanization to the translation itself.

Romanization: readingsText MUST be original 한글 with romanization in parentheses immediately after each word. Format: 문법(mun-beop) 포인트(po-in-teu). No space before (. Revised Romanization: ㅓ=eo, ㅗ=o, ㅡ=eu, ㅜ=u; 받침 rules (e.g. ㄱ+ㄱ=kk, ㄷ+ㄷ=tt); particles 이(i)/가(ga), 은(eun)/는(neun), 을(eul)/를(reul). Leave English/numbers unchanged.

OUTPUT: Reply with ONLY the JSON object. No preamble, no explanation, no commentary. translatedText must contain ONLY the translation—nothing else. Do NOT add phrases like "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes. No trailing commas. Example: {"readingsText":"안녕하세요(an-nyeong-ha-se-yo)","translatedText":"..."}`;

// Lite Korean system prompt for WordScope (translation + romanization + grammar).
const koreanWordScopeSystemPromptLite = `Korean expert: translation + Revised Romanization + grammar. Translate naturally; no romanization in translation. readingsText MUST be original 한글 with (romanization) after each word. Format: 문법(mun-beop) 포인트(po-in-teu). 받침 rules; particles i/ga, eun/neun, eul/reul. Leave English/numbers unchanged. Respond with JSON: readingsText, translatedText, scopeAnalysis. Do NOT add "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes in strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;

// Lite Arabic system prompt for translation-only (no scope). Same principles as Japanese/Chinese lite.
const arabicTranslationSystemPromptLite = `You are an Arabic translation and transliteration expert.

Translate into natural, fluent target language. Preserve meaning and tone. Do not add transliteration to the translation itself.

Transliteration: readingsText MUST be original Arabic with transliteration in parentheses immediately after each word. Format: العربية(al-'arabiyyah). No space before (. Sun letter assimilation: الـ before ت ث د ذ ر ز س ش ص ض ط ظ ل ن assimilates (e.g. الشمس = ash-shams not al-shams). Moon letters keep al-. Long vowels: ا/ى = aa, و = uu/oo, ي = ii/ee. Hamza = '. Use only ASCII (a-z, '); no diacritics (no ṣ, ḍ, ṭ). Leave English/numbers unchanged.

OUTPUT: Reply with ONLY the JSON object. No preamble, no explanation, no commentary. translatedText must contain ONLY the translation—nothing else. Do NOT add phrases like "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes. No trailing commas. Example: {"readingsText":"مرحبا(marhabaa)","translatedText":"..."}`;

// Lite Arabic system prompt for WordScope (translation + transliteration + grammar).
const arabicWordScopeSystemPromptLite = `Arabic expert: translation + transliteration + grammar. Translate naturally; no transliteration in translation. readingsText MUST be original Arabic with (transliteration) after each word. Format: العربية(al-'arabiyyah). Sun letter assimilation (الـ before sun letters → ash-shams not al-shams). Long vowels aa/ii/uu; hamza '. ASCII only, no diacritics. Leave English/numbers unchanged. Respond with JSON: readingsText, translatedText, scopeAnalysis. Do NOT add "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes in strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;

// Lite Hindi system prompt for translation-only (no scope). Same principles as Japanese/Chinese/Arabic lite.
const hindiTranslationSystemPromptLite = `You are a Hindi translation and IAST romanization expert.

Translate into natural, fluent target language. Preserve meaning and tone. Do not add romanization to the translation itself.

Romanization: readingsText MUST be original Devanagari with IAST in parentheses immediately after each word. Format: हिन्दी(hindī). No space before (. IAST: long vowels ā ī ū (आ ई ऊ); retroflex ṭ ṭh ḍ ḍh ṇ; sibilants ś (श) ṣ (ष) s (स); compound क्ष = kṣ, ज्ञ = jñ; anusvara ṃ. Leave English/numbers unchanged.

OUTPUT: Reply with ONLY the JSON object. No preamble, no explanation, no commentary. translatedText must contain ONLY the translation—nothing else. Do NOT add phrases like "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes. No trailing commas. Example: {"readingsText":"नमस्ते(namaste)","translatedText":"..."}`;

// Lite Hindi system prompt for WordScope (translation + romanization + grammar).
const hindiWordScopeSystemPromptLite = `Hindi expert: translation + IAST romanization + grammar. Translate naturally; no romanization in translation. readingsText MUST be original Devanagari with (IAST) after each word. Format: हिन्दी(hindī). Long vowels ā ī ū; retroflex ṭ ḍ ṇ; sibilants ś ṣ s; compound kṣ, jñ. Leave English/numbers unchanged. Respond with JSON: readingsText, translatedText, scopeAnalysis. Do NOT add "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes in strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;

// Lite Thai system prompt for translation-only (no scope). Same principles as Japanese/Chinese/Arabic/Hindi lite.
const thaiTranslationSystemPromptLite = `You are a Thai translation and RTGS romanization expert.

Translate into natural, fluent target language. Preserve meaning and tone. Do not add romanization to the translation itself.

Romanization: readingsText MUST be original Thai with RTGS in parentheses immediately after each word. Format: สวัสดี(sawatdee). No space before (. RTGS: no tone marks; aspirated ph, th, kh, ch; long vowels aa, ii, uu, ee, oo; diphthongs ai, ao, ue, oi; silent อ at syllable start; ng for ง. Leave English/numbers unchanged.

OUTPUT: Reply with ONLY the JSON object. No preamble, no explanation, no commentary. translatedText must contain ONLY the translation—nothing else. Do NOT add phrases like "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes. No trailing commas. Example: {"readingsText":"สวัสดี(sawatdee)","translatedText":"..."}`;

// Lite Thai system prompt for WordScope (translation + romanization + grammar).
const thaiWordScopeSystemPromptLite = `Thai expert: translation + RTGS romanization + grammar. Translate naturally; no romanization in translation. readingsText MUST be original Thai with (RTGS) after each word. Format: สวัสดี(sawatdee). Aspirated ph/th/kh/ch; long vowels aa/ii/uu/ee/oo; no tone marks. Leave English/numbers unchanged. Respond with JSON: readingsText, translatedText, scopeAnalysis. Do NOT add "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes in strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;

// Lite Russian system prompt for translation-only (no scope). Requests Cyrillic + Latin romanization.
const russianTranslationSystemPromptLite = `You are a Russian translation and romanization expert.

Translate into natural, fluent target language. Preserve meaning and tone. Do not add romanization to the translation itself.

Romanization: readingsText MUST be original Cyrillic with Latin romanization in parentheses immediately after each word. Format: Привет(privet) Русский(russkiy). No space before (. Use standard ISO 9 or common Latin transliteration: ё=yo, й=y, ы=y, щ=shch, ч=ch, ш=sh, ж=zh, ц=ts, х=kh; soft sign ь = ' (apostrophe) or omit; hard sign ъ = " or omit. Leave English/numbers unchanged.

OUTPUT: Reply with ONLY the JSON object. No preamble, no explanation, no commentary. translatedText must contain ONLY the translation—nothing else. Do NOT add phrases like "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes. No trailing commas. Example: {"readingsText":"Привет(privet)","translatedText":"..."}`;

// Lite Russian system prompt for WordScope (translation + romanization + grammar).
const russianWordScopeSystemPromptLite = `Russian expert: translation + Latin romanization + grammar. Translate naturally; no romanization in translation. readingsText MUST be original Cyrillic with (romanization) after each word. Format: Привет(privet) Русский(russkiy). Standard transliteration: ё=yo, щ=shch, ч=ch, ш=sh, ж=zh, ы=y. Leave English/numbers unchanged. Respond with JSON: readingsText, translatedText, scopeAnalysis. Do NOT add "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes in strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;

// Minimal prompt for English→any (no WordScope)
const simpleTranslationPromptLite = `Translate to the requested target language. Natural, fluent output only. No readings/romanization in translation. Output ONLY the JSON object: {"readingsText": "", "translatedText": "translation"}. No preamble, no explanation, no commentary. translatedText must be ONLY the translation—nothing else. Do NOT add phrases like "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes in strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;

// All flows use lite prompts (Haiku 4.5 optimized). Heavy prompts removed.
const USE_LITE_PROMPTS = true;

// Lite system prompt for WordScope - bare minimum; language rules injected at runtime
function buildGeneralLanguageSystemPromptLite(sourceLanguage: string): string {
  const languageRules = getLanguageFamilyRules(sourceLanguage);
  const rulesBlock = languageRules ? `\n${languageRules}\n` : '';
  return `Translation + grammar expert. Translate naturally; preserve meaning/tone; no romanization in translation. Grammar: analyze SOURCE only. Format: word1 [label] + word2 [label] + ... all words; labels in TARGET. Example sentences in SOURCE; translation, note, explanation, reason, nuance in TARGET. Mistake: wrong/correct in SOURCE, reason in TARGET. All WordScope explanations and learner-facing text (explanation, note, translation, reason, nuance) MUST be in the TARGET language. Double-check that scope output is in target language, not source.${rulesBlock}JSON: readingsText, translatedText, scopeAnalysis. Do NOT add "This means...", "Here is...", or any explanation inside or outside the JSON. Escape JSON: \\" for quotes in strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;
}

/** Lite scope instructions - bare minimum; schema in user message. */
function buildScopeInstructionsLite(
  normalizedText: string,
  sourceLangName: string,
  targetLangName: string
): string {
  return `Analyze "${normalizedText}" as ${sourceLangName} teacher for ${targetLangName} speaker.
partOfSpeech: word1 [label] + word2 [label] + ... all words from source; labels in ${targetLangName}.
examples: 3 items; sentence in ${sourceLangName}, translation and note in ${targetLangName}. synonyms: 3 items; phrase in ${sourceLangName}, translation and nuance in ${targetLangName}. grammar.explanation, commonMistake.reason in ${targetLangName}. All explanations and learner-facing text in ${targetLangName} only. Double-check. Period-end sentence-like fields. particles/baseForm only if needed (JA/KO).`;
}

// Language validation caching system to reduce API costs
interface CachedValidationResult {
  result: { isValid: boolean; detectedLanguage: string; confidence: string };
  timestamp: number;
}

const validationCache = new Map<string, CachedValidationResult>();
const VALIDATION_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

function getCachedValidation(text: string, forcedLanguage: string): CachedValidationResult['result'] | null {
  const key = `${forcedLanguage}:${text.substring(0, 200)}`; // Use first 200 chars as key
  const cached = validationCache.get(key);

  logger.log(`[Cache Debug] Looking for key: ${key.substring(0, 50)}...`);
  logger.log(`[Cache Debug] Cache has ${validationCache.size} entries`);

  if (cached) {
    const age = Date.now() - cached.timestamp;
    logger.log(`[Cache Debug] Found cached entry, age: ${Math.round(age/1000)}s (${cached.result.isValid ? 'valid' : 'invalid'})`);
    if (age < VALIDATION_CACHE_DURATION) {
      logger.log(`[Cache Debug] ✅ Using cached result for ${forcedLanguage}!`);
      return cached.result;
    } else {
      logger.log(`[Cache Debug] ❌ Cache expired (${Math.round(VALIDATION_CACHE_DURATION/60000)}min limit), removing`);
      validationCache.delete(key);
    }
  } else {
    logger.log(`[Cache Debug] No cached entry found for this text`);
  }

  return null;
}

function setCachedValidation(text: string, forcedLanguage: string, result: CachedValidationResult['result']) {
  const key = `${forcedLanguage}:${text.substring(0, 200)}`;
  validationCache.set(key, { result, timestamp: Date.now() });
  logger.log(`[Validation Cache] Cached result for ${forcedLanguage}`);
}

// Quality assessment interface
interface QualityAssessment {
  score: number; // 0-100
  needsVerification: boolean;
  reasons: string[];
}

// Smart verification quality assessment function
function assessTranslationQuality(
  translatedText: string,
  targetLanguage: string,
  originalTextLength: number
): QualityAssessment {
  let score = 100;
  const reasons: string[] = [];

  // Length check - suspiciously short translations
  const minExpectedLength = Math.max(3, Math.floor(originalTextLength * 0.3));
  if (translatedText.length < minExpectedLength) {
    const lengthPenalty = Math.min(50, (minExpectedLength - translatedText.length) * 5);
    score -= lengthPenalty;
    reasons.push(`Too short (${translatedText.length} chars, expected >${minExpectedLength})`);
  }

  // Language pattern check - should contain expected character sets
  const hasExpectedChars = checkLanguageCharacterPatterns(translatedText, targetLanguage);
  if (!hasExpectedChars) {
    score -= 30;
    reasons.push(`Missing expected ${targetLanguage} characters`);
  }

  // Error pattern check - contains API errors or failure messages
  if (containsErrorPatterns(translatedText)) {
    score -= 60;
    reasons.push('Contains error messages or API failures');
  }

  // JSON structure check - should not contain raw JSON artifacts
  if (containsJsonArtifacts(translatedText)) {
    score -= 40;
    reasons.push('Contains JSON parsing artifacts');
  }

  // Cap score at 0
  score = Math.max(0, score);

  return {
    score,
    needsVerification: score < 70, // Conservative threshold
    reasons
  };
}

// Check if translation contains expected language character patterns
function checkLanguageCharacterPatterns(text: string, language: string): boolean {
  const patterns = {
    'ja': /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/, // Hiragana, Katakana, Kanji
    'zh': /[\u4e00-\u9fff]/,                            // Chinese characters
    'ko': /[\uac00-\ud7af\u1100-\u11ff]/,              // Korean
    'ru': /[\u0400-\u04ff]/,                            // Cyrillic
    'ar': /[\u0600-\u06ff]/,                            // Arabic
    'hi': /[\u0900-\u097f]/,                            // Devanagari
    'th': /[\u0E00-\u0E7F]/                             // Thai
  };

  // For languages with specific character sets, check for presence
  if (patterns[language as keyof typeof patterns]) {
    return patterns[language as keyof typeof patterns].test(text);
  }

  // For Latin languages (en, fr, es, etc.), absence of CJK chars is good
  // and presence of Latin chars is expected
  const isLatinLanguage = ['en', 'fr', 'es', 'it', 'pt', 'de', 'tl', 'eo', 'vi'].includes(language);
  if (isLatinLanguage) {
    const hasLatinChars = /[a-zA-Z]/.test(text);
    const hasUnexpectedCJK = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uac00-\ud7af]/.test(text);
    return hasLatinChars && !hasUnexpectedCJK;
  }

  // For other languages, be permissive
  return text.length > 0;
}

// Check for error patterns in translation
function containsErrorPatterns(text: string): boolean {
  const errorPatterns = [
    /error/i,
    /failed/i,
    /exception/i,
    /timeout/i,
    /rate limit/i,
    /invalid/i,
    /malformed/i,
    /parsing error/i,
    /api error/i,
    /token limit/i
  ];

  return errorPatterns.some(pattern => pattern.test(text));
}

// Check for JSON parsing artifacts that shouldn't be in final translation
function containsJsonArtifacts(text: string): boolean {
  const jsonArtifacts = [
    /"readingsText"\s*:/,
    /"translatedText"\s*:/,
    /"isComplete"\s*:/,
    /\{[\s\S]*\}/,  // JSON objects
    /,[\s\S]*\}/    // Trailing commas
  ];

  return jsonArtifacts.some(pattern => pattern.test(text));
}
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
  containsThaiText,
  containsVietnameseText,
  containsEsperantoText,
  containsKanji,
  normalizeQuotationMarks
} from '../utils/textFormatting';

// Define response structure
export interface LanguageMismatchInfo {
  expectedLanguageCode: string;
  detectedLanguageName: string;
  detectedLanguageCode?: string;
  confidence?: string;
}

export interface ClaudeResponse {
  readingsText: string;
  translatedText: string;
  scopeAnalysis?: string; // Optional scope analysis field
  languageMismatch?: LanguageMismatchInfo;
  /** For beta testing: token usage for this API call (input + output = total) */
  tokenUsage?: { input: number; output: number; total: number };
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
  eo: 'Esperanto',
  th: 'Thai',
  vi: 'Vietnamese'
};

const LANGUAGE_NAME_TO_CODE: Record<string, string> = Object.entries(LANGUAGE_NAMES_MAP)
  .reduce<Record<string, string>>((acc, [code, name]) => {
    acc[name] = code;
    return acc;
  }, {});

// Helper function to get grammar labels in the target language
function getGrammarLabels(targetLanguage: string): string {
  const labels: Record<string, string> = {
    'ja': '名詞, 動詞, 形容詞, 副詞, 代名詞, 助詞, 助動詞, 接続詞, 感動詞, 連体詞, 接頭辞, 接尾辞, 固有名詞, 数詞',
    'zh': '名词, 动词, 形容词, 副词, 代词, 介词, 连词, 助词, 量词, 数词, 叹词, 专有名词',
    'ko': '명사, 동사, 형용사, 부사, 대명사, 조사, 접속사, 감탄사, 수사, 관형사',
    'fr': 'nom, verbe, adjectif, adverbe, pronom, préposition, article, conjonction, déterminant, interjection',
    'es': 'sustantivo, verbo, adjetivo, adverbio, pronombre, preposición, artículo, conjunción, determinante, interjección',
    'de': 'Substantiv, Verb, Adjektiv, Adverb, Pronomen, Präposition, Artikel, Konjunktion, Interjektion',
    'it': 'sostantivo, verbo, aggettivo, avverbio, pronome, preposizione, articolo, congiunzione, interiezione',
    'pt': 'substantivo, verbo, adjetivo, advérbio, pronome, preposição, artigo, conjunção, interjeição',
    'ru': 'существительное, глагол, прилагательное, наречие, местоимение, предлог, союз, междометие',
    'ar': 'اسم, فعل, صفة, ظرف, ضمير, حرف جر, حرف عطف, أداة التعريف',
    'hi': 'संज्ञा, क्रिया, विशेषण, क्रिया विशेषण, सर्वनाम, संबंधबोधक, समुच्चयबोधक',
    'th': 'คำนาม, คำกริยา, คำคุณศัพท์, คำวิเศษณ์, คำสรรพนาม, คำบุพบท, คำสันธาน',
    'vi': 'danh từ, động từ, tính từ, trạng từ, đại từ, giới từ, liên từ, thán từ',
    'tl': 'pangngalan, pandiwa, pang-uri, pang-abay, panghalip, pang-ukol, pangatnig',
    'eo': 'substantivo, verbo, adjektivo, adverbo, pronomo, prepozicio, artikolo, konjunkcio',
  };
  
  // Default to English if language not found
  return labels[targetLanguage] || 'noun, verb, adjective, adverb, pronoun, preposition, article, conjunction, auxiliary verb, modal verb, past participle, present participle, infinitive, gerund, relative pronoun, possessive, determiner, interjection, proper noun, cardinal number, ordinal number, reflexive pronoun, definite article, indefinite article';
}

/** Returns only the grammar rules relevant to the source language (for lite prompts). */
function getLanguageFamilyRules(sourceLanguage: string): string {
  const rules: Record<string, string> = {
    ja: `FOR JAPANESE:
- Identify particles and their grammatical functions
- Note verb conjugation patterns (polite, plain, potential, etc.)
- Watch for topic vs subject marking (は vs が)`,
    zh: `FOR CHINESE:
- Note measure word/classifier usage
- Identify aspect markers (了, 过, 着)
- Watch for topic-comment structure`,
    ko: `FOR KOREAN:
- Identify particles and honorific levels
- Note verb endings for politeness/formality
- Watch for SOV word order`,
    fr: `FOR FRENCH: Note gender/number agreement, subjunctive mood, object pronoun placement.`,
    es: `FOR SPANISH: Note gender/number agreement, ser vs estar, subjunctive triggers.`,
    it: `FOR ITALIAN: Note gender/number agreement, subjunctive, object pronoun placement.`,
    pt: `FOR PORTUGUESE: Note gender/number agreement, subjunctive, reflexive verbs.`,
    de: `FOR GERMAN: Note case (nominative, accusative, dative, genitive), verb position (V2), separable prefixes.`,
    ru: `FOR RUSSIAN: Note case (6 cases), aspect (perfective/imperfective), gender/number agreement.`,
    ar: `FOR ARABIC: Note root system, gender agreement, definite article, word order (VSO/SVO).`,
    hi: `FOR HINDI: Note postpositions (not prepositions), ergative in past tense, honorific forms.`,
    th: `FOR THAI: Note classifiers, particles (question/politeness), topic-comment, no conjugation.`,
    vi: `FOR VIETNAMESE: Note classifiers, particles, serial verbs, topic-comment, no conjugation.`,
    tl: `FOR TAGALOG: Note focus system, particles (ang, ng, sa), verb affixes.`,
    eo: `FOR ESPERANTO: Note regular grammar, word-building through affixes, consistent part-of-speech markers.`,
    en: `FOR ENGLISH: Note articles (a/the), phrasal verbs, auxiliary verbs, tense/aspect.`,
  };
  return rules[sourceLanguage] || '';
}

function getLanguageCodeFromName(name?: string): string | undefined {
  if (!name) {
    return undefined;
  }

  return LANGUAGE_NAME_TO_CODE[name];
}

function buildLanguageMismatchInfo(expectedCode: string, detectedName?: string, confidence?: string): LanguageMismatchInfo {
  const normalizedName = detectedName || 'Unknown';
  return {
    expectedLanguageCode: expectedCode,
    detectedLanguageName: normalizedName,
    detectedLanguageCode: getLanguageCodeFromName(normalizedName),
    confidence
  };
}

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
  
  logger.log('🧹 Starting cleanup for:', cleaned.substring(0, 100) + '...');

  const isInlineComma = (commaIndex: number): boolean => {
    if (commaIndex < 0 || commaIndex >= cleaned.length) {
      return false;
    }

    let lookAhead = commaIndex + 1;
    while (lookAhead < cleaned.length && /\s/.test(cleaned[lookAhead])) {
      lookAhead++;
    }

    if (lookAhead >= cleaned.length) {
      return false;
    }

    const lookAheadChar = cleaned[lookAhead];
    return lookAheadChar !== '"' && lookAheadChar !== '}' && lookAheadChar !== ']';
  };

  const logInlineQuoteDetection = (context: 'furigana' | 'translation', pointer: number) => {
    const snippetStart = Math.max(pointer - 15, 0);
    const snippetEnd = Math.min(pointer + 25, cleaned.length);
    const snippet = cleaned.substring(snippetStart, snippetEnd);
    logger.log(`[cleanJsonString] inline quote/comma detected inside ${context} field. Snippet: ${snippet}`);
  };
  
  // EMERGENCY APPROACH: Extract values directly and rebuild JSON from scratch
  // This bypasses all JSON parsing issues by manually extracting the actual content
  
  try {
    // Find furiganaText value using simple string methods
    const furiganaStart = cleaned.indexOf('"readingsText"');
    const translationStart = cleaned.indexOf('"translatedText"');
    
    if (translationStart === -1) {
      throw new Error('Could not find required translatedText field');
    }

    let furiganaValue = '';

    if (furiganaStart !== -1) {
      // Extract furiganaText value using INDUSTRY STANDARD approach
      const furiganaColonIndex = cleaned.indexOf(':', furiganaStart);
      const furiganaQuoteStart = cleaned.indexOf('"', furiganaColonIndex) + 1;

      let furiganaQuoteEnd = furiganaQuoteStart;
      let inEscapeFurigana = false;

      // Same robust parsing logic as translatedText
      while (furiganaQuoteEnd < cleaned.length) {
        const char = cleaned[furiganaQuoteEnd];

        if (inEscapeFurigana) {
          inEscapeFurigana = false;
          furiganaQuoteEnd++;
          continue;
        }

        if (char === '\\') {
          inEscapeFurigana = true;
          furiganaQuoteEnd++;
          continue;
        }

        if (char === '"') {
          // Check what follows this quote
          let nextNonWhitespace = furiganaQuoteEnd + 1;
          while (nextNonWhitespace < cleaned.length && 
                 /\s/.test(cleaned[nextNonWhitespace])) {
            nextNonWhitespace++;
          }
          
          const nextChar = cleaned[nextNonWhitespace];
          
          if (nextChar === ',' && isInlineComma(nextNonWhitespace)) {
            logInlineQuoteDetection('furigana', furiganaQuoteEnd);
            furiganaQuoteEnd++;
            continue;
          }

          // Valid ending: comma, closing brace, or end of string
          if (nextChar === ',' || nextChar === '}' || nextNonWhitespace >= cleaned.length) {
            break;
          }
        }

        furiganaQuoteEnd++;
      }

      furiganaValue = cleaned.substring(furiganaQuoteStart, furiganaQuoteEnd);
    }

    // Fallback: legacy responses may use "furiganaText" or "pinyinText"
    if (!furiganaValue && cleaned.indexOf('"furiganaText"') !== -1) {
      const legacyStart = cleaned.indexOf('"furiganaText"');
      const legacyColon = cleaned.indexOf(':', legacyStart);
      const legacyQuoteStart = cleaned.indexOf('"', legacyColon) + 1;
      let legacyQuoteEnd = legacyQuoteStart;
      let inEscapeLegacy = false;
      while (legacyQuoteEnd < cleaned.length) {
        const c = cleaned[legacyQuoteEnd];
        if (inEscapeLegacy) { inEscapeLegacy = false; legacyQuoteEnd++; continue; }
        if (c === '\\') { inEscapeLegacy = true; legacyQuoteEnd++; continue; }
        if (c === '"') {
          let next = legacyQuoteEnd + 1;
          while (next < cleaned.length && /\s/.test(cleaned[next])) next++;
          const nextChar = cleaned[next];
          if (nextChar === ',' && isInlineComma(next)) { legacyQuoteEnd++; continue; }
          if (nextChar === ',' || nextChar === '}' || next >= cleaned.length) break;
        }
        legacyQuoteEnd++;
      }
      furiganaValue = cleaned.substring(legacyQuoteStart, legacyQuoteEnd);
    }
    if (!furiganaValue && cleaned.indexOf('"pinyinText"') !== -1) {
      const pinyinStart = cleaned.indexOf('"pinyinText"');
      const pinyinColonIndex = cleaned.indexOf(':', pinyinStart);
      const pinyinQuoteStart = cleaned.indexOf('"', pinyinColonIndex) + 1;
      let pinyinQuoteEnd = pinyinQuoteStart;
      let inEscapePinyin = false;
      while (pinyinQuoteEnd < cleaned.length) {
        const c = cleaned[pinyinQuoteEnd];
        if (inEscapePinyin) { inEscapePinyin = false; pinyinQuoteEnd++; continue; }
        if (c === '\\') { inEscapePinyin = true; pinyinQuoteEnd++; continue; }
        if (c === '"') {
          let next = pinyinQuoteEnd + 1;
          while (next < cleaned.length && /\s/.test(cleaned[next])) next++;
          const nextChar = cleaned[next];
          if (nextChar === ',' && isInlineComma(next)) { pinyinQuoteEnd++; continue; }
          if (nextChar === ',' || nextChar === '}' || next >= cleaned.length) break;
        }
        pinyinQuoteEnd++;
      }
      furiganaValue = cleaned.substring(pinyinQuoteStart, pinyinQuoteEnd);
    }

    // Extract translatedText value with INDUSTRY STANDARD approach
    // Parse character by character, respecting JSON escape sequences
    // This handles quotes, commas, and braces within the value correctly
    const translationColonIndex = cleaned.indexOf(':', translationStart);
    const translationQuoteStart = cleaned.indexOf('"', translationColonIndex) + 1;
    
    let translationQuoteEnd = translationQuoteStart;
    let inEscape = false;
    
    // BEST PRACTICE: Scan forward respecting escape sequences until we find:
    // - An unescaped quote followed by optional whitespace and either:
    //   - A comma (next field)
    //   - A closing brace (end of object)
    //   - End of string
    while (translationQuoteEnd < cleaned.length) {
      const char = cleaned[translationQuoteEnd];
      
      if (inEscape) {
        // Previous char was backslash, this char is escaped
        inEscape = false;
        translationQuoteEnd++;
        continue;
      }
      
      if (char === '\\') {
        // Start of escape sequence
        inEscape = true;
        translationQuoteEnd++;
        continue;
      }
      
      if (char === '"') {
        // Found potential closing quote
        // Check what comes after (allowing whitespace)
        let nextNonWhitespace = translationQuoteEnd + 1;
        while (nextNonWhitespace < cleaned.length && 
               /\s/.test(cleaned[nextNonWhitespace])) {
          nextNonWhitespace++;
        }
        
        const nextChar = cleaned[nextNonWhitespace];
        
          if (nextChar === ',' && isInlineComma(nextNonWhitespace)) {
            logInlineQuoteDetection('translation', translationQuoteEnd);
            translationQuoteEnd++;
            continue;
          }

        // Valid JSON value endings: comma (next field), closing brace (end), or end of string
        if (nextChar === ',' || nextChar === '}' || nextNonWhitespace >= cleaned.length) {
          // This is the actual closing quote
          break;
        }
        // Otherwise, this quote is part of the value content, keep scanning
      }
      
      translationQuoteEnd++;
    }
    
    // Extract the raw values
    let translationValue = cleaned.substring(translationQuoteStart, translationQuoteEnd);
    
    // Log the extracted values length for debugging
    logger.log(`Extracted furigana length: ${furiganaValue.length}`);
    logger.log(`Extracted translation length: ${translationValue.length}`);
    
    // Clean up the extracted values
    // CRITICAL: Remove JSON artifacts and clean problematic characters
    // STEP 1: Unescape JSON escape sequences first
    furiganaValue = furiganaValue
      .replace(/\\"/g, '"')          // Unescape quotes \" → "
      .replace(/\\\\/g, '\\')        // Unescape backslashes \\\\ → \\
      .replace(/\\n/g, '\n')         // Unescape newlines
      .replace(/\\t/g, '\t')         // Unescape tabs
      .replace(/\\r/g, '\r')         // Unescape carriage returns
      .replace(/[\s}]+$/, '')        // Remove trailing whitespace and JSON artifacts like }
      .replace(/[""‚„]/g, '"')       // Unicode quotes → regular quotes (keep « » as-is)
      .replace(/[''‛‹›]/g, "'")      // Unicode single quotes → regular quotes  
      .replace(/[–—]/g, '-')         // Unicode dashes → regular dashes
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ') // Unicode spaces → regular spaces
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '') // Remove zero-width characters
      .replace(/\s+/g, ' ')          // Normalize multiple spaces
      .trim();
    
    translationValue = translationValue
      .replace(/\\"/g, '"')          // Unescape quotes \" → "
      .replace(/\\\\/g, '\\')        // Unescape backslashes \\\\ → \\
      .replace(/\\n/g, '\n')         // Unescape newlines
      .replace(/\\t/g, '\t')         // Unescape tabs
      .replace(/\\r/g, '\r')         // Unescape carriage returns
      .replace(/[\s}]+$/, '')        // Remove trailing whitespace and JSON artifacts like }
      .replace(/[""‚„]/g, '"')       // Unicode quotes → regular quotes (keep « » as-is)
      .replace(/[''‛‹›]/g, "'")      // Unicode single quotes → regular quotes
      .replace(/[–—]/g, '-')         // Unicode dashes → regular dashes
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ') // Unicode spaces → regular spaces
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '') // Remove zero-width characters
      .replace(/\s+/g, ' ')          // Normalize multiple spaces
      .trim();
    
    // Extract optional verification fields (isComplete, analysis) if present
    // These are needed for translation/reading verification to work correctly
    let isCompleteValue: boolean | undefined;
    let analysisValue: string | undefined;
    
    const isCompleteStart = cleaned.indexOf('"isComplete"');
    if (isCompleteStart !== -1) {
      const isCompleteColonIndex = cleaned.indexOf(':', isCompleteStart);
      // Extract the boolean value (true or false)
      const afterColon = cleaned.substring(isCompleteColonIndex + 1).trim();
      if (afterColon.startsWith('true')) {
        isCompleteValue = true;
      } else if (afterColon.startsWith('false')) {
        isCompleteValue = false;
      }
    }
    
    const analysisStart = cleaned.indexOf('"analysis"');
    if (analysisStart !== -1) {
      const analysisColonIndex = cleaned.indexOf(':', analysisStart);
      const analysisQuoteStart = cleaned.indexOf('"', analysisColonIndex) + 1;
      
      let analysisQuoteEnd = analysisQuoteStart;
      let inEscapeAnalysis = false;
      
      while (analysisQuoteEnd < cleaned.length) {
        const char = cleaned[analysisQuoteEnd];
        
        if (inEscapeAnalysis) {
          inEscapeAnalysis = false;
          analysisQuoteEnd++;
          continue;
        }
        
        if (char === '\\') {
          inEscapeAnalysis = true;
          analysisQuoteEnd++;
          continue;
        }
        
        if (char === '"') {
          let nextNonWhitespace = analysisQuoteEnd + 1;
          while (nextNonWhitespace < cleaned.length && /\s/.test(cleaned[nextNonWhitespace])) {
            nextNonWhitespace++;
          }
          const nextChar = cleaned[nextNonWhitespace];
          if (nextChar === ',' || nextChar === '}' || nextNonWhitespace >= cleaned.length) {
            break;
          }
        }
        
        analysisQuoteEnd++;
      }
      
      analysisValue = cleaned.substring(analysisQuoteStart, analysisQuoteEnd)
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .trim();
    }
    
    // Build clean JSON from scratch with properly escaped values
    // Include optional verification fields if they were present in the original
    const resultObj: Record<string, unknown> = {
      readingsText: furiganaValue,
      translatedText: translationValue
    };
    
    // Preserve verification fields if they exist
    if (isCompleteValue !== undefined) {
      resultObj.isComplete = isCompleteValue;
    }
    if (analysisValue !== undefined) {
      resultObj.analysis = analysisValue;
    }
    
    const cleanJson = JSON.stringify(resultObj);
    
    logger.log('✅ Successfully rebuilt JSON:', cleanJson.substring(0, 150) + '...');
    return cleanJson;
    
  } catch (extractionError) {
    logger.warn('❌ Direct extraction failed, trying fallback...', extractionError);
    
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
    
    logger.log('🔧 Fallback cleanup result:', cleaned);
    return cleaned;
  }
}

/**
 * Determines the primary language of a text while acknowledging it may contain other languages
 * @param text The text to analyze
 * @param forcedLanguage Optional code to force a specific language detection, or 'auto' to auto-detect
 * @returns The detected primary language
 */
function detectPrimaryLanguage(text: string, forcedLanguage: string = 'ja'): string {
  // If a specific language is forced (not 'auto'), return that instead of detecting
  if (forcedLanguage !== 'auto') {
    logger.log(`[detectPrimaryLanguage] Using forced language: ${forcedLanguage}`);
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
      case 'th': return "Thai";
      case 'vi': return "Vietnamese";
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
  let thaiChars = 0;
  
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
    // Thai script
    else if (/[\u0E00-\u0E7F]/.test(char)) {
      thaiChars++;
    }
  }
  
  // Check for Italian based on patterns (simpler approach)
  if (containsItalianText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Italian";
  }
  
  // Check for Tagalog based on patterns
  if (containsTagalogText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Tagalog";
  }
  
  // Check for French based on patterns
  if (containsFrenchText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "French";
  }
  
  // Check for Spanish based on patterns
  if (containsSpanishText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Spanish";
  }
  
  // Check for Portuguese based on patterns
  if (containsPortugueseText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Portuguese";
  }
  
  // Check for German based on patterns
  if (containsGermanText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "German";
  }
  
  // Check for Esperanto based on patterns
  if (containsEsperantoText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Esperanto";
  }

  if (containsVietnameseText(text) &&
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Vietnamese";
  }

  if (thaiChars > 0 &&
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars)) {
    return "Thai";
  }
  
  // Return language with highest character count
  const counts = [
    { lang: "Russian", count: russianChars },
    { lang: "Japanese", count: japaneseChars },
    { lang: "Chinese", count: chineseChars },
    { lang: "Korean", count: koreanChars },
    { lang: "Arabic", count: arabicChars },
    { lang: "Hindi", count: hindiChars },
    { lang: "Thai", count: thaiChars }
  ];
  
  counts.sort((a, b) => b.count - a.count);
  
  // If the highest count is 0, check if this might be English or another Latin-based language
  if (counts[0].count === 0) {
    // Check if the text is primarily Latin characters (English and many European languages)
    const latinChars = text.replace(/\s+/g, '').split('').filter(char => /[a-zA-Z]/.test(char)).length;
    const totalNonSpaceChars = text.replace(/\s+/g, '').length;
    const latinRatio = totalNonSpaceChars > 0 ? latinChars / totalNonSpaceChars : 0;
    
    logger.log(`[detectPrimaryLanguage] No special chars found. Latin chars: ${latinChars}, Total: ${totalNonSpaceChars}, Ratio: ${latinRatio}`);
    
    if (latinChars > 0 && latinRatio >= 0.5) {
      logger.log(`[detectPrimaryLanguage] Defaulting to English for Latin-based text: "${text.substring(0, 50)}..."`);
      return "English"; // Default to English for Latin-based text
    }
    logger.log(`[detectPrimaryLanguage] Returning unknown for text: "${text.substring(0, 50)}..."`);
    return "unknown";
  }
  
  logger.log(`[detectPrimaryLanguage] Highest count language: ${counts[0].lang} (${counts[0].count} chars)`);
  return counts[0].lang;
}

/**
 * Validates if the text contains the specified forced language
 * @param text The text to validate
 * @param forcedLanguage The language code to validate against
 * @returns Object containing the validation result and the detected language name
 */
export function validateTextMatchesLanguage(text: string, forcedLanguage: string = 'ja'): { isValid: boolean; detectedLanguage: string } {
  const detectedLang = detectPrimaryLanguage(text, 'auto'); // Force auto-detection for validation

  // If text is too short, don't validate (prevent false rejections for very short inputs)
  if (text.trim().length < 2) {
    logger.log('[validateTextMatchesLanguage] Text too short, returning true');
    return { isValid: true, detectedLanguage: detectedLang };
  }

  const buildResult = (isValid: boolean) => ({ isValid, detectedLanguage: detectedLang });

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
    case 'th': expectedLanguage = 'Thai'; break;
    case 'vi': expectedLanguage = 'Vietnamese'; break;
    default: expectedLanguage = forcedLanguage;
  }

  logger.log(`[validateTextMatchesLanguage] Validating language: Expected ${expectedLanguage}, Detected ${detectedLang}`);
  logger.log(`[validateTextMatchesLanguage] Text sample: "${text.substring(0, 50)}..."`);

  // Special handling for similar languages or scripts that might be confused

  // Korean validation - check first before other CJK logic, regardless of detected language
  if (expectedLanguage === 'Korean') {
    const hasKorean = containsKoreanText(text);
    logger.log(`[validateTextMatchesLanguage] Korean force mode: hasKorean=${hasKorean}`);

    if (!hasKorean) {
      logger.log('[validateTextMatchesLanguage] Korean forced but no Korean characters found');
      return buildResult(false);
    }
    logger.log('[validateTextMatchesLanguage] Korean force mode validation passed - allowing mixed content');
    return buildResult(true);
  }

  const cjkLanguages = ['Chinese', 'Japanese', 'Korean'];
  if (cjkLanguages.includes(expectedLanguage) && cjkLanguages.includes(detectedLang)) {
    logger.log('[validateTextMatchesLanguage] Handling CJK language validation');
    logger.log(`[validateTextMatchesLanguage] Expected: ${expectedLanguage}, Detected: ${detectedLang}`);

    if (expectedLanguage === 'Japanese') {
      const hasJapaneseSpecific = /[\u3040-\u30ff]/.test(text); // hiragana/katakana
      const hasCJKChars = /[\u4e00-\u9fff]/.test(text); // kanji/CJK
      logger.log(`[validateTextMatchesLanguage] Japanese force mode: hasJapaneseSpecific=${hasJapaneseSpecific}, hasCJKChars=${hasCJKChars}`);

      if (!hasJapaneseSpecific && !hasCJKChars) {
        logger.log('[validateTextMatchesLanguage] Japanese forced but no Japanese characters or CJK characters found');
        return buildResult(false);
      }
      logger.log('[validateTextMatchesLanguage] Japanese force mode validation passed - allowing mixed content');
      return buildResult(true);
    }

    if (expectedLanguage === 'Japanese') {
      logger.log(`[validateTextMatchesLanguage] Japanese validation: containsJapanese=${containsJapanese(text)}`);
      logger.log(`[validateTextMatchesLanguage] Japanese validation: containsChinese=${containsChinese(text)}`);
      logger.log(`[validateTextMatchesLanguage] Text sample: "${text.substring(0, 50)}..."`);
    }

    if (expectedLanguage === 'Chinese') {
      const hasCJKChars = /[\u4e00-\u9fff]/.test(text);
      logger.log(`[validateTextMatchesLanguage] Chinese force mode: hasCJKChars=${hasCJKChars}`);
      logger.log(`[validateTextMatchesLanguage] Text sample for Chinese validation: "${text.substring(0, 50)}..."`);

      if (!hasCJKChars) {
        logger.log('[validateTextMatchesLanguage] Chinese forced but no CJK characters found - cannot process as Chinese');
        return buildResult(false);
      }
      logger.log('[validateTextMatchesLanguage] Chinese force mode validation passed - found CJK characters, allowing mixed content');
      return buildResult(true);
    }
  }

  const latinLanguages = ['English', 'Italian', 'Spanish', 'French', 'Portuguese', 'German', 'Tagalog', 'Esperanto'];
  if (latinLanguages.includes(expectedLanguage)) {
    logger.log('[validateTextMatchesLanguage] Handling Latin language force mode validation');
    logger.log(`[validateTextMatchesLanguage] Expected: ${expectedLanguage}, Detected: ${detectedLang}`);

    const hasLatinChars = /[a-zA-ZÀ-ÿĀ-žñÑ]/.test(text);
    logger.log(`[validateTextMatchesLanguage] Latin force mode: hasLatinChars=${hasLatinChars}`);

    if (!hasLatinChars) {
      logger.log('[validateTextMatchesLanguage] Latin language forced but no Latin characters found');
      return buildResult(false);
    }

    let hasSpecificPatterns = false;

    if (expectedLanguage === 'Italian' && containsItalianText(text)) {
      logger.log('[validateTextMatchesLanguage] Italian patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'French' && containsFrenchText(text)) {
      logger.log('[validateTextMatchesLanguage] French patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'Spanish' && containsSpanishText(text)) {
      logger.log('[validateTextMatchesLanguage] Spanish patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'Portuguese' && containsPortugueseText(text)) {
      logger.log('[validateTextMatchesLanguage] Portuguese patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'German' && containsGermanText(text)) {
      logger.log('[validateTextMatchesLanguage] German patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'Tagalog' && containsTagalogText(text)) {
      logger.log('[validateTextMatchesLanguage] Tagalog patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'English' && containsEnglishText(text)) {
      logger.log('[validateTextMatchesLanguage] English patterns found');
      hasSpecificPatterns = true;
    } else if (expectedLanguage === 'Esperanto' && containsEsperantoText(text)) {
      logger.log('[validateTextMatchesLanguage] Esperanto patterns found');
      hasSpecificPatterns = true;
    }

    if (hasSpecificPatterns) {
      logger.log('[validateTextMatchesLanguage] Force mode: specific language patterns found, validation passed');
      return buildResult(true);
    }

    if (detectedLang === expectedLanguage) {
      logger.log('[validateTextMatchesLanguage] Force mode: detected language matches expected language, validation passed');
      return buildResult(true);
    }

    logger.log(`[validateTextMatchesLanguage] Force mode validation failed: Expected ${expectedLanguage} but detected ${detectedLang}, and no specific patterns found`);
    return buildResult(false);
  }

  if (expectedLanguage === 'Russian') {
    const hasRussian = containsRussianText(text);
    logger.log(`[validateTextMatchesLanguage] Russian force mode: hasRussian=${hasRussian}`);

    if (!hasRussian) {
      logger.log('[validateTextMatchesLanguage] Russian forced but no Cyrillic characters found');
      return buildResult(false);
    }
    logger.log('[validateTextMatchesLanguage] Russian force mode validation passed');
    return buildResult(true);
  }

  if (expectedLanguage === 'Arabic') {
    const hasArabic = containsArabicText(text);
    logger.log(`[validateTextMatchesLanguage] Arabic force mode: hasArabic=${hasArabic}`);

    if (!hasArabic) {
      logger.log('[validateTextMatchesLanguage] Arabic forced but no Arabic characters found');
      return buildResult(false);
    }
    logger.log('[validateTextMatchesLanguage] Arabic force mode validation passed');
    return buildResult(true);
  }

  if (expectedLanguage === 'Hindi') {
    const hasHindi = containsHindiText(text);
    logger.log(`[validateTextMatchesLanguage] Hindi force mode: hasHindi=${hasHindi}`);

    if (!hasHindi) {
      logger.log('[validateTextMatchesLanguage] Hindi forced but no Devanagari characters found');
      return buildResult(false);
    }
    logger.log('[validateTextMatchesLanguage] Hindi force mode validation passed');
    return buildResult(true);
  }

  const result = detectedLang === expectedLanguage;
  logger.log(`[validateTextMatchesLanguage] Standard comparison: ${detectedLang} === ${expectedLanguage} = ${result}`);
  return buildResult(result);
}

/**
 * Validates text language using Claude AI's superior language detection
 * This is more accurate than pattern matching, especially for similar Latin languages
 * @param text The text to validate
 * @param forcedLanguage The expected language code
 * @param apiKey The Claude API key
 * @returns Object with validation result and detected language
 */
export async function validateLanguageWithClaude(
  text: string,
  forcedLanguage: string,
  apiKey: string
): Promise<{ isValid: boolean; detectedLanguage: string; confidence: string }> {
  logger.log(`[Claude Language Validation] Starting AI-based language detection for forced language: ${forcedLanguage}`);

  // Check cache first to avoid expensive API calls
  const cachedResult = getCachedValidation(text, forcedLanguage);
  if (cachedResult) {
    return cachedResult;
  }

  // Start metrics for language validation call
  const validationMetrics = apiLogger.startAPICall('https://api.anthropic.com/v1/messages', {
    text: text.substring(0, 100),
    forcedLanguage,
    operationType: 'language_validation'
  });
  
  // Map language code to full name for the prompt
  const expectedLanguageName = LANGUAGE_NAMES_MAP[forcedLanguage as keyof typeof LANGUAGE_NAMES_MAP] || forcedLanguage;
  
  const validationPrompt = `You are a language detection expert. Analyze the following text and identify its primary language.

Text to analyze: "${text}"

Expected language: ${expectedLanguageName}

CRITICAL INSTRUCTIONS:
1. Determine the PRIMARY language of the text (the language that makes up most of the content)
2. Ignore any mixed content - focus on what language the MAIN content is written in
3. Be very precise in distinguishing between similar languages (e.g., Spanish vs Portuguese, French vs Italian)
4. Return your analysis in the following JSON format with NO additional text:

{
  "detectedLanguage": "The primary language name (e.g., 'English', 'French', 'Spanish', 'Japanese', 'Chinese')",
  "confidence": "high/medium/low",
  "matches": true/false (whether detected language matches expected language "${expectedLanguageName}")
}

Examples:
- If text is "Bonjour le monde" and expected is French → {"detectedLanguage": "French", "confidence": "high", "matches": true}
- If text is "Hello world" and expected is French → {"detectedLanguage": "English", "confidence": "high", "matches": false}
- If text is "Hola mundo" and expected is Italian → {"detectedLanguage": "Spanish", "confidence": "high", "matches": false}

Be precise and return ONLY the JSON with no additional explanation.`;

  const MAX_VALIDATION_RETRIES = 3;
  const INITIAL_BACKOFF_DELAY = 500;
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < MAX_VALIDATION_RETRIES) {
    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200, // Small response, just need the JSON
          temperature: 0,
          messages: [
            {
              role: "user",
              content: validationPrompt
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key': apiKey
          },
          timeout: 10000 // 10 second timeout for quick validation
        }
      );

      // Extract token usage from validation response
      const validationUsage = response.data?.usage;
      const validationInputTokens = validationUsage?.input_tokens;
      const validationOutputTokens = validationUsage?.output_tokens;

      // Extract JSON from response
      if (response.data && response.data.content && Array.isArray(response.data.content)) {
        const textContent = response.data.content.find((item: ClaudeContentItem) => item.type === "text");
        
        if (textContent && textContent.text) {
          const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            
            logger.log(`[Claude Language Validation] Detected: ${result.detectedLanguage}, Confidence: ${result.confidence}, Matches: ${result.matches}`);
            
            // Log language validation API call with token usage
            await logClaudeAPI(validationMetrics, true, textContent.text, undefined, {
              model: 'claude-haiku-4-5-20251001',
              forcedLanguage,
              textLength: text.length,
              detectedLanguage: result.detectedLanguage,
              confidence: result.confidence,
              operationType: 'language_validation'
            }, validationInputTokens, validationOutputTokens);
            
            const validationResult = {
              isValid: result.matches === true,
              detectedLanguage: result.detectedLanguage || 'Unknown',
              confidence: result.confidence || 'low'
            };

            // Cache successful validation results
            setCachedValidation(text, forcedLanguage, validationResult);

            return validationResult;
          }
        }
      }
      
      // Fallback if parsing fails
      logger.warn('[Claude Language Validation] Could not parse Claude response, falling back to pattern matching');
      return {
        isValid: true, // Fall back to allowing the request
        detectedLanguage: 'Unknown',
        confidence: 'low'
      };
    } catch (error) {
      lastError = error;
      const shouldRetry = error instanceof AxiosError &&
        (error.response?.status === 529 || error.response?.headers?.['x-should-retry'] === 'true');

      if (shouldRetry && attempt < MAX_VALIDATION_RETRIES - 1) {
        const backoffDelay = INITIAL_BACKOFF_DELAY * Math.pow(2, attempt);
        logger.warn(`[Claude Language Validation] Service overloaded. Retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${MAX_VALIDATION_RETRIES})`);
        await sleep(backoffDelay);
        attempt++;
        continue;
      }

      logger.error('[Claude Language Validation] Error during validation:', error);
      break;
    }
  }

  if (lastError instanceof AxiosError) {
    logger.warn('[Claude Language Validation] Falling back to pattern matching after validation retries exhausted:', {
      status: lastError.response?.status,
      headers: lastError.response?.headers
    });
  } else if (lastError) {
    logger.warn('[Claude Language Validation] Falling back to pattern matching after validation retries exhausted:', lastError);
  }

  // If validation fails, fall back to allowing the request rather than blocking it
  return {
    isValid: true,
    detectedLanguage: 'Unknown',
    confidence: 'low'
  };
}

/**
 * Processes text with Claude AI API to add furigana/romanization and provide translation
 * @param text The text to be processed
 * @param targetLanguage The language to translate into (default: 'en' for English)
 * @param forcedLanguage Optional code to force a specific source language detection
 * @param onProgress Optional callback for progress updates
 * @param includeScope Whether to include scope analysis (etymology/grammar)
 * @param subscriptionPlan Optional subscription plan to use for rate limiting (avoids re-fetching)
 * @returns Object containing text with furigana/romanization, translation, and optional scope analysis
 */
export async function processWithClaude(
  text: string, 
  targetLanguage: string = 'en',
  forcedLanguage: string = 'ja',
  onProgress?: (checkpoint: number) => void,
  includeScope: boolean = false,
  subscriptionPlan?: 'PREMIUM' | 'FREE'
): Promise<ClaudeResponse> {
  // CRITICAL: Normalize quotation marks and special characters BEFORE processing
  // This prevents JSON parsing issues when Claude includes quotes in translations
  // E.g., French << suspension >> → « suspension » (safe for JSON)
  text = normalizeQuotationMarks(text);
  logger.log('[Claude API] Text normalized for safe JSON processing');
  
  // PRE-PROCESSING: Escape slashes between CJK characters to prevent Claude misinterpretation
  // Claude often confuses slashes as annotation delimiters (e.g., "은/는" → thinks it's a format)
  // By replacing with a rare placeholder, we prevent this and restore after processing
  const SLASH_PLACEHOLDER = '∕'; // U+2215 DIVISION SLASH (visually similar but distinct)
  const slashEscapePattern = /([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u1100-\u11FF])\/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u1100-\u11FF])/g;
  let hasEscapedSlashes = false;
  const originalTextWithSlashes = text;
  
  // Keep replacing until no more matches (handles consecutive like "에서/에/로")
  let prevText = '';
  while (prevText !== text) {
    prevText = text;
    text = text.replace(slashEscapePattern, `$1${SLASH_PLACEHOLDER}$2`);
  }
  
  if (text !== originalTextWithSlashes) {
    hasEscapedSlashes = true;
    const slashCount = (originalTextWithSlashes.match(/\//g) || []).length - (text.match(/\//g) || []).length;
    logger.log(`[Claude API] Escaped ${slashCount} slash(es) between CJK characters to prevent misinterpretation`);
  }
  
  // Helper to restore slashes in output text
  const restoreSlashes = (output: string): string => {
    if (!hasEscapedSlashes || !output) return output;
    return output.replace(new RegExp(SLASH_PLACEHOLDER, 'g'), '/');
  };
  
  // RETRY COUNTER LOGGING: Track internal API calls (verification, furigana retries, etc.)
  let internalApiCallCount = 0;
  const internalRetryReasons: string[] = [];
  
  const trackInternalApiCall = (reason: string) => {
    internalApiCallCount++;
    if (internalApiCallCount > 1) {
      internalRetryReasons.push(reason);
      logger.warn(`🔄 [API Retry Tracker] Internal API call #${internalApiCallCount} - Reason: ${reason}`);
    }
  };

  // Start logging metrics
  const metrics: APIUsageMetrics = apiLogger.startAPICall('https://api.anthropic.com/v1/messages', {
    text: text.substring(0, 100), // Log first 100 chars for debugging
    targetLanguage,
    forcedLanguage,
    textLength: text.length
  });
  
  internalApiCallCount++; // Count the initial call
  logger.log(`📊 [API Retry Tracker] processWithClaude - Initial translation call (Total internal calls: ${internalApiCallCount})`);

  // Check unified rate limits for all API calls
  try {
    // Use passed subscription plan if provided, otherwise fetch from database
    let effectiveSubscriptionPlan = subscriptionPlan;
    if (!effectiveSubscriptionPlan) {
      const subscription = await fetchSubscriptionStatus();
      effectiveSubscriptionPlan = getSubscriptionPlan(subscription);
    }
    logger.log(`[Claude API] Using subscription plan for rate limit: ${effectiveSubscriptionPlan}`);
    const rateLimitStatus = await apiLogger.checkRateLimitStatus(effectiveSubscriptionPlan);
    
    if (rateLimitStatus.apiCallsRemaining <= 0) {
      const isPremium = effectiveSubscriptionPlan === 'PREMIUM';
      const errorMessage = isPremium 
        ? 'API limit reached. You have used all your API calls for this period.'
        : 'Daily API limit reached. Upgrade to Premium for more API calls.';
      logger.warn(`[Claude API] Rate limit exceeded - daily: ${rateLimitStatus.apiCallsUsedToday}/${rateLimitStatus.dailyLimit}, monthly: ${rateLimitStatus.apiCallsUsedThisMonth}/${rateLimitStatus.monthlyLimit || 'N/A'}`);
      throw new Error(errorMessage);
    }
  } catch (error) {
    // If rate limit check fails, log but don't block (fail open for better UX)
    if (error instanceof Error && (error.message.includes('API limit reached') || error.message.includes('Daily API limit'))) {
      throw error; // Re-throw rate limit errors
    }
    logger.warn('[Claude API] Rate limit check failed, proceeding:', error);
  }

  // Validate text length (prevent API abuse)
  const textValidation = validateTextLength(text);
  if (!textValidation.isValid) {
    const errorMessage = textValidation.error || 'Text validation failed';
    logger.error('[Claude API] Text validation failed:', errorMessage);
    throw new Error(errorMessage);
  }

  // Validate Claude API key
  const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY;
  const apiKeyLength = apiKey ? String(apiKey).length : 0;
  
  logger.log(`[Claude API] Key loaded. Length: ${apiKeyLength}.`);

  if (!apiKey || typeof apiKey !== 'string' || apiKeyLength < 20) {
    const errorMessage = `Claude API key is not configured or is invalid. Length: ${apiKeyLength}. Please ensure EXPO_PUBLIC_CLAUDE_API_KEY is set correctly in your environment variables.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Checkpoint 1: Initial validation complete, starting language detection
  logger.log('🎯 [Claude API] Checkpoint 1: Initial validation complete, starting language detection');
  onProgress?.(1);

  // OPTIMIZED LANGUAGE VALIDATION STRATEGY (cost-conscious approach)
  // - Latin languages (en, fr, es, it, pt, de, tl, eo): Skip upfront validation, rely on Claude's built-in detection
  // - Non-Latin languages (ja, zh, ko, ru, ar, hi): Use pattern matching (unique character sets)
  if (forcedLanguage) {
    // Define which languages use which validation method
    const latinLanguages = ['en', 'fr', 'es', 'it', 'pt', 'de', 'tl', 'eo'];
    const nonLatinLanguages = ['ja', 'zh', 'ko', 'ru', 'ar', 'hi', 'th'];

    const usePatternValidation = nonLatinLanguages.includes(forcedLanguage);

    if (usePatternValidation) {
      // Keep pattern-based validation for non-Latin languages (works reliably)
      logger.log(`[Claude API] Performing pattern-based language validation for non-Latin language: ${forcedLanguage}`);
      const validationResult = validateTextMatchesLanguage(text, forcedLanguage);

      // CJK-TO-CJK VALIDATION: Always use AI to distinguish between Chinese and Japanese
      // Pattern matching can't reliably distinguish them (they share CJK characters)
      // This is critical for scenarios like JP→CH or CH→JP where user scans the other language
      const cjkLanguages = ['ja', 'zh'];
      const isCJKLanguage = cjkLanguages.includes(forcedLanguage);

      if (isCJKLanguage && text.trim().length >= 5) {
        logger.log(`[Claude API] CJK language detected (${forcedLanguage}), using AI validation for accurate detection`);

        try {
          const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY ||
                        process.env.EXPO_PUBLIC_CLAUDE_API_KEY;

          if (apiKey) {
            const aiValidation = await validateLanguageWithClaude(text, forcedLanguage, apiKey);

            // Check if AI detected a different CJK language
            // Only treat as mismatch if:
            // 1. The detected language is explicitly different (not "Unknown")
            // 2. The confidence is not "low" (low confidence means API failed or uncertain)
            const aiDetectedLanguage = aiValidation.detectedLanguage;
            const expectedLanguage = LANGUAGE_NAMES_MAP[forcedLanguage as keyof typeof LANGUAGE_NAMES_MAP];
            const isMismatch = aiDetectedLanguage && 
                              aiDetectedLanguage !== 'Unknown' && 
                              aiDetectedLanguage !== expectedLanguage &&
                              aiValidation.confidence !== 'low';

            if (isMismatch) {
              logger.log(`[Claude API] AI detected CJK language mismatch: expected ${expectedLanguage}, got ${aiDetectedLanguage} (confidence: ${aiValidation.confidence})`);

              const mismatchInfo = buildLanguageMismatchInfo(
                forcedLanguage,
                aiDetectedLanguage
              );

              return {
                readingsText: '',
                translatedText: '',
                languageMismatch: mismatchInfo
              };
            } else if (aiDetectedLanguage === 'Unknown' && aiValidation.confidence === 'low') {
              // API failed or uncertain - fall back to pattern-based validation
              logger.log(`[Claude API] AI validation returned Unknown with low confidence (likely API failure), falling back to pattern-based validation`);
            } else {
              logger.log(`[Claude API] AI validation confirmed ${forcedLanguage} language (confidence: ${aiValidation.confidence})`);
              // Add a small delay after validation to space out API calls and reduce 529 overload errors
              // This helps prevent hitting rate limits when validation + translation happen back-to-back
              await sleep(200); // 200ms delay to space out requests
            }
          } else {
            logger.warn(`[Claude API] No API key available for CJK AI validation, using pattern-based detection`);
          }
        } catch (validationError) {
          logger.warn(`[Claude API] AI validation failed, using pattern-based detection:`, validationError);
          // Fall through to use pattern-based detection
        }
      }

      // Pattern-based validation check (only if AI validation didn't trigger mismatch)
      if (!validationResult.isValid) {
        const expectedLanguageName = LANGUAGE_NAMES_MAP[forcedLanguage as keyof typeof LANGUAGE_NAMES_MAP] || forcedLanguage;
        const detectedName = validationResult.detectedLanguage || 'Unknown';

        // Fallback to pattern-based detection for non-CJK mismatches or if AI validation fails
        const mismatchInfo = buildLanguageMismatchInfo(
          forcedLanguage,
          validationResult.detectedLanguage
        );
        const errorMessage = `Language mismatch: Unable to confirm ${expectedLanguageName} in the provided text (detected ${detectedName})`;
        logger.log(`[Claude API] ${errorMessage}`);

        return {
          readingsText: '',
          translatedText: '',
          languageMismatch: mismatchInfo
        };
      }

      logger.log(`[Claude API] Pattern-based language validation passed for ${forcedLanguage}`);
    } else {
      // Latin languages: Check if text contains non-Latin characters that indicate a different language
      // This catches cases like EN source but text is actually Japanese
      logger.log(`[Claude API] Checking for non-Latin characters in text with Latin source: ${forcedLanguage}`);
      
      // Check for Japanese, Chinese, Korean characters
      const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
      const hasChinese = /[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text);
      const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF]/.test(text);
      const hasRussian = /[\u0400-\u04FF]/.test(text);
      const hasArabic = /[\u0600-\u06FF]/.test(text);
      const hasHindi = /[\u0900-\u097F]/.test(text);
      const hasThai = /[\u0E00-\u0E7F]/.test(text);
      
      let detectedNonLatinLanguage: string | null = null;
      if (hasJapanese) detectedNonLatinLanguage = 'Japanese';
      else if (hasChinese) detectedNonLatinLanguage = 'Chinese';
      else if (hasKorean) detectedNonLatinLanguage = 'Korean';
      else if (hasRussian) detectedNonLatinLanguage = 'Russian';
      else if (hasArabic) detectedNonLatinLanguage = 'Arabic';
      else if (hasHindi) detectedNonLatinLanguage = 'Hindi';
      else if (hasThai) detectedNonLatinLanguage = 'Thai';
      
      if (detectedNonLatinLanguage) {
        logger.log(`[Claude API] Non-Latin text detected: ${detectedNonLatinLanguage} (expected ${forcedLanguage})`);
        const mismatchInfo = buildLanguageMismatchInfo(
          forcedLanguage,
          detectedNonLatinLanguage
        );
        logger.log(`[Claude API] Language mismatch: Text contains ${detectedNonLatinLanguage} characters but source is set to ${forcedLanguage}`);
        
        return {
          readingsText: '',
          translatedText: '',
          languageMismatch: mismatchInfo
        };
      }
      
      // LATIN-TO-LATIN VALIDATION: Use AI to distinguish between Latin-based languages
      // This is critical for scenarios like FR→EN where user scans English text
      // Pattern matching can't distinguish French from English, so we need Claude
      const isLatinToLatinScenario = latinLanguages.includes(forcedLanguage) && latinLanguages.includes(targetLanguage);
      
      if (isLatinToLatinScenario && text.trim().length >= 10) {
        logger.log(`[Claude API] Latin-to-Latin scenario detected (${forcedLanguage}→${targetLanguage}), using AI validation`);
        
        try {
          const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY || 
                        process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
          
          if (apiKey) {
            const aiValidation = await validateLanguageWithClaude(text, forcedLanguage, apiKey);
            
            if (!aiValidation.isValid && aiValidation.detectedLanguage) {
              logger.log(`[Claude API] AI detected language mismatch: expected ${forcedLanguage}, got ${aiValidation.detectedLanguage}`);
              
              const mismatchInfo = buildLanguageMismatchInfo(
                forcedLanguage,
                aiValidation.detectedLanguage
              );
              
              return {
                readingsText: '',
                translatedText: '',
                languageMismatch: mismatchInfo
              };
            }
            
            logger.log(`[Claude API] AI validation passed: text is ${aiValidation.detectedLanguage} (confidence: ${aiValidation.confidence})`);
            // Add a small delay after validation to space out API calls and reduce 529 overload errors
            await sleep(200); // 200ms delay to space out requests
          } else {
            logger.warn(`[Claude API] No API key available for Latin-to-Latin AI validation, proceeding without validation`);
          }
        } catch (validationError) {
          logger.warn(`[Claude API] AI validation failed, proceeding without validation:`, validationError);
          // Don't block translation if AI validation fails - just proceed
        }
      } else {
        logger.log(`[Claude API] No non-Latin characters detected, proceeding with ${forcedLanguage} as source`);
      }
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
  logger.log(`Translating to: ${targetLangName}`);
  logger.log(`Using forced language detection: ${forcedLanguage} (${primaryLanguage})`);

  const shouldEnforceKoreanRomanization =
    primaryLanguage === "Korean" || forcedLanguage === 'ko';

  const applyKoreanRomanizationGuards = (value: string, context: string) => {
    if (!shouldEnforceKoreanRomanization || !value) {
      // Still restore slashes even for non-Korean
      return restoreSlashes(value);
    }

    const { sanitizedText, strippedAnnotations } = sanitizeKoreanRomanization(value);
    if (strippedAnnotations.length > 0) {
      const preview = strippedAnnotations.slice(0, 3).join(', ');
      logger.warn(
        `[KoreanRomanization] Removed ${strippedAnnotations.length} non-Hangul annotations during ${context}: ${preview}`
      );
    }
    // Restore escaped slashes after processing
    return restoreSlashes(sanitizedText);
  };
  
  const sanitizeTranslatedText = (value: string, targetLangCode: string) => {
    if (!value) {
      return value;
    }

    let sanitized = value;

    // Strip ANY reading annotations from target language text
    // This handles pinyin in Chinese, romanization from any source language
    if (targetLangCode === 'zh') {
      // More robust pattern: Chinese characters followed by ANY romanization in parentheses
      // This catches pinyin, Hindi romanization, Korean romanization, etc.
      const chineseWithAnnotationPattern =
        /([\u4e00-\u9fff]+)\([^)]+\)/g;
      sanitized = sanitized.replace(chineseWithAnnotationPattern, '$1');
    }

    // For non-Korean target languages, remove Korean romanization patterns from translation
    // This handles cases where Claude incorrectly includes romanization in the translation
    if (targetLangCode !== 'ko' && forcedLanguage === 'ko') {
      // Detect ANY Korean romanization patterns (particle pairs with slashes)
      // These should NEVER appear in a proper translation
      const romanizationPattern = /\b[a-z]+-?[a-z]*\/[a-z]+-?[a-z]*\b/gi;
      
      if (romanizationPattern.test(sanitized)) {
        logger.warn('[sanitizeTranslatedText] Detected Korean romanization in translation, cleaning...');
        
        // Replace known particle patterns with translations
        const replacements: Array<{ pattern: RegExp; translations: { [lang: string]: string } }> = [
          { pattern: /\b-?eun\/?-?neun\b/gi, translations: { fr: 'marqueur de thème', en: 'topic marker', es: 'marcador de tema', default: '(topic)' } },
          { pattern: /\b-?i\/?-?ga\b/gi, translations: { fr: 'marqueur de sujet', en: 'subject marker', es: 'marcador de sujeto', default: '(subject)' } },
          { pattern: /\b-?eul\/?-?reul\b/gi, translations: { fr: 'marqueur d\'objet', en: 'object marker', es: 'marcador de objeto', default: '(object)' } },
          { pattern: /\b-?e-?seo\/?-?e\/?-?ro\b/gi, translations: { fr: 'lieu/direction', en: 'location/direction', es: 'lugar/dirección', default: '(location/direction)' } },
          { pattern: /\b-?eseo\/?-?e\/?-?ro\b/gi, translations: { fr: 'lieu/direction', en: 'location/direction', es: 'lugar/dirección', default: '(location/direction)' } },
        ];
        
        for (const { pattern, translations } of replacements) {
          const replacement = translations[targetLangCode] || translations['default'];
          sanitized = sanitized.replace(pattern, replacement);
        }
        
        // Catch any remaining romanization patterns (e.g., "jang-so/bang-hyang")
        // Replace with empty string or generic marker
        sanitized = sanitized.replace(/\b[a-z]+-[a-z]+\/[a-z]+-[a-z]+\b/gi, '');
        
        // Clean up any double spaces created by removal
        sanitized = sanitized.replace(/\s{2,}/g, ' ').trim();
      }
    }

    return sanitized;
  };
  
  // Add explicit debugging for Japanese forced detection
  if (forcedLanguage === 'ja') {
    logger.log(`[DEBUG] Japanese forced detection active. Using Japanese prompt.`);
  }

  // Checkpoint 1.5: AI language validation complete, proceeding to translation
  logger.log('🎯 [Claude API] Checkpoint 1.5: AI language validation complete, proceeding to translation');
  // Note: We don't call onProgress here to keep the existing 4-checkpoint system intact

  while (retryCount < MAX_RETRIES) {
    try {
      // Try to get Claude API key from Constants first (for EAS builds), then fallback to process.env (for local dev)
      const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY || 
                    process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
      
      if (!apiKey) {
        logger.error('Claude API key not found. Checked:');
        logger.error('- process.env.EXPO_PUBLIC_CLAUDE_API_KEY:', !!process.env.EXPO_PUBLIC_CLAUDE_API_KEY);
        logger.error('- Constants.expoConfig.extra:', Constants.expoConfig?.extra);
        logger.error('- Constants.manifest:', Constants.manifest);
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
If the target language is Thai, the translation must use Thai characters.
If the target language is Vietnamese, the translation must use Vietnamese script with proper diacritics.

`;
      const normalizedForcedLanguage = typeof forcedLanguage === 'string' ? forcedLanguage.toLowerCase() : 'auto';
      const readingLanguageCodes = new Set(['zh', 'ko', 'ru', 'ar', 'hi', 'th']);
      const readingLanguageNames = new Set(['Chinese', 'Korean', 'Russian', 'Arabic', 'Hindi', 'Thai']);
      const hasSourceReadingPrompt =
        readingLanguageCodes.has(normalizedForcedLanguage) ||
        readingLanguageNames.has(primaryLanguage);
      
      // FLOW: "Translate TO X" is checked first. ENG→CH hits "TRANSLATING TO CHINESE", ENG→JA hits "TRANSLATING TO JAPANESE".
      // The "primaryLanguage === English" branch is only used when target is NOT ja/zh (e.g. ENG→French). So for ENG→CH/ENG→JA we must lite here to cut tokens.
      // Check if we're translating TO Japanese from a non-Japanese source
      if (
        targetLanguage === 'ja' &&
        forcedLanguage !== 'ja' &&
        primaryLanguage !== 'Japanese' &&
        !hasSourceReadingPrompt
      ) {
        logger.log(`[DEBUG] TRANSLATING TO JAPANESE: Using natural Japanese translation prompt (primaryLanguage: ${primaryLanguage}, targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          // Lite user message for any source → Japanese (German, French, English, etc.) to cut tokens
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a professional Japanese translator. I need you to translate this text into natural, native-level Japanese: "${text}"

CRITICAL REQUIREMENTS FOR TRANSLATING TO JAPANESE:
1. Translate the text into natural, fluent Japanese as a native speaker would write it
2. Use appropriate kanji, hiragana, and katakana as naturally used in modern Japanese
3. Do NOT add furigana readings - provide clean, natural Japanese text
4. Use proper Japanese grammar, sentence structure, and expressions
5. Choose the most natural and contextually appropriate translation
6. Maintain the original meaning and tone of the text

TRANSLATION GUIDELINES:
- Use kanji where naturally appropriate (not overly simplified hiragana)
- Follow standard Japanese writing conventions
- Choose appropriate levels of politeness/formality based on context
- Use natural Japanese expressions rather than literal translations
- Ensure proper particle usage and sentence flow

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Natural Japanese translation using appropriate kanji, hiragana, and katakana - NO furigana readings"
}`;
        }
      }
      // Check if we're translating TO Chinese from a non-Chinese source (but NOT from a reading language)
      else if (targetLanguage === 'zh' && forcedLanguage !== 'zh' && primaryLanguage !== 'Chinese' && !hasSourceReadingPrompt) {
        logger.log(`[DEBUG] TRANSLATING TO CHINESE: Using natural Chinese translation prompt (primaryLanguage: ${primaryLanguage}, targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          // Lite user message for any source → Chinese (German, French, English, etc.) to cut tokens
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a professional Chinese translator. I need you to translate this text into natural, native-level Chinese: "${text}"

CRITICAL REQUIREMENTS FOR TRANSLATING TO CHINESE:
1. Translate the text into natural, fluent Chinese as a native speaker would write it
2. Use appropriate simplified or traditional Chinese characters based on context
3. Do NOT add pinyin readings - provide clean, natural Chinese text
4. Use proper Chinese grammar, sentence structure, and expressions
5. Choose the most natural and contextually appropriate translation
6. Maintain the original meaning and tone of the text

TRANSLATION GUIDELINES:
- Use appropriate Chinese characters (simplified or traditional as contextually appropriate)
- Follow standard Chinese writing conventions
- Choose appropriate levels of formality based on context
- Use natural Chinese expressions rather than literal translations
- Ensure proper sentence structure and flow
- CRITICAL: For quoted speech, use proper Chinese quotation marks 「」or 『』instead of Western quotes
- If the source has quoted phrases, translate them naturally using Chinese punctuation conventions

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Natural Chinese translation using appropriate Chinese characters and Chinese quotation marks 「」- NO pinyin readings or Western quotes"
}`;
        }
      }
      // FAILSAFE: If Japanese is forced, use Japanese prompt with PROMPT CACHING
      else if (forcedLanguage === 'ja' && targetLanguage !== 'ja') {
        const jaTranslatePrompt = japaneseTranslationSystemPromptLite;
        logger.log(`[DEBUG] FORCED JAPANESE: Using lite Japanese prompt with prompt caching`);

        // DYNAMIC USER MESSAGE (NOT CACHEABLE) - Only the text and target language
        const userMessage = `Translate to ${targetLangName}: "${text}"`;

        // API CALL WITH PROMPT CACHING ENABLED
        logger.log(`🔄 [Prompt Caching] Sending request with caching enabled - system prompt: ${jaTranslatePrompt.length} chars, user message: ${userMessage.length} chars`);

        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4000,
            temperature: 0,
            system: [
              {
                type: "text",
                text: jaTranslatePrompt,
                cache_control: { type: "ephemeral" }  // ENABLES PROMPT CACHING
              }
            ],
            messages: [
              {
                role: "user",
                content: userMessage  // Only dynamic content here
              }
            ]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'prompt-caching-2024-07-31',  // REQUIRED FOR CACHING
              'x-api-key': apiKey
            }
          }
        );

        // Extract token usage from API response
        const usage = response.data?.usage;
        const inputTokens = usage?.input_tokens;
        const outputTokens = usage?.output_tokens;
        
        // Extract ACTUAL cache metrics from Claude API
        const cacheCreationTokens = usage?.cache_creation_input_tokens || 0;
        const cacheReadTokens = usage?.cache_read_input_tokens || 0;

        // Analyze caching effectiveness
        const cacheableTokens = jaTranslatePrompt.length / 4; // Rough token estimate
        const dynamicTokens = userMessage.length / 4; // Rough token estimate

        // Calculate ACTUAL TOTAL COST including cache pricing
        let totalCost = (inputTokens || 0) + (outputTokens || 0);
        let cacheCost = 0;
        let cacheSavings = 0;

        if (cacheCreationTokens > 0) {
          cacheCost = cacheCreationTokens; // Cache creation costs full price
          totalCost += cacheCost;
          logger.log(`🔄 [Cache] 💾 CREATED - ${cacheCreationTokens} tokens cached (full price)`);
        } else if (cacheReadTokens > 0) {
          cacheCost = Math.round(cacheReadTokens * 0.1); // Cache reads cost 10% (90% discount)
          cacheSavings = Math.round(cacheReadTokens * 0.9);
          totalCost += cacheCost;
          logger.log(`🔄 [Cache] ✅ HIT - ${cacheReadTokens} tokens read (90% discount = ${cacheCost} billed)`);
        } else {
          logger.log(`🔄 [Cache] ⚠️ NONE - Prompt too small (${Math.round(cacheableTokens)} tokens < ${MIN_CACHEABLE_TOKENS_HAIKU_45} for Haiku 4.5)`);
        }

        // Log comprehensive cost breakdown
        logger.log(`💵 [Cost] Input: ${inputTokens || 0} | Output: ${outputTokens || 0} | Cache: ${cacheCost} | TOTAL: ${totalCost} tokens`);
        if (cacheSavings > 0) {
          logger.log(`💵 [Savings] ${cacheSavings} tokens saved (90% off cached portion)`);
        }

        // Check response headers for any caching indicators
        const responseHeaders = response.headers;
        if (responseHeaders['anthropic-cache'] || responseHeaders['x-anthropic-cache']) {
          logger.log(`🔄 [Prompt Caching] Response header: ${responseHeaders['anthropic-cache'] || responseHeaders['x-anthropic-cache']}`);
        }

        // Parse response (same as before)
        if (response.data && response.data.content && Array.isArray(response.data.content)) {
          const textContent = response.data.content.find((item: ClaudeContentItem) => item.type === "text");

          if (textContent && textContent.text) {
            try {
              const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
              let jsonString = jsonMatch ? jsonMatch[0] : textContent.text;

              jsonString = cleanJsonString(jsonString);

              logger.log("Raw response text length:", textContent.text.length);
              logger.log("Extracted JSON string length:", jsonString.length);
              logger.log("First 100 chars of JSON:", jsonString.substring(0, 100));
              logger.log("Last 100 chars of JSON:", jsonString.substring(Math.max(0, jsonString.length - 100)));

              let parsedContent;

              try {
                parsedContent = JSON.parse(jsonString);
              } catch (parseError) {
                logger.log('🚨 Initial JSON parse failed, trying emergency fallback...');

                const furiganaMatch = textContent.text.match(/"readingsText"\s*:\s*"((?:\\.|[^"\\])*?)"/s);
                const translationMatch = textContent.text.match(/"translatedText"\s*:\s*"((?:\\.|[^"\\])*?)"/s);

                if (furiganaMatch && translationMatch) {
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

                  logger.log("Extracted furigana length:", furiganaValue.length);
                  logger.log("Extracted translation length:", translationValue.length);

                  parsedContent = {
                    readingsText: furiganaValue,
                    translatedText: translationValue
                  };

                  logger.log('✅ Emergency fallback parsing successful');
                } else {
                  throw parseError;
                }
              }

              const translatedText = parsedContent.translatedText || "";
              const translatedPreview = translatedText.substring(0, 60) + (translatedText.length > 60 ? "..." : "");
              logger.log(`Translation complete: "${translatedPreview}"`);

              // CRITICAL: Run Korean romanization validation BEFORE smart verification early return
              // This ensures we catch cases where Claude returns romanization-only without Korean characters
              let earlyFuriganaText = applyKoreanRomanizationGuards(parsedContent.readingsText || "", "initial-parse-early");
              
              if ((primaryLanguage === "Korean" || forcedLanguage as string === 'ko') && earlyFuriganaText) {
                const koreanValidation = validateKoreanRomanization(text, earlyFuriganaText);
                logger.log(`Korean romanization validation (early path): ${koreanValidation.details}`);
                
                if (!koreanValidation.isValid && koreanValidation.accuracy < 50) {
                  logger.warn(`CRITICAL: Korean romanization failed - ${koreanValidation.details}`);
                  
                  // Check if this is a critical failure (romanization-only without Korean)
                  const isCriticalFailure = koreanValidation.accuracy === 0 && koreanValidation.issues.some(i => i.includes('CRITICAL'));
                  
                  if (isCriticalFailure && retryCount === 0) {
                    logger.log("Retrying with explicit Korean preservation prompt...");
                    retryCount++;
                    
                    const koreanRetryPrompt = `
${promptTopSection}
CRITICAL ERROR: KOREAN TEXT WAS LOST - MUST PRESERVE ORIGINAL HANGUL

You are a Korean language expert. The previous attempt FAILED because you returned only romanization without the original Korean characters.

WHAT WENT WRONG:
- Input had slashes (/) or parentheses in the text
- You returned ONLY romanization like "eun/neun" instead of "은(eun)/는(neun)"
- The original Korean characters were completely lost

Original text: "${text}"

ABSOLUTE REQUIREMENT - DO NOT IGNORE:
1. You MUST preserve ALL original Korean (Hangul) characters
2. Add romanization in parentheses AFTER each Korean word
3. Format: 한글(romanization) - Korean FIRST, then romanization in parentheses
4. If input has slashes like "은/는", output "은(eun)/는(neun)" - annotate EACH word separately
5. If input has parentheses like "(목적격 조사)", keep them and add romanization: "(목적격(mog-jeog-gyeog) 조사(jo-sa))"

CORRECT EXAMPLES:
- "문법 포인트" → "문법(mun-beop) 포인트(po-in-teu)"
- "은/는 vs 이/가" → "은(eun)/는(neun) vs 이(i)/가(ga)"
- "(목적격 조사)" → "(목적격(mog-jeog-gyeog) 조사(jo-sa))"
- "에서/에/로" → "에서(e-seo)/에(e)/로(ro)"

WRONG (DO NOT DO THIS):
- "munbeob po-in-teu" ❌ (missing Korean characters)
- "eun/neun vs i/ga" ❌ (missing Korean characters)
- "munbeob(moon-beob)" ❌ (romanization with romanization - NO Korean!)

TRANSLATION REQUIREMENTS (CRITICAL):
- translatedText must be a PURE ${targetLangName} translation
- Do NOT include any romanization (eun, neun, i, ga, etc.) in the translation
- Do NOT mix romanization with ${targetLangName} words
- Translate the MEANING of the Korean text into natural ${targetLangName}
- Example: "은/는 vs 이/가" should translate to a ${targetLangName} explanation of these particles, NOT "eun/neun vs i/ga"

Format your response as valid JSON:
{
  "readingsText": "MUST contain original Korean text with romanization in parentheses",
  "translatedText": "PURE ${targetLangName} translation - NO romanization, only natural ${targetLangName} text"
}
`;
                    
                    try {
                      const retryResponse = await axios.post(
                        'https://api.anthropic.com/v1/messages',
                        {
                          model: "claude-haiku-4-5-20251001",
                          max_tokens: 4000,
                          temperature: 0.1,
                          messages: [{ role: "user", content: koreanRetryPrompt }]
                        },
                        {
                          headers: {
                            'x-api-key': apiKey,
                            'Content-Type': 'application/json',
                            'anthropic-version': '2023-06-01'
                          },
                          timeout: 60000
                        }
                      );
                      
                      if (retryResponse.data?.content?.[0]?.text) {
                        const retryText = retryResponse.data.content[0].text;
                        logger.log("Korean retry response:", retryText.substring(0, 200) + "...");
                        
                        const retryJson = cleanJsonString(retryText);
                        const retryParsed = JSON.parse(retryJson);
                        
                        const retryValidation = validateKoreanRomanization(text, retryParsed.readingsText || "");
                        logger.log(`Korean retry validation: ${retryValidation.details}`);
                        
                        if (retryValidation.accuracy > koreanValidation.accuracy) {
                          earlyFuriganaText = applyKoreanRomanizationGuards(retryParsed.readingsText || "", "korean-retry-early");
                          logger.log(`Korean retry successful - improved from ${koreanValidation.accuracy}% to ${retryValidation.accuracy}%`);
                          
                          // Update parsedContent with retry results
                          parsedContent.readingsText = earlyFuriganaText;
                          if (retryParsed.translatedText) {
                            parsedContent.translatedText = retryParsed.translatedText;
                          }
                        }
                      }
                    } catch (retryError) {
                      logger.error("Korean retry failed:", retryError);
                    }
                  }
                }
              }

              const qualityAssessment = assessTranslationQuality(translatedText, targetLanguage, text.length);
              logger.log(`🎯 [Smart Verification] Quality assessment: ${qualityAssessment.score}/100 (${qualityAssessment.reasons.join(', ') || 'no issues'})`);

              if (qualityAssessment.needsVerification && retryCount < MAX_RETRIES - 1) {
                logger.log("⚠️ [Smart Verification] Low quality detected, running verification...");
              } else if (!qualityAssessment.needsVerification) {
                logger.log("✅ [Smart Verification] High quality confirmed, skipping verification");

                const result = {
                  readingsText: earlyFuriganaText,
                  translatedText: sanitizeTranslatedText(parsedContent.translatedText || "", targetLanguage),
                  tokenUsage: { input: inputTokens ?? 0, output: outputTokens ?? 0, total: (inputTokens ?? 0) + (outputTokens ?? 0) }
                };

                // Log successful API call (early return path)
                try {
                  logger.log('[Claude API] About to log translate API call (early return path)...');
                  await logClaudeAPI(metrics, true, JSON.stringify(result), undefined, {
                    model: 'claude-haiku-4-5-20251001',
                    targetLanguage,
                    forcedLanguage,
                    textLength: text.length,
                    hasJapanese: result.readingsText ? true : false,
                    parseMethod: 'direct',
                    operationType: 'translate'
                  }, inputTokens, outputTokens);
                  logger.log('[Claude API] Successfully logged translate API call (early return path)');
                } catch (logError) {
                  logger.error('[Claude API] Error logging translate API call (early return path):', logError);
                }

                return result;
              }

              if (qualityAssessment.needsVerification && retryCount < MAX_RETRIES - 1) {
                logger.log("🔍 [Smart Verification] Running verification to ensure completeness...");
                trackInternalApiCall('Translation verification (quality check)');

                retryCount++;

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
  "readingsText": "${parsedContent.readingsText || ""}",
  "translatedText": "Complete and accurate translation in ${targetLangName} language - either the original if it was complete, or a new complete translation if it wasn't"
}`;

                const verificationMetrics = apiLogger.startAPICall('https://api.anthropic.com/v1/messages', {
                  operation: 'translation_verification',
                  textLength: text.length
                });

                const verificationResponse = await axios.post(
                  'https://api.anthropic.com/v1/messages',
                  {
                    model: "claude-haiku-4-5-20251001",
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

                const verificationUsage = verificationResponse.data?.usage;
                const verificationInputTokens = verificationUsage?.input_tokens;
                const verificationOutputTokens = verificationUsage?.output_tokens;

                if (verificationResponse.data && verificationResponse.data.content && Array.isArray(verificationResponse.data.content)) {
                  const verificationTextContent = verificationResponse.data.content.find((item: ClaudeContentItem) => item.type === "text");

                  if (verificationTextContent && verificationTextContent.text) {
                    try {
                      const verificationJsonMatch = verificationTextContent.text.match(/\{[\s\S]*\}/);
                      let verificationJsonString = verificationJsonMatch ? verificationJsonMatch[0] : verificationTextContent.text;

                      verificationJsonString = cleanJsonString(verificationJsonString);

                      logger.log("Verification raw response text length:", verificationTextContent.text.length);
                      logger.log("Verification extracted JSON string length:", verificationJsonString.length);

                      const verificationParsedContent = JSON.parse(verificationJsonString);
                      const isComplete = verificationParsedContent.isComplete === true;
                      const analysis = verificationParsedContent.analysis || "";
                      const verifiedTranslatedText = verificationParsedContent.translatedText || "";

                      await logClaudeAPI(verificationMetrics, true, verificationTextContent.text, undefined, {
                        model: 'claude-haiku-4-5-20251001',
                        operationType: 'translation_verification',
                        targetLanguage,
                        forcedLanguage,
                        textLength: text.length
                      }, verificationInputTokens, verificationOutputTokens);

                      if (!isComplete && verifiedTranslatedText.length > translatedText.length) {
                        logger.log(`Translation was incomplete. Analysis: ${analysis}`);
                        logger.log("Using improved translation from verification");
                        logger.log(`New translation: "${verifiedTranslatedText.substring(0, 60)}${verifiedTranslatedText.length > 60 ? '...' : ''}"`);

                        return {
                          readingsText: restoreSlashes(parsedContent.readingsText || ""),
                          translatedText: sanitizeTranslatedText(verifiedTranslatedText, targetLanguage)
                        };
                      } else {
                        logger.log(`Translation verification result: ${isComplete ? 'Complete' : 'Incomplete'}`);
                        if (!isComplete) {
                          logger.log(`Analysis: ${analysis}`);
                          logger.log("Verification did not provide a better translation - using original");
                        }
                      }
                    } catch (verificationParseError) {
                      logger.error("Error parsing verification response:", verificationParseError);
                      await logClaudeAPI(verificationMetrics, false, undefined, verificationParseError instanceof Error ? verificationParseError : new Error(String(verificationParseError)), {
                        model: 'claude-haiku-4-5-20251001',
                        operationType: 'translation_verification',
                        targetLanguage,
                        forcedLanguage
                      }, verificationInputTokens, verificationOutputTokens);
                    }
                  } else {
                    await logClaudeAPI(verificationMetrics, false, undefined, new Error('No text content in verification response'), {
                      model: 'claude-haiku-4-5-20251001',
                      operationType: 'translation_verification',
                      targetLanguage,
                      forcedLanguage
                    }, verificationInputTokens, verificationOutputTokens);
                  }
                } else {
                  await logClaudeAPI(verificationMetrics, false, undefined, new Error('Invalid verification response structure'), {
                    model: 'claude-haiku-4-5-20251001',
                    operationType: 'translation_verification',
                    targetLanguage,
                    forcedLanguage
                  }, verificationInputTokens, verificationOutputTokens);
                }
              }

              let furiganaText = applyKoreanRomanizationGuards(parsedContent.readingsText || "", "initial-parse");

              if ((primaryLanguage === "Japanese" || forcedLanguage === 'ja') && furiganaText) {
                const validation = validateJapaneseFurigana(text, furiganaText);
                logger.log(`Furigana validation: ${validation.details}`);

                if (!validation.isValid) {
                  logger.warn(`Incomplete furigana coverage: ${validation.details}`);

                  if (retryCount === 0 && (validation.missingKanjiCount > 0 || validation.details.includes("incorrect readings"))) {
                    logger.log("Retrying with more aggressive furigana prompt...");
                    retryCount++;

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
4. USE STANDARD DICTIONARY READINGS - do NOT create readings by combining individual kanji sounds phonetically
5. Do NOT skip any kanji - this is mandatory

CRITICAL WORD-LEVEL READING PRIORITY:
- FIRST analyze the text for compound words, counter words, and context-dependent readings
- Compound words MUST use their STANDARD DICTIONARY READING
- DO NOT phonetically combine individual kanji readings - compound words have fixed, standard readings
- Counter words undergo sound changes (rendaku) and must be read as complete units

MANDATORY VERIFICATION BEFORE RESPONDING - DO THIS STEP BY STEP:
1. For EVERY compound word, check: "Is this the standard dictionary reading, or did I combine individual kanji readings?"
2. If you combined readings (e.g., 最安値 = さい+あん+ち instead of さいやすね), CORRECT IT to the standard reading
3. Verify that EVERY kanji character has corresponding furigana - none can be skipped
4. For single-kanji words (左, 右, 上, etc.), ensure each has furigana even if it seems obvious
5. Double-check that compound readings match standard Japanese dictionaries, not phonetic combinations

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
- "自動車" → "自動車(じてんしゃ)" [REQUIRED - compound word]
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
3. Include the COMPLETE readingsText and translatedText without omissions
4. Ensure all special characters are properly escaped in the JSON
5. Do NOT use ellipses (...) or any other abbreviation markers
6. Do NOT split the response into multiple parts
7. CRITICAL: Your response MUST include a COMPLETE translation - partial translations will cause errors
8. CRITICAL: The translation must be a complete sentence that fully captures the meaning of the original text

Format your response as valid JSON with these exact keys:
{
  "readingsText": "Japanese text with furigana after EVERY kanji word as shown in examples - THIS IS MANDATORY AND MUST BE COMPLETE",
  "translatedText": "Complete and accurate translation in ${targetLangName} without any truncation or abbreviation"
}`;

                    const retryResponse = await axios.post(
                      'https://api.anthropic.com/v1/messages',
                      {
                        model: "claude-haiku-4-5-20251001",
                        max_tokens: 4000,
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

                    if (retryResponse.data && retryResponse.data.content && Array.isArray(retryResponse.data.content)) {
                      const retryTextContent = retryResponse.data.content.find((item: ClaudeContentItem) => item.type === "text");

                      if (retryTextContent && retryTextContent.text) {
                        try {
                          const retryJsonMatch = retryTextContent.text.match(/\{[\s\S]*\}/);
                          let retryJsonString = retryJsonMatch ? retryJsonMatch[0] : retryTextContent.text;

                          retryJsonString = cleanJsonString(retryJsonString);
                          const retryParsedContent = JSON.parse(retryJsonString);

                          const retryPinyinText = retryParsedContent.readingsText || "";
                          const retryValidation = validateJapaneseFurigana(text, retryPinyinText);

                          logger.log(`Retry furigana validation: ${retryValidation.details}`);

                          // Use retry result if it has fewer missing kanji
                          if (retryValidation.missingKanjiCount < validation.missingKanjiCount ||
                              (retryValidation.isValid && !validation.isValid)) {
                            furiganaText = retryPinyinText;
                            logger.log(`Retry successful - reduced missing kanji from ${validation.missingKanjiCount} to ${retryValidation.missingKanjiCount}`);
                          } else {
                            logger.log(`Retry did not improve furigana quality - using original result`);
                          }
                        } catch (retryParseError) {
                          logger.error("Error parsing furigana retry response:", retryParseError);
                        }
                      }
                    }
                  } else if (validation.isValid) {
                    logger.log(`Furigana validation passed`);
                  }
                }

                return {
                  readingsText: furiganaText,
                  translatedText: sanitizeTranslatedText(parsedContent.translatedText || "", targetLanguage)
                };
              } else {
                return {
                  readingsText: restoreSlashes(parsedContent.readingsText || ""),
                  translatedText: sanitizeTranslatedText(translatedText, targetLanguage)
                };
              }
            } catch (parseError) {
              logger.error('Error parsing Claude response:', parseError);
              throw new Error('Failed to parse Claude API response. The response may be malformed.');
            }
          } else {
            throw new Error('No text content received from Claude API');
          }
        } else {
          throw new Error('Invalid response structure from Claude API');
        }
      } else if ((primaryLanguage === "Chinese" || forcedLanguage === 'zh') && targetLanguage !== 'zh') {
        logger.log(`[DEBUG] Using Chinese prompt (pinyin) with prompt caching for primaryLanguage: ${primaryLanguage}, forcedLanguage: ${forcedLanguage}, targetLanguage: ${targetLanguage}`);
        // Use cached system prompt for Chinese (similar to Japanese)
        // Note: Only add pinyin when translating TO a different language (Chinese speakers don't need pinyin for their native language)
        userMessage = `Translate to ${targetLangName}: "${text}"`;
      }
      // Check if we're translating TO Korean from a non-Korean source (but NOT from a reading language)
      else if (targetLanguage === 'ko' && forcedLanguage !== 'ko' && primaryLanguage !== 'Korean' && !hasSourceReadingPrompt) {
        logger.log(`[DEBUG] TRANSLATING TO KOREAN: Using natural Korean translation prompt (primaryLanguage: ${primaryLanguage}, targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a professional Korean translator. I need you to translate this text into natural, native-level Korean: "${text}"

CRITICAL REQUIREMENTS FOR TRANSLATING TO KOREAN:
1. Translate the text into natural, fluent Korean as a native speaker would write it
2. Use appropriate Hangul characters and proper Korean grammar
3. Do NOT add romanization - provide clean, natural Korean text
4. Use proper Korean sentence structure and expressions
5. Choose the most natural and contextually appropriate translation
6. Maintain the original meaning and tone of the text

TRANSLATION GUIDELINES:
- Use natural Korean vocabulary and expressions
- Follow standard Korean writing conventions
- Choose appropriate levels of politeness/formality based on context
- Use natural Korean sentence endings and particles
- Ensure proper grammar and sentence flow

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Natural Korean translation using Hangul characters - NO romanization"
}`;
        }
      } else if (targetLanguage === 'th' && forcedLanguage !== 'th' && primaryLanguage !== 'Thai' && !hasSourceReadingPrompt) {
        logger.log(`[DEBUG] TRANSLATING TO THAI: Using natural Thai translation prompt (primaryLanguage: ${primaryLanguage}, targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a professional Thai translator. I need you to translate this text into natural, native-level Thai: "${text}"

CRITICAL REQUIREMENTS FOR TRANSLATING TO THAI:
1. Translate the text into fluent, native Thai using proper Thai vocabulary, grammar, and tone
2. Use Thai script for every word and do NOT add romanization or transliteration
3. Maintain natural Thai spacing, punctuation, and sentence structure (Thai often omits spaces between words; follow standard conventions)
4. Preserve the original meaning, formal/informal tone, and cultural context implied by the source
5. Avoid literal word-by-word substitution—choose idiomatic Thai expressions when appropriate

TRANSLATION GUIDELINES:
- Keep Thai script as the primary output language; English words/numbers already present in the source may remain unchanged
- Match the register (polite particles like ค่ะ/ครับ, ครับ/ค่ะ) to the tone of the source text
- Use natural Thai word order (topic-comment, verb-final clauses) and ensure readability for Thai speakers
- Pay attention to Thai-specific classifiers, particles, and idiomatic expressions (e.g., ใบ, ตัว, คน, นะ)
- Translate quoted speech and instructions literally while keeping Thai punctuation consistent (use quotation marks like “ ” or « » when appropriate)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Natural Thai translation using Thai script only - NO romanization"
}`;
        }
      } else if (targetLanguage === 'vi' && forcedLanguage !== 'vi' && primaryLanguage !== 'Vietnamese' && !hasSourceReadingPrompt) {
        logger.log(`[DEBUG] TRANSLATING TO VIETNAMESE: Using natural Vietnamese translation prompt (primaryLanguage: ${primaryLanguage}, targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a professional Vietnamese translator. I need you to translate this text into natural, native-level Vietnamese: "${text}"

CRITICAL REQUIREMENTS FOR TRANSLATING TO VIETNAMESE:
1. Translate the text into natural Vietnamese using proper spelling, grammar, and tone
2. Preserve all diacritics (acute, grave, hook, tilde, dot) for each syllable; Vietnamese must remain in Vietnamese script
3. Do NOT add romanization or alternate transliterations - the output should use standard Vietnamese orthography
4. Maintain natural Vietnamese spacing and punctuation
5. Preserve the original meaning, nuance, and register of the source text

TRANSLATION GUIDELINES:
- Use contextually appropriate Vietnamese expressions and idioms
- Follow standard Vietnamese sentence structure and word order
- Choose polite/formal language when needed; keep tone consistent with the source
- Ensure the translation reads naturally to a Vietnamese native speaker

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Natural Vietnamese translation using proper Vietnamese orthography with all necessary diacritics - NO romanization"
}`;
        }
      } else if (primaryLanguage === "Korean" && targetLanguage !== 'ko') {
        logger.log(`[DEBUG] Using Korean prompt (romanization) with prompt caching for primaryLanguage: ${primaryLanguage}, forcedLanguage: ${forcedLanguage}, targetLanguage: ${targetLanguage}`);
        // Use cached system prompt for Korean (similar to Japanese and Chinese)
        // Note: Only add romanization when translating TO a different language (Korean speakers don't need romanization for their native language)
        userMessage = `Translate to ${targetLangName}: "${text}"`;
      }
      // Check if we're translating TO Russian from a non-Russian source (but NOT from a reading language)
      else if (targetLanguage === 'ru' && forcedLanguage !== 'ru' && primaryLanguage !== 'Russian' && !hasSourceReadingPrompt) {
        logger.log(`[DEBUG] TRANSLATING TO RUSSIAN: Using natural Russian translation prompt (primaryLanguage: ${primaryLanguage}, targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a professional Russian translator. I need you to translate this text into natural, native-level Russian: "${text}"

CRITICAL REQUIREMENTS FOR TRANSLATING TO RUSSIAN:
1. Translate the text into natural, fluent Russian as a native speaker would write it
2. Use appropriate Cyrillic characters and proper Russian grammar
3. Do NOT add romanization - provide clean, natural Russian text
4. Use proper Russian sentence structure and expressions
5. Choose the most natural and contextually appropriate translation
6. Maintain the original meaning and tone of the text

TRANSLATION GUIDELINES:
- Use natural Russian vocabulary and expressions
- Follow standard Russian writing conventions and spelling rules
- Choose appropriate levels of formality based on context
- Use proper Russian case system and verb aspects
- Ensure proper grammar and sentence flow

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Natural Russian translation using Cyrillic characters - NO romanization"
}`;
        }
      } else if ((primaryLanguage === "Russian" || forcedLanguage === 'ru') && targetLanguage !== 'ru') {
        // Russian as source: request romanization (Cyrillic + Latin) in readingsText, same as Thai/Arabic/Hindi
        logger.log(`[DEBUG] RUSSIAN SOURCE TEXT: Adding Latin romanization and translating to ${targetLangName} (targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
Translate this Russian text and add Latin romanization: "${text}"
Target language: ${targetLangName}`;
        }
      } else if (primaryLanguage === "Russian" && targetLanguage === 'ru') {
        // Russian to Russian: no translation, no romanization needed
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a Russian language expert. I need you to translate this Russian text: "${text}"

IMPORTANT: Keep all original text as is. No romanization needed. Translate into ${targetLangName} if needed.

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      }
      // Check if we're translating TO Arabic from a non-Arabic source (but NOT from a reading language)
      else if (targetLanguage === 'ar' && forcedLanguage !== 'ar' && primaryLanguage !== 'Arabic' && !hasSourceReadingPrompt) {
        logger.log(`[DEBUG] TRANSLATING TO ARABIC: Using natural Arabic translation prompt (primaryLanguage: ${primaryLanguage}, targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a professional Arabic translator. I need you to translate this text into natural, native-level Arabic: "${text}"

CRITICAL REQUIREMENTS FOR TRANSLATING TO ARABIC:
1. Translate the text into natural, fluent Arabic as a native speaker would write it
2. Use appropriate Arabic script and proper Arabic grammar
3. Do NOT add transliteration - provide clean, natural Arabic text
4. Use proper Arabic sentence structure and expressions
5. Choose the most natural and contextually appropriate translation
6. Maintain the original meaning and tone of the text

TRANSLATION GUIDELINES:
- Use natural Arabic vocabulary and expressions
- Follow standard Arabic writing conventions
- Choose appropriate levels of formality based on context
- Use proper Arabic grammar and sentence structure
- Ensure proper text flow and readability

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Natural Arabic translation using Arabic script - NO transliteration"
}`;
        }
      } else if ((primaryLanguage === "Arabic" || forcedLanguage === 'ar') && targetLanguage !== 'ar') {
        // Arabic-specific prompt with Enhanced Arabic Chat Alphabet including Sun Letter Assimilation
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
Translate this Arabic text and add transliteration: "${text}"
Target language: ${targetLangName}`;
        }
      } else if ((primaryLanguage === "Thai" || forcedLanguage === 'th') && targetLanguage !== 'th') {
        logger.log(`[DEBUG] THAI SOURCE TEXT: Adding RTGS romanization and translating to ${targetLangName} (targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
Translate this Thai text and add RTGS romanization: "${text}"
Target language: ${targetLangName}`;
        }
      } else if ((primaryLanguage === "Vietnamese" || forcedLanguage === 'vi') && targetLanguage !== 'vi') {
        logger.log(`[DEBUG] VIETNAMESE SOURCE TEXT: Translating Vietnamese to ${targetLangName} (targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a Vietnamese language expert. I need you to analyze and translate this Vietnamese text: "${text}"

CRITICAL REQUIREMENTS FOR VIETNAMESE TEXT:
- Keep every Vietnamese word exactly as written, including all diacritics (acute, grave, hook, tilde, dot)
- Do NOT add romanization, transliteration, or alternate spellings - Vietnamese already uses Latin script
- Maintain natural Vietnamese punctuation, spacing, and tone markers
- Translate into ${targetLangName} language, NOT English (unless English is explicitly requested)

TRANSLATION GUIDELINES:
- Preserve the original meaning, nuance, and register
- Use idiomatic Vietnamese expressions when appropriate but avoid changing the meaning
- Keep any embedded non-Vietnamese segments (English acronyms, numbers, etc.) unchanged

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Accurate translation in ${targetLangName} language that preserves the full Vietnamese meaning, tone, and diacritics"
}`;
        }
      }
      // Check if we're translating TO Hindi from a non-Hindi source (but NOT from a reading language)
      else if (targetLanguage === 'hi' && forcedLanguage !== 'hi' && primaryLanguage !== 'Hindi' && !hasSourceReadingPrompt) {
        logger.log(`[DEBUG] TRANSLATING TO HINDI: Using natural Hindi translation prompt (primaryLanguage: ${primaryLanguage}, targetLanguage: ${targetLanguage})`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a professional Hindi translator. I need you to translate this text into natural, native-level Hindi: "${text}"

CRITICAL REQUIREMENTS FOR TRANSLATING TO HINDI:
1. Translate the text into natural, fluent Hindi as a native speaker would write it
2. Use appropriate Devanagari script and proper Hindi grammar
3. Do NOT add romanization - provide clean, natural Hindi text
4. Use proper Hindi sentence structure and expressions
5. Choose the most natural and contextually appropriate translation
6. Maintain the original meaning and tone of the text

TRANSLATION GUIDELINES:
- Use natural Hindi vocabulary and expressions
- Follow standard Devanagari writing conventions
- Choose appropriate levels of formality based on context
- Use proper Hindi grammar and sentence structure
- Ensure proper text flow and readability

Format your response as valid JSON with these exact keys:
{
  "readingsText": "",
  "translatedText": "Natural Hindi translation using Devanagari script - NO romanization"
}`;
        }
      } else if ((primaryLanguage === "Hindi" || forcedLanguage === 'hi') && targetLanguage !== 'hi') {
        // Enhanced Hindi-specific prompt with comprehensive romanization accuracy
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
Translate this Hindi text and add romanization: "${text}"
Target language: ${targetLangName}`;
        }
      } else if (primaryLanguage === "Esperanto") {
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
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
  "readingsText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      } else if (primaryLanguage === "Italian") {
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are an Italian language expert. I need you to translate this Italian text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR ITALIAN TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for Italian text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      } else if (primaryLanguage === "Spanish") {
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a Spanish language expert. I need you to translate this Spanish text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR SPANISH TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for Spanish text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      } else if (primaryLanguage === "French") {
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a French language expert. I need you to translate this French text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR FRENCH TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for French text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      } else if (primaryLanguage === "Portuguese") {
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a Portuguese language expert. I need you to translate this Portuguese text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR PORTUGUESE TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for Portuguese text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      } else if (primaryLanguage === "German") {
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a German language expert. I need you to translate this German text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR GERMAN TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for German text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      } else if (primaryLanguage === "Tagalog") {
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are a Tagalog language expert. I need you to translate this Tagalog text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR TAGALOG TEXT:
- Keep all original text as is (including any English words, numbers, or punctuation)
- No romanization is needed for Tagalog text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      } else if (primaryLanguage === "English") {
        // English→any: use minimal prompt when lite to cut input tokens (~608 → ~150–200)
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
You are an English language expert. I need you to translate this English text: "${text}"

IMPORTANT FORMATTING REQUIREMENTS FOR ENGLISH TEXT:
- Keep all original text as is (including any non-English words, numbers, or punctuation)
- No romanization is needed for English text
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      } else if (primaryLanguage === "Japanese" && forcedLanguage !== 'ja') {
        logger.log(`[DEBUG] Using Japanese prompt (furigana) for primaryLanguage: ${primaryLanguage}`);
        // Japanese prompt - Enhanced for contextual compound word readings (only when not using forced detection)
        userMessage = `
${promptTopSection}
You are a Japanese language expert. I need you to analyze this text and add furigana to ALL words containing kanji: "${text}"

CRITICAL REQUIREMENTS FOR JAPANESE TEXT - THESE ARE MANDATORY:
1. Keep all original text exactly as is (including any English words, numbers, or punctuation)
2. For EVERY word containing kanji, you MUST add the complete hiragana reading in parentheses immediately after the word
3. The reading should cover the entire word (including any hiragana/katakana parts attached to the kanji)
4. USE STANDARD DICTIONARY READINGS for all compound words - do NOT create readings by combining individual kanji sounds phonetically
5. You MUST NOT skip any kanji - every single kanji character must have furigana
6. CRITICAL: Non-kanji words (pure hiragana/katakana), English words, and numbers should remain COMPLETELY UNCHANGED - NEVER add furigana to words with NO kanji
   - WRONG: うそ(うそ), それは(それは), ない(ない), でしょ(でしょ) ❌
   - CORRECT: うそ, それは, ない, でしょ ✓ (no furigana - already readable as hiragana)
7. NEVER CONVERT HIRAGANA TO KANJI: If the user wrote a word in hiragana, keep it in hiragana. Do NOT "correct" or convert it to kanji.
   - Input: こくのある甘み → Output: こくのある甘(あま)み ✓ (keep こく as hiragana)
   - WRONG: こく → 国(くに) ❌ (do NOT convert hiragana to kanji)
   - Words like コク (richness), うま味 (umami) are intentionally written in kana
8. Translate into ${targetLangName}

CRITICAL WORD-LEVEL READING PRIORITY:
- FIRST analyze the text for compound words, counter words, and context-dependent readings
- Compound words MUST use their STANDARD DICTIONARY READING - consult your knowledge of established Japanese compound word pronunciations
- DO NOT phonetically combine individual kanji readings - compound words have fixed, standard readings that may differ from the sum of individual kanji readings
- Counter words undergo sound changes (rendaku) and must be read as complete units
- Only split into individual kanji readings when words cannot be read as compounds

MANDATORY VERIFICATION BEFORE RESPONDING - DO THIS STEP BY STEP:
1. For EVERY compound word, check: "Is this the standard dictionary reading, or did I combine individual kanji readings?"
2. If you combined readings (e.g., 最安値 = さい+あん+ち instead of さいやすね), CORRECT IT to the standard reading
3. Verify that EVERY kanji character has corresponding furigana - none can be skipped
4. For single-kanji words (左, 右, 上, etc.), ensure each has furigana even if it seems obvious
5. Double-check that compound readings match standard Japanese dictionaries, not phonetic combinations

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
3. Include the COMPLETE readingsText and translatedText without omissions
4. Ensure all special characters are properly escaped in the JSON
5. Do NOT use ellipses (...) or any other abbreviation markers
6. Do NOT split the response into multiple parts
7. CRITICAL: Your response MUST include a COMPLETE translation - partial translations will cause errors
8. CRITICAL: The translation must be a complete sentence that fully captures the meaning of the original text

Format your response as valid JSON with these exact keys:
{
  "readingsText": "Japanese text with furigana after EVERY kanji word as shown in examples - THIS IS MANDATORY AND MUST BE COMPLETE",
  "translatedText": "Complete and accurate translation in ${targetLangName} without any truncation or abbreviation"
}`;
      } else {
        logger.log(`[DEBUG] Using default prompt for primaryLanguage: ${primaryLanguage}`);
        if (USE_LITE_PROMPTS) {
          userMessage = `Translate to ${targetLangName} only. Output valid JSON with keys readingsText and translatedText.
"${text}"`;
        } else {
          userMessage = `
${promptTopSection}
I need you to translate this text: "${text}"

IMPORTANT:
- Translate into ${targetLangName} language, NOT English (unless English is specifically requested)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "", 
  "translatedText": "Accurate translation in ${targetLangName} language reflecting the full meaning in context"
}
`;
        }
      }

      logger.log(`Processing text (${text.substring(0, 40)}${text.length > 40 ? '...' : ''})`);
      logger.log('Claude API Key found:', !!apiKey, 'Length:', apiKey?.length);
      
      // Process the prompt to ensure all string interpolation is handled
      const processedPrompt = userMessage
        .replace(/\${targetLangName}/g, targetLangName)
        .replace(/\${promptTopSection}/g, promptTopSection);
      
      // Make API request to Claude using latest API format
      logger.log('🎯 [Claude API] Starting API request to Claude...');
      
      // Select appropriate system prompt based on language
      // CJK languages need specialized prompts for readings (furigana/pinyin/romanization)
      // Non-CJK languages use simple translation prompt (much smaller, no caching needed)
      const isChineseWithCaching = (primaryLanguage === "Chinese" || forcedLanguage === 'zh') && targetLanguage !== 'zh';
      const isJapaneseWithCaching = (primaryLanguage === "Japanese" || forcedLanguage === 'ja') && targetLanguage !== 'ja';
      const isKoreanWithCaching = (primaryLanguage === "Korean" || forcedLanguage === 'ko') && targetLanguage !== 'ko';
      
      // Languages with romanization requirements (large system prompts that benefit from caching)
      const isArabicWithRomanization = (primaryLanguage === "Arabic" || forcedLanguage === 'ar') && targetLanguage !== 'ar';
      const isHindiWithRomanization = (primaryLanguage === "Hindi" || forcedLanguage === 'hi') && targetLanguage !== 'hi';
      const isThaiWithRomanization = (primaryLanguage === "Thai" || forcedLanguage === 'th') && targetLanguage !== 'th';
      const isRussianWithRomanization = (primaryLanguage === "Russian" || forcedLanguage === 'ru') && targetLanguage !== 'ru';
      
      // Languages that need caching: CJK (system prompt caching) OR romanization languages (system prompt caching)
      const isCJKLanguage = isChineseWithCaching || isJapaneseWithCaching || isKoreanWithCaching;
      const isRomanizationLanguage = isArabicWithRomanization || isHindiWithRomanization || isThaiWithRomanization || isRussianWithRomanization;
      const needsCaching = isCJKLanguage || isRomanizationLanguage;
      
      // Select the appropriate system prompt (Translate flow - lite prompts only)
      // - CJK languages use specialized prompts with reading annotations (cached due to size)
      // - Romanization languages (Arabic, Hindi, Thai) use specialized prompts with romanization rules (cached due to size)
      // - Other languages use simple translation prompt (small, no caching needed)
      const systemPrompt = isChineseWithCaching ? chineseTranslationSystemPromptLite :
                           isJapaneseWithCaching ? japaneseTranslationSystemPromptLite :
                           isKoreanWithCaching ? koreanTranslationSystemPromptLite :
                           isArabicWithRomanization ? arabicTranslationSystemPromptLite :
                           isHindiWithRomanization ? hindiTranslationSystemPromptLite :
                           isThaiWithRomanization ? thaiTranslationSystemPromptLite :
                           isRussianWithRomanization ? russianTranslationSystemPromptLite :
                           simpleTranslationPromptLite;
      
      // Determine language name for logging
      const languageDisplayNames: Record<string, string> = {
        'zh': 'Chinese', 'ja': 'Japanese', 'ko': 'Korean',
        'fr': 'French', 'es': 'Spanish', 'it': 'Italian', 'pt': 'Portuguese', 'de': 'German',
        'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi', 'th': 'Thai', 'vi': 'Vietnamese',
        'tl': 'Tagalog', 'eo': 'Esperanto', 'en': 'English'
      };
      const languageDisplayName = languageDisplayNames[forcedLanguage] || forcedLanguage.toUpperCase();
      
      let response;
      
      if (needsCaching) {
        // All reading languages now use system prompt caching:
        // - CJK: system prompt caching (specialized prompts exceed 2048 token minimum)
        // - Romanization languages (Arabic, Hindi, Thai): system prompt caching (romanization rules moved to system prompt)
        logger.log(`🔄 [Prompt Caching] Sending ${languageDisplayName} request with caching enabled (system prompt) - system prompt: ${systemPrompt.length} chars, user message: ${processedPrompt.length} chars`);
        
        // All reading languages use system prompt caching (CJK and romanization languages)
        const systemConfig = [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" }
          }
        ];
        
        const messagesConfig = [
          {
            role: "user",
            content: processedPrompt  // Always simple, dynamic content
          }
        ];
        
        response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4000,
            temperature: 0,
            system: systemConfig,
            messages: messagesConfig
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'prompt-caching-2024-07-31',  // REQUIRED FOR CACHING
              'x-api-key': apiKey
            }
          }
        );
        
        // Extract cache metrics
        const cacheUsage = response.data?.usage;
        const cacheCreationTokens = cacheUsage?.cache_creation_input_tokens || 0;
        const cacheReadTokens = cacheUsage?.cache_read_input_tokens || 0;
        
        if (cacheCreationTokens > 0) {
          logger.log(`🔄 [Cache] 💾 CREATED - ${cacheCreationTokens} tokens cached (full price)`);
        } else if (cacheReadTokens > 0) {
          const cacheCost = Math.round(cacheReadTokens * 0.1);
          const cacheSavings = Math.round(cacheReadTokens * 0.9);
          logger.log(`🔄 [Cache] ✅ HIT - ${cacheReadTokens} tokens read (90% discount = ${cacheCost} billed)`);
          logger.log(`💵 [Savings] ${cacheSavings} tokens saved (90% off cached portion)`);
        } else {
          logger.log(`🔄 [Cache] ⚠️ NONE - Prompt may be too small`);
        }
      } else {
        // Non-CJK languages use simple translation prompt (no caching - prompt too small)
        logger.log(`📝 [Simple Translation] Sending ${languageDisplayName} request - system prompt: ${systemPrompt.length} chars, user message: ${processedPrompt.length} chars`);
        
        response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4000,
            temperature: 0,
            system: systemPrompt,  // Simple string, no caching
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
        
        logger.log(`📝 [Simple Translation] Response received (no caching for small prompts)`);
      }

      // Checkpoint 2: API request completed, response received (purple light)
      logger.log('🎯 [Claude API] Checkpoint 2: API response received, triggering purple light');
      onProgress?.(2);

      logger.log("Claude API response received");
      
      // Extract token usage from API response
      const usage = response.data?.usage;
      const inputTokens = usage?.input_tokens;
      const outputTokens = usage?.output_tokens;
      const tokenUsage = { input: inputTokens ?? 0, output: outputTokens ?? 0, total: (inputTokens ?? 0) + (outputTokens ?? 0) };

      const regularCost = (inputTokens || 0) + (outputTokens || 0);
      logger.log(`💵 [Regular Translation Cost] Input: ${inputTokens || 0} | Output: ${outputTokens || 0} | TOTAL: ${regularCost} tokens`);

      
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
            logger.log("Raw response text length:", textContent.text.length);
            logger.log("Extracted JSON string length:", jsonString.length);
            logger.log("First 100 chars of JSON:", jsonString.substring(0, 100));
            logger.log("Last 100 chars of JSON:", jsonString.substring(Math.max(0, jsonString.length - 100)));
            
            let parsedContent;
            
            try {
              parsedContent = JSON.parse(jsonString);
            } catch (parseError) {
              logger.log('🚨 Initial JSON parse failed, trying emergency fallback...');
              
              // Emergency fallback: manually extract values using regex
              try {
                // Use a more comprehensive regex pattern that can handle multi-line values
                const furiganaMatch = textContent.text.match(/"readingsText"\s*:\s*"((?:\\.|[^"\\])*?)"/s);
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
                  
                  logger.log("Extracted furigana length:", furiganaValue.length);
                  logger.log("Extracted translation length:", translationValue.length);
                  
                  parsedContent = {
                    readingsText: furiganaValue,
                    translatedText: translationValue
                  };
                  
                  logger.log('✅ Emergency fallback parsing successful');
                } else {
                  // Try even more aggressive extraction
                  logger.log("Regex extraction failed, trying direct string search...");
                  
                  const furiganaTextKey = '"readingsText":';
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
                    
                    logger.log("Direct extraction furigana length:", furiganaValue.length);
                    logger.log("Direct extraction translation length:", translationValue.length);
                    
                    parsedContent = {
                      readingsText: furiganaValue,
                      translatedText: translationValue
                    };
                    
                    logger.log('✅ Direct string extraction successful');
                  } else {
                    throw new Error('Could not extract values with direct string search');
                  }
                }
              } catch (fallbackError) {
                logger.error('❌ Emergency fallback also failed:', fallbackError);
                throw parseError; // Re-throw original error
              }
            }
            
            // Check if the translation appears to be in the target language or if it's likely still in English
            const translatedText = parsedContent.translatedText || "";
            const translatedPreview = translatedText.substring(0, 60) + (translatedText.length > 60 ? "..." : "");
            logger.log(`Translation complete: "${translatedPreview}"`);
            
            // CRITICAL: Run Korean romanization validation BEFORE smart verification early return
            // This ensures we catch cases where Claude returns romanization-only without Korean characters
            let earlyFuriganaText2 = applyKoreanRomanizationGuards(parsedContent.readingsText || "", "initial-parse-early-path2");
            
            if ((primaryLanguage === "Korean" || forcedLanguage === 'ko') && earlyFuriganaText2) {
              const koreanValidation = validateKoreanRomanization(text, earlyFuriganaText2);
              logger.log(`Korean romanization validation (early path 2): ${koreanValidation.details}`);
              
              if (!koreanValidation.isValid && koreanValidation.accuracy < 50) {
                logger.warn(`CRITICAL: Korean romanization failed - ${koreanValidation.details}`);
                
                // Check if this is a critical failure (romanization-only without Korean)
                const isCriticalFailure = koreanValidation.accuracy === 0 && koreanValidation.issues.some(i => i.includes('CRITICAL'));
                
                if (isCriticalFailure && retryCount === 0) {
                  logger.log("Retrying with explicit Korean preservation prompt (path 2)...");
                  retryCount++;
                  
                  const koreanRetryPrompt = `
${promptTopSection}
CRITICAL ERROR: KOREAN TEXT WAS LOST - MUST PRESERVE ORIGINAL HANGUL

You are a Korean language expert. The previous attempt FAILED because you returned only romanization without the original Korean characters.

WHAT WENT WRONG:
- Input had slashes (/) or parentheses in the text
- You returned ONLY romanization like "eun/neun" instead of "은(eun)/는(neun)"
- The original Korean characters were completely lost

Original text: "${text}"

ABSOLUTE REQUIREMENT - DO NOT IGNORE:
1. You MUST preserve ALL original Korean (Hangul) characters
2. Add romanization in parentheses AFTER each Korean word
3. Format: 한글(romanization) - Korean FIRST, then romanization in parentheses
4. If input has slashes like "은/는", output "은(eun)/는(neun)" - annotate EACH word separately
5. If input has parentheses like "(목적격 조사)", keep them and add romanization: "(목적격(mog-jeog-gyeog) 조사(jo-sa))"

CORRECT EXAMPLES:
- "문법 포인트" → "문법(mun-beop) 포인트(po-in-teu)"
- "은/는 vs 이/가" → "은(eun)/는(neun) vs 이(i)/가(ga)"
- "(목적격 조사)" → "(목적격(mog-jeog-gyeog) 조사(jo-sa))"
- "에서/에/로" → "에서(e-seo)/에(e)/로(ro)"

WRONG (DO NOT DO THIS):
- "munbeob po-in-teu" ❌ (missing Korean characters)
- "eun/neun vs i/ga" ❌ (missing Korean characters)
- "munbeob(moon-beob)" ❌ (romanization with romanization - NO Korean!)

TRANSLATION REQUIREMENTS (CRITICAL):
- translatedText must be a PURE ${targetLangName} translation
- Do NOT include any romanization (eun, neun, i, ga, etc.) in the translation
- Do NOT mix romanization with ${targetLangName} words
- Translate the MEANING of the Korean text into natural ${targetLangName}
- Example: "은/는 vs 이/가" should translate to a ${targetLangName} explanation of these particles, NOT "eun/neun vs i/ga"

Format your response as valid JSON:
{
  "readingsText": "MUST contain original Korean text with romanization in parentheses",
  "translatedText": "PURE ${targetLangName} translation - NO romanization, only natural ${targetLangName} text"
}
`;
                  
                  try {
                    const retryResponse = await axios.post(
                      'https://api.anthropic.com/v1/messages',
                      {
                        model: "claude-haiku-4-5-20251001",
                        max_tokens: 4000,
                        temperature: 0.1,
                        messages: [{ role: "user", content: koreanRetryPrompt }]
                      },
                      {
                        headers: {
                          'x-api-key': apiKey,
                          'Content-Type': 'application/json',
                          'anthropic-version': '2023-06-01'
                        },
                        timeout: 60000
                      }
                    );
                    
                    if (retryResponse.data?.content?.[0]?.text) {
                      const retryText = retryResponse.data.content[0].text;
                      logger.log("Korean retry response (path 2):", retryText.substring(0, 200) + "...");
                      
                      const retryJson = cleanJsonString(retryText);
                      const retryParsed = JSON.parse(retryJson);
                      
                      const retryValidation = validateKoreanRomanization(text, retryParsed.readingsText || "");
                      logger.log(`Korean retry validation (path 2): ${retryValidation.details}`);
                      
                      if (retryValidation.accuracy > koreanValidation.accuracy) {
                        earlyFuriganaText2 = applyKoreanRomanizationGuards(retryParsed.readingsText || "", "korean-retry-early-path2");
                        logger.log(`Korean retry successful (path 2) - improved from ${koreanValidation.accuracy}% to ${retryValidation.accuracy}%`);
                        
                        // Update parsedContent with retry results
                        parsedContent.readingsText = earlyFuriganaText2;
                        if (retryParsed.translatedText) {
                          parsedContent.translatedText = retryParsed.translatedText;
                        }
                      }
                    }
                  } catch (retryError) {
                    logger.error("Korean retry failed (path 2):", retryError);
                  }
                }
              }
            }
            
            // SMART VERIFICATION: Assess translation quality before expensive verification
            const qualityAssessment = assessTranslationQuality(translatedText, targetLanguage, text.length);
            logger.log(`🎯 [Smart Verification] Quality assessment: ${qualityAssessment.score}/100 (${qualityAssessment.reasons.join(', ') || 'no issues'})`);

            if (qualityAssessment.needsVerification && retryCount < MAX_RETRIES - 1) {
              logger.log("⚠️ [Smart Verification] Low quality detected, running verification...");
            } else if (!qualityAssessment.needsVerification) {
              logger.log("✅ [Smart Verification] High quality confirmed, skipping verification");
              
              const result = {
                readingsText: earlyFuriganaText2,
                translatedText: sanitizeTranslatedText(parsedContent.translatedText || "", targetLanguage),
                tokenUsage: { input: inputTokens ?? 0, output: outputTokens ?? 0, total: (inputTokens ?? 0) + (outputTokens ?? 0) }
              };

              // Log successful API call (early return path 2)
              try {
                logger.log('[Claude API] About to log translate API call (early return path 2)...');
                await logClaudeAPI(metrics, true, JSON.stringify(result), undefined, {
                  model: 'claude-haiku-4-5-20251001',
                  targetLanguage,
                  forcedLanguage,
                  textLength: text.length,
                  hasJapanese: result.readingsText ? true : false,
                  parseMethod: 'direct',
                  operationType: 'translate'
                }, inputTokens, outputTokens);
                logger.log('[Claude API] Successfully logged translate API call (early return path 2)');
              } catch (logError) {
                logger.error('[Claude API] Error logging translate API call (early return path 2):', logError);
              }

              return result;
            }

            // Only run verification if quality assessment indicates it's needed
            if (qualityAssessment.needsVerification && retryCount < MAX_RETRIES - 1) {
              logger.log("🔍 [Smart Verification] Running verification to ensure completeness...");
              
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
  "readingsText": "${parsedContent.readingsText || ""}", 
  "translatedText": "Complete and accurate translation in ${targetLangName} - either the original if it was complete, or a new complete translation if it wasn't"
}`;

              // Start logging metrics for verification
              const verificationMetrics: APIUsageMetrics = apiLogger.startAPICall('https://api.anthropic.com/v1/messages', {
                operation: 'translation_verification',
                textLength: text.length
              });

              // Make verification request
              const verificationResponse = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                  model: "claude-haiku-4-5-20251001",
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
              
              // Extract token usage from verification response
              const verificationUsage = verificationResponse.data?.usage;
              const verificationInputTokens = verificationUsage?.input_tokens;
              const verificationOutputTokens = verificationUsage?.output_tokens;
              
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
                    logger.log("Verification raw response text length:", verificationTextContent.text.length);
                    logger.log("Verification extracted JSON string length:", verificationJsonString.length);
                    
                    const verificationParsedContent = JSON.parse(verificationJsonString);
                    const isComplete = verificationParsedContent.isComplete === true;
                    const analysis = verificationParsedContent.analysis || "";
                    const verifiedTranslatedText = verificationParsedContent.translatedText || "";
                    
                    // Log token usage for verification
                    await logClaudeAPI(verificationMetrics, true, verificationTextContent.text, undefined, {
                      model: 'claude-haiku-4-5-20251001',
                      operationType: 'translation_verification',
                      targetLanguage,
                      forcedLanguage,
                      textLength: text.length
                    }, verificationInputTokens, verificationOutputTokens);
                    
                    if (!isComplete && verifiedTranslatedText.length > translatedText.length) {
                      logger.log(`Translation was incomplete. Analysis: ${analysis}`);
                      logger.log("Using improved translation from verification");
                      logger.log(`New translation: "${verifiedTranslatedText.substring(0, 60)}${verifiedTranslatedText.length > 60 ? '...' : ''}"`);
                      
                      return {
                        readingsText: restoreSlashes(parsedContent.readingsText || ""),
                        translatedText: sanitizeTranslatedText(verifiedTranslatedText, targetLanguage)
                      };
                    } else {
                      logger.log(`Translation verification result: ${isComplete ? 'Complete' : 'Incomplete'}`);
                      if (!isComplete) {
                        logger.log(`Analysis: ${analysis}`);
                        logger.log("Verification did not provide a better translation - using original");
                      }
                    }
                  } catch (verificationParseError) {
                    logger.error("Error parsing verification response:", verificationParseError);
                    // Log error for verification
                    await logClaudeAPI(verificationMetrics, false, undefined, verificationParseError instanceof Error ? verificationParseError : new Error(String(verificationParseError)), {
                      model: 'claude-haiku-4-5-20251001',
                      operationType: 'translation_verification',
                      targetLanguage,
                      forcedLanguage
                    }, verificationInputTokens, verificationOutputTokens);
                    // Continue with original result
                  }
                } else {
                  // Log error if no text content found
                  await logClaudeAPI(verificationMetrics, false, undefined, new Error('No text content in verification response'), {
                    model: 'claude-haiku-4-5-20251001',
                    operationType: 'translation_verification',
                    targetLanguage,
                    forcedLanguage
                  }, verificationInputTokens, verificationOutputTokens);
                }
              } else {
                // Log error if response structure is invalid
                await logClaudeAPI(verificationMetrics, false, undefined, new Error('Invalid verification response structure'), {
                  model: 'claude-haiku-4-5-20251001',
                  operationType: 'translation_verification',
                  targetLanguage,
                  forcedLanguage
                }, verificationInputTokens, verificationOutputTokens);
              }
            }
            
            // For Japanese text, validate furigana coverage
            let furiganaText = applyKoreanRomanizationGuards(parsedContent.readingsText || "", "initial-parse");
            
            // ============================================================================
            // STEP 1: LANGUAGE-SPECIFIC VALIDATION (Script/Format Correctness)
            // Run these FIRST to ensure the correct script is used before checking completeness
            // ============================================================================
            
            // Checkpoint 3: Preparing your word entries (verification phase)
            logger.log('🎯 [Claude API] Checkpoint 3: Preparing your word entries (verification phase)');
            onProgress?.(3);
            
            // Japanese furigana validation and smart retry logic
            if ((primaryLanguage === "Japanese" || forcedLanguage === 'ja') && furiganaText) {
              const validation = validateJapaneseFurigana(text, furiganaText);
              logger.log(`Furigana validation: ${validation.details}`);
              
              if (!validation.isValid) {
                logger.warn(`Incomplete furigana coverage: ${validation.details}`);
                
                // If this is the first attempt and we have significant missing furigana, retry with more aggressive prompt
                if (retryCount === 0 && (validation.missingKanjiCount > 0 || validation.details.includes("incorrect readings"))) {
                  logger.log("Retrying with more aggressive furigana prompt...");
                  trackInternalApiCall(`Furigana retry (${validation.missingKanjiCount} missing kanji, ${validation.details})`);
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
4. USE STANDARD DICTIONARY READINGS - do NOT combine individual kanji sounds phonetically
5. If you're unsure of a reading, use the most common one 
6. DO NOT SKIP ANY KANJI - this is mandatory

CRITICAL: STANDARD DICTIONARY READINGS FOR COMPOUNDS - DO NOT COMBINE PHONETICALLY:
- Compound words MUST use their STANDARD DICTIONARY READING - consult your knowledge of established pronunciations
- DO NOT create readings by combining individual kanji sounds (e.g., 最安値 = さい+あん+ち is WRONG - correct is さいやすね)
- Look for compound words, counter words, and context-dependent readings FIRST
- Numbers + counters (匹、人、本、個、etc.) should be read as units with rendaku
- 一匹 = いっぴき (NOT いちひき), 三匹 = さんびき (NOT さんひき)
- Only split into individual kanji when no compound reading exists

COMPOUND WORD VERIFICATION - MANDATORY:
For EVERY compound word, verify: "Did I use the standard dictionary reading, or did I combine individual kanji readings phonetically?"
You MUST check common compounds like these for their correct STANDARD readings:
- 車道 = しゃどう (NOT くるまみち - standard dictionary reading)
- 歩道 = ほどう (NOT あるきみち - standard dictionary reading)
- 自転車 = じてんしゃ (NOT じでんしゃ - standard dictionary reading)
- 新聞 = しんぶん (NOT しんもん - standard dictionary reading)
- 今朝 = けさ (NOT いまあさ - standard dictionary reading)
- 市場 = いちば (standard dictionary reading, context dependent)
- 一人 = ひとり (NOT いちにん - standard dictionary reading)
- 二人 = ふたり (NOT ににん - standard dictionary reading)
- 今日 = きょう (NOT いまひ/こんにち - standard dictionary reading)
- 明日 = あした/あす (NOT みょうにち - standard dictionary reading)
- 昨日 = きのう (NOT さくじつ - standard dictionary reading)
- 大人 = おとな (NOT だいじん - standard dictionary reading)
- 子供 = こども (NOT しきょう - standard dictionary reading)

MANDATORY FORMAT for each kanji word:
- Counter words: 一匹(いっぴき), 三匹(さんびき), 一人(ひとり)
- Compound words: 東京(とうきょう), 日本語(にほんご), 大学生(だいがくせい)
- Mixed words: 勉強する(べんきょうする)
- Individual kanji (only when not compound): 食(た)べ物(もの)
- Single-kanji words: 左(ひだり), 右(みぎ), 上(うえ), 下(した) - NEVER skip these!

VERIFICATION STEP: Before responding, manually check:
1. Original kanji count: ${validation.totalKanjiCount}
2. Your furigana count: [must equal ${validation.totalKanjiCount}]
3. For each compound word: "Is this the standard dictionary reading, or did I combine individual kanji readings?"
4. All compound words have correct STANDARD DICTIONARY readings, not phonetic combinations
5. Every single-kanji word has furigana (左, 右, 上, 下, etc.)

Format as JSON:
{
  "readingsText": "Text with furigana for ALL ${validation.totalKanjiCount} kanji - MANDATORY",
  "translatedText": "Translation in ${targetLangName}"
}`;

                  // Start logging metrics for retry
                  const retryMetrics: APIUsageMetrics = apiLogger.startAPICall('https://api.anthropic.com/v1/messages', {
                    operation: 'furigana_retry',
                    textLength: text.length
                  });

                  // Make retry request
                  const retryResponse = await axios.post(
                    'https://api.anthropic.com/v1/messages',
                    {
                      model: "claude-haiku-4-5-20251001",
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

                  // Extract token usage from retry response
                  const retryUsage = retryResponse.data?.usage;
                  const retryInputTokens = retryUsage?.input_tokens;
                  const retryOutputTokens = retryUsage?.output_tokens;

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
                        logger.log("Retry raw response text:", retryTextContent.text);
                        logger.log("Retry extracted JSON string:", retryJsonString);
                        logger.log("Retry first 100 chars of JSON:", retryJsonString.substring(0, 100));
                        logger.log("Retry last 100 chars of JSON:", retryJsonString.substring(Math.max(0, retryJsonString.length - 100)));
                        
                        const retryParsedContent = JSON.parse(retryJsonString);
                        
                        const retryFuriganaText = retryParsedContent.readingsText || "";
                        const retryValidation = validateJapaneseFurigana(text, retryFuriganaText);
                        
                        logger.log(`Retry furigana validation: ${retryValidation.details}`);
                        
                        // Log token usage for retry
                        await logClaudeAPI(retryMetrics, true, retryTextContent.text, undefined, {
                          model: 'claude-haiku-4-5-20251001',
                          operationType: 'furigana_retry',
                          targetLanguage,
                          forcedLanguage,
                          textLength: text.length
                        }, retryInputTokens, retryOutputTokens);
                        
                        if (retryValidation.isValid || 
                            retryValidation.missingKanjiCount < validation.missingKanjiCount || 
                            (!retryValidation.details.includes("incorrect readings") && validation.details.includes("incorrect readings"))) {
                          // Use retry result if it's better
                          furiganaText = retryFuriganaText;
                          logger.log("Retry successful - using improved furigana result");
                        } else {
                          logger.log("Retry did not improve furigana coverage - using original result");
                        }
                      } catch (retryParseError) {
                        logger.error("Error parsing retry response:", retryParseError);
                        // Log error for retry
                        await logClaudeAPI(retryMetrics, false, undefined, retryParseError instanceof Error ? retryParseError : new Error(String(retryParseError)), {
                          model: 'claude-haiku-4-5-20251001',
                          operationType: 'furigana_retry',
                          targetLanguage,
                          forcedLanguage
                        }, retryInputTokens, retryOutputTokens);
                        // Continue with original result
                      }
                    } else {
                      // Log error if no text content found
                      await logClaudeAPI(retryMetrics, false, undefined, new Error('No text content in retry response'), {
                        model: 'claude-haiku-4-5-20251001',
                        operationType: 'furigana_retry',
                        targetLanguage,
                        forcedLanguage
                      }, retryInputTokens, retryOutputTokens);
                    }
                  } else {
                    // Log error if response structure is invalid
                    await logClaudeAPI(retryMetrics, false, undefined, new Error('Invalid retry response structure'), {
                      model: 'claude-haiku-4-5-20251001',
                      operationType: 'furigana_retry',
                      targetLanguage,
                      forcedLanguage
                    }, retryInputTokens, retryOutputTokens);
                  }
                }
              }
            }

            // Chinese pinyin validation and smart retry logic
            if ((primaryLanguage === "Chinese" || forcedLanguage === 'zh') && furiganaText) {
              const validation = validatePinyinAccuracy(text, furiganaText);
              logger.log(`Pinyin validation: ${validation.details}`);
              
              if (!validation.isValid && validation.accuracy < 85) {
                logger.warn(`Pinyin quality issues detected: ${validation.details}`);
                
                // If this is the first attempt and we have significant issues, retry with enhanced correction prompt
                if (retryCount === 0 && validation.issues.length > 0) {
                  logger.log("Retrying with enhanced pinyin correction prompt...");
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
  "readingsText": "Chinese text with corrected pinyin addressing all issues above",
  "translatedText": "Translation in ${targetLangName}"
}`;

                  // Make retry request
                  const retryResponse = await axios.post(
                    'https://api.anthropic.com/v1/messages',
                    {
                      model: "claude-haiku-4-5-20251001",
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
                        
                        const retryPinyinText = retryParsedContent.readingsText || "";
                        const retryValidation = validatePinyinAccuracy(text, retryPinyinText);
                        
                        logger.log(`Retry pinyin validation: ${retryValidation.details}`);
                        logger.log(`Retry accuracy: ${retryValidation.accuracy}%`);
                        
                        // Use retry result if it's significantly better
                        if (retryValidation.accuracy > validation.accuracy + 10 || 
                            (retryValidation.isValid && !validation.isValid)) {
                          furiganaText = retryPinyinText;
                          logger.log(`Retry successful - improved accuracy from ${validation.accuracy}% to ${retryValidation.accuracy}%`);
                        } else {
                          logger.log(`Retry did not significantly improve pinyin quality - using original result`);
                        }
                      } catch (retryParseError) {
                        logger.error("Error parsing pinyin retry response:", retryParseError);
                        // Continue with original result
                      }
                    }
                  }
                }
              } else if (validation.isValid) {
                logger.log(`Pinyin validation passed with ${validation.accuracy}% accuracy`);
              }
            }

            // Korean romanization validation and smart retry logic
            if ((primaryLanguage === "Korean" || forcedLanguage === 'ko') && furiganaText) {
              const validation = validateKoreanRomanization(text, furiganaText);
              logger.log(`Korean romanization validation: ${validation.details}`);
              
              if (!validation.isValid && validation.accuracy < 90) {
                logger.warn(`Korean romanization quality issues detected: ${validation.details}`);
                
                // If this is the first attempt and we have significant issues, retry with enhanced correction prompt
                if (retryCount === 0 && validation.issues.length > 0) {
                  logger.log("Retrying with enhanced Korean romanization correction prompt...");
                  retryCount++;
                  
                  // Check if this is a critical failure (romanization-only without Korean)
                  const isCriticalFailure = validation.accuracy === 0 && validation.issues.some(i => i.includes('CRITICAL'));
                  
                  // Create specific correction prompt based on validation issues
                  const correctionPrompt = isCriticalFailure ? `
${promptTopSection}
CRITICAL ERROR: KOREAN TEXT WAS LOST - MUST PRESERVE ORIGINAL HANGUL

You are a Korean language expert. The previous attempt FAILED because you returned only romanization without the original Korean characters.

WHAT WENT WRONG:
- Input had slashes (/) or parentheses in the text
- You returned ONLY romanization like "eun/neun" instead of "은(eun)/는(neun)"
- The original Korean characters were completely lost

Original text: "${text}"

ABSOLUTE REQUIREMENT - DO NOT IGNORE:
1. You MUST preserve ALL original Korean (Hangul) characters
2. Add romanization in parentheses AFTER each Korean word
3. Format: 한글(romanization) - Korean FIRST, then romanization in parentheses
4. If input has slashes like "은/는", output "은(eun)/는(neun)" - annotate EACH word separately
5. If input has parentheses like "(목적격 조사)", keep them and add romanization: "(목적격(mog-jeog-gyeog) 조사(jo-sa))"

CORRECT EXAMPLES:
- "문법 포인트" → "문법(mun-beop) 포인트(po-in-teu)"
- "은/는 vs 이/가" → "은(eun)/는(neun) vs 이(i)/가(ga)"
- "(목적격 조사)" → "(목적격(mog-jeog-gyeog) 조사(jo-sa))"
- "에서/에/로" → "에서(e-seo)/에(e)/로(ro)"

WRONG (DO NOT DO THIS):
- "munbeob po-in-teu" ❌ (missing Korean characters)
- "eun/neun vs i/ga" ❌ (missing Korean characters)

TRANSLATION REQUIREMENTS (CRITICAL):
- translatedText must be a PURE ${targetLangName} translation
- Do NOT include any romanization (eun, neun, i, ga, etc.) in the translation
- Do NOT mix romanization with ${targetLangName} words
- Translate the MEANING of the Korean text into natural ${targetLangName}
- Example: "은/는 vs 이/가" should translate to a ${targetLangName} explanation of these particles, NOT "eun/neun vs i/ga"

Format your response as valid JSON:
{
  "readingsText": "MUST contain original Korean text with romanization in parentheses",
  "translatedText": "PURE ${targetLangName} translation - NO romanization, only natural ${targetLangName} text"
}
` : `
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

CRITICAL REMINDER - PRESERVE KOREAN TEXT:
- ALWAYS keep the original Korean characters: 한글(romanization) format
- NEVER output only romanization without Korean characters
- If input has slashes "은/는", output "은(eun)/는(neun)" - annotate each word

SPECIFIC PATTERN FIXES REQUIRED:
- Past tense: -았/었/였 = -ass/-eoss/-yeoss  
- Formal polite: -습니다 = -seum-ni-da
- Particles: 은/는 = eun/neun, 을/를 = eul/reul
- Time expressions: 시 = si, 시간 = si-gan
- Causative forms: -시키다 = -si-ki-da

Format your response as valid JSON with these exact keys:
{
  "readingsText": "Korean text with corrected romanization addressing all issues above",
  "translatedText": "Accurate translation in ${targetLangName} language"
}

CRITICAL: Address every issue listed above. Double-check vowel distinctions and syllable boundaries.
`;

                  try {
                    logger.log('Making Korean romanization correction request to Claude...');
                    const retryResponse = await axios.post(
                      'https://api.anthropic.com/v1/messages',
                      {
                        model: "claude-haiku-4-5-20251001",
                        max_tokens: 4000,
                        temperature: 0.1,
                        messages: [{
                          role: "user",
                          content: correctionPrompt
                        }]
                      },
                      {
                        headers: {
                          'x-api-key': apiKey,
                          'Content-Type': 'application/json',
                          'anthropic-version': '2023-06-01'
                        },
                        timeout: 60000
                      }
                    );

                    if (retryResponse.data && retryResponse.data.content && retryResponse.data.content[0] && retryResponse.data.content[0].text) {
                      try {
                        const retryResponseText = retryResponse.data.content[0].text;
                        logger.log("Retry response received:", retryResponseText.substring(0, 200) + "...");
                        
                        const retryCleanedJson = cleanJsonString(retryResponseText);
                        const retryParsedResponse = JSON.parse(retryCleanedJson);
                        const retryRomanizedText = retryParsedResponse.readingsText;
                        
                        // Validate the retry result
                        const retryValidation = validateKoreanRomanization(text, retryRomanizedText);
                        logger.log(`Korean retry validation: ${retryValidation.details}`);
                        
                        // Use retry result if it's significantly better
                        if (retryValidation.accuracy > validation.accuracy + 5 || 
                            (retryValidation.isValid && !validation.isValid)) {
                          furiganaText = applyKoreanRomanizationGuards(retryRomanizedText, "korean-retry");
                          logger.log(`Korean retry successful - improved accuracy from ${validation.accuracy}% to ${retryValidation.accuracy}%`);
                        } else {
                          logger.log(`Korean retry did not significantly improve romanization quality - using original result`);
                        }
                      } catch (retryParseError) {
                        logger.error("Error parsing Korean romanization retry response:", retryParseError);
                        // Continue with original result
                      }
                    }
                  } catch (retryError) {
                    logger.error("Error during Korean romanization retry:", retryError);
                    // Continue with original result
                  }
                }
              } else if (validation.isValid) {
                logger.log(`Korean romanization validation passed with ${validation.accuracy}% accuracy`);
              }
            }

          // Russian with readings: validate Cyrillic + romanization quality (re-enabled now that we request readings)
          if ((primaryLanguage === "Russian" || forcedLanguage === 'ru') && furiganaText) {
            const validation = validateRussianTransliteration(text, furiganaText);
            logger.log(`Russian transliteration validation: ${validation.details}`);
            
            if (!validation.isValid && validation.cyrillicCoverage < 90) {
              logger.warn(`Russian transliteration quality issues detected: ${validation.details}`);
              
              // FIRST: Try automatic rebuild if Cyrillic is missing
              if (validation.cyrillicCoverage < 50) {
                logger.log('Attempting automatic rebuild of Russian text with Cyrillic base...');
                const rebuilt = rebuildRussianFuriganaFromRomanization(text, furiganaText);
                
                if (rebuilt) {
                  const rebuildValidation = validateRussianTransliteration(text, rebuilt);
                  logger.log(`Rebuild validation: ${rebuildValidation.details}`);
                  
                  if (rebuildValidation.cyrillicCoverage > validation.cyrillicCoverage) {
                    furiganaText = rebuilt;
                    logger.log(`Automatic rebuild successful - improved Cyrillic coverage from ${validation.cyrillicCoverage}% to ${rebuildValidation.cyrillicCoverage}%`);
                    
                    // Re-validate after rebuild
                    if (rebuildValidation.isValid) {
                      logger.log('Russian text validated successfully after rebuild');
                    }
                  }
                }
              }
              
              // SECOND: If still not valid and this is first attempt, retry with corrective prompt
              const finalValidation = validateRussianTransliteration(text, furiganaText);
              if (!finalValidation.isValid && finalValidation.cyrillicCoverage < 90 && retryCount === 0 && validation.issues.length > 0) {
                logger.log("Retrying with enhanced Russian transliteration correction prompt...");
                retryCount++;
                
                // Create specific correction prompt based on validation issues
                const correctionPrompt = `
${promptTopSection}
CRITICAL RUSSIAN TRANSLITERATION RETRY - PREVIOUS ATTEMPT HAD QUALITY ISSUES

You are a Russian language expert. The previous attempt had these specific issues that must be fixed:

DETECTED ISSUES:
${validation.issues.map(issue => `- ${issue}`).join('\n')}

SUGGESTED CORRECTIONS:
${validation.suggestions.map(suggestion => `- ${suggestion}`).join('\n')}

Original text: "${text}"
Previous result Cyrillic coverage: ${validation.cyrillicCoverage}%

MANDATORY CORRECTIONS - Fix these specific problems:
1. ${validation.issues.some(i => i.includes('Missing Cyrillic')) ? 'PRESERVE ORIGINAL CYRILLIC TEXT - DO NOT replace with romanization' : ''}
2. ${validation.issues.some(i => i.includes('without Cyrillic base')) ? 'ADD CYRILLIC BASE before romanization - format must be: Русский(russkiy) NOT Putin(Putin)' : ''}
3. ${validation.issues.some(i => i.includes('palatalization')) ? 'ADD PALATALIZATION MARKERS - soft consonants need apostrophes (ь = \')' : ''}
4. ${validation.issues.some(i => i.includes('coverage')) ? 'ENSURE COMPLETE COVERAGE - every Russian word must have transliteration' : ''}

CRITICAL FORMAT REQUIREMENTS:
- MUST preserve original Cyrillic characters as the BASE text
- Add romanization in parentheses AFTER the Cyrillic
- Format: Путин(Putin) заявил(zayavil) NOT Putin(Putin) zayavil(zayavil)
- Soft sign (ь) must become apostrophe in romanization: Путь(put')

Examples of CORRECT formatting:
- "Привет мир" → "Привет(privet) мир(mir)"
- "Учитель" → "Учитель(uchitel')" [note the apostrophe for ь]
- "Словарь" → "Словарь(slovar')" [note the apostrophe for ь]
- "Путин заявил" → "Путин(Putin) заявил(zayavil)"

WRONG examples (DO NOT USE):
- "privet (hello)" ❌ (missing Cyrillic base)
- "Putin(Putin)" ❌ (Latin base instead of Cyrillic)
- "uchitel" ❌ (missing palatalization marker for ь)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "Russian text with Cyrillic base + transliteration addressing all issues above",
  "translatedText": "Accurate translation in ${targetLangName} language"
}

CRITICAL: Every Russian word must have its ORIGINAL CYRILLIC text preserved with romanization in parentheses.
`;

                try {
                  logger.log('Making Russian transliteration correction request to Claude...');
                  const retryResponse = await axios.post(
                    'https://api.anthropic.com/v1/messages',
                    {
                      model: "claude-haiku-4-5-20251001",
                      max_tokens: 4000,
                      temperature: 0,
                      messages: [{
                        role: "user",
                        content: correctionPrompt
                      }]
                    },
                    {
                      headers: {
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01',
                        'x-api-key': apiKey
                      },
                      timeout: 60000
                    }
                  );

                  if (retryResponse.data && retryResponse.data.content && retryResponse.data.content[0] && retryResponse.data.content[0].text) {
                    try {
                      const retryResponseText = retryResponse.data.content[0].text;
                      logger.log("Russian retry response received:", retryResponseText.substring(0, 200) + "...");
                      
                      const retryCleanedJson = cleanJsonString(retryResponseText);
                      const retryParsedResponse = JSON.parse(retryCleanedJson);
                      const retryTransliteratedText = retryParsedResponse.readingsText;
                      
                      // Validate the retry result
                      const retryValidation = validateRussianTransliteration(text, retryTransliteratedText);
                      logger.log(`Russian retry validation: ${retryValidation.details}`);
                      
                      // Use retry result if it's significantly better
                      if (retryValidation.cyrillicCoverage > finalValidation.cyrillicCoverage + 10 || 
                          (retryValidation.isValid && !finalValidation.isValid)) {
                        furiganaText = retryTransliteratedText;
                        logger.log(`Russian retry successful - improved Cyrillic coverage from ${finalValidation.cyrillicCoverage}% to ${retryValidation.cyrillicCoverage}%`);
                      } else {
                        logger.log(`Russian retry did not significantly improve transliteration quality - using current result`);
                      }
                    } catch (retryParseError) {
                      logger.error("Error parsing Russian retry response:", retryParseError);
                      // Continue with current result
                    }
                  }
                } catch (retryError) {
                  logger.error("Error during Russian transliteration retry:", retryError);
                  // Continue with current result
                }
              }
            } else if (validation.isValid) {
              logger.log(`Russian transliteration validation passed with ${validation.cyrillicCoverage}% Cyrillic coverage`);
            }
          }

          // Arabic romanization validation and smart retry logic
          if ((primaryLanguage === "Arabic" || forcedLanguage === 'ar') && furiganaText) {
            // FIRST: Strip any diacritical marks that Claude may have used
            // This converts academic transliteration (k̲h̲, ṣ, ḍ) to simple Chat Alphabet (kh, s, d)
            const hasDiacritics = /[\u0300-\u036F\u0323-\u0333]/.test(furiganaText);
            if (hasDiacritics) {
              logger.log('[Arabic] Detected diacritical marks in romanization, stripping them...');
              furiganaText = stripArabicDiacritics(furiganaText);
            }
            
            const validation = validateArabicRomanization(text, furiganaText);
            logger.log(`Arabic romanization validation: ${validation.details}`);
            
            if (!validation.isValid && validation.accuracy < 90) {
              logger.warn(`Arabic romanization quality issues detected: ${validation.details}`);
              
              // If this is first attempt and we have significant issues, retry with corrective prompt
              if (retryCount === 0 && validation.issues.length > 0) {
                logger.log("Retrying with enhanced Arabic romanization correction prompt...");
                retryCount++;
                
                // Create specific correction prompt based on validation issues
                const correctionPrompt = `
${promptTopSection}
CRITICAL ARABIC ROMANIZATION RETRY - PREVIOUS ATTEMPT HAD FORMATTING ISSUES

You are an Arabic language expert. The previous attempt had these specific issues that must be fixed:

DETECTED ISSUES:
${validation.issues.map(issue => `- ${issue}`).join('\n')}

SUGGESTED CORRECTIONS:
${validation.suggestions.map(suggestion => `- ${suggestion}`).join('\n')}

Original text: "${text}"
Previous result Arabic coverage: ${validation.arabicCoverage}%
Previous result accuracy: ${validation.accuracy}%

MANDATORY CORRECTIONS - Fix these specific problems:
1. ${validation.issues.some(i => i.includes('Missing Arabic base')) ? 'PRESERVE ORIGINAL ARABIC TEXT - DO NOT replace with romanization' : ''}
2. ${validation.issues.some(i => i.includes('wrong order')) ? 'CORRECT ORDER - Must be Arabic(romanization), NOT (romanization)Arabic' : ''}
3. ${validation.issues.some(i => i.includes('without Arabic base')) ? 'ADD ARABIC BASE before romanization - format must be: العربية(al-arabiya) NOT (al-arabiya)' : ''}
4. ${validation.issues.some(i => i.includes('Sun letter')) ? 'FIX SUN LETTER ASSIMILATION - at-/ad-/ar-/as-/ash-/an- NOT al-' : ''}
5. ${validation.issues.some(i => i.includes('coverage')) ? 'ENSURE COMPLETE COVERAGE - every Arabic word must have Chat Alphabet romanization' : ''}

CRITICAL FORMAT REQUIREMENTS:
- MUST preserve original Arabic characters as the BASE text
- Add Chat Alphabet romanization in parentheses AFTER the Arabic
- Format: العربية(al-arabiya) NOT (al-arabiya) or (al-arabiya)العربية
- Use proper sun letter assimilation (at-/ar-/as-/ash- etc.)

Examples of CORRECT formatting:
- "مرحبا" → "مرحبا(marhabaa)"
- "السلام عليكم" → "السلام(as-salaam) عليكم('alaykum)"
- "الشمس" → "الشمس(ash-shams)" [sun letter assimilation]
- "الوزير" → "الوزير(al-waziir)" [moon letter - no assimilation]

WRONG examples (DO NOT USE):
- "(marhabaa)" ❌ (missing Arabic base)
- "(sarakha)صرخ" ❌ (wrong order - romanization before Arabic)
- "الشمس(al-shams)" ❌ (missing sun letter assimilation - should be ash-shams)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "Arabic text with Arabic base + Chat Alphabet addressing all issues above",
  "translatedText": "Accurate translation in ${targetLangName} language"
}

CRITICAL: Every Arabic word must have its ORIGINAL ARABIC text preserved with romanization in parentheses immediately after.
`;

                try {
                  logger.log('Making Arabic romanization correction request to Claude...');
                  const retryResponse = await axios.post(
                    'https://api.anthropic.com/v1/messages',
                    {
                      model: "claude-haiku-4-5-20251001",
                      max_tokens: 4000,
                      temperature: 0,
                      messages: [{
                        role: "user",
                        content: correctionPrompt
                      }]
                    },
                    {
                      headers: {
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01',
                        'x-api-key': apiKey
                      },
                      timeout: 60000
                    }
                  );

                  if (retryResponse.data && retryResponse.data.content && retryResponse.data.content[0] && retryResponse.data.content[0].text) {
                    try {
                      const retryResponseText = retryResponse.data.content[0].text;
                      logger.log("Arabic retry response received:", retryResponseText.substring(0, 200) + "...");
                      
                      const retryCleanedJson = cleanJsonString(retryResponseText);
                      const retryParsedResponse = JSON.parse(retryCleanedJson);
                      const retryRomanizedText = retryParsedResponse.readingsText;
                      
                      // Validate the retry result
                      const retryValidation = validateArabicRomanization(text, retryRomanizedText);
                      logger.log(`Arabic retry validation: ${retryValidation.details}`);
                      
                      // Use retry result if it's significantly better
                      if (retryValidation.accuracy > validation.accuracy + 10 || 
                          (retryValidation.isValid && !validation.isValid)) {
                        furiganaText = retryRomanizedText;
                        logger.log(`Arabic retry successful - improved accuracy from ${validation.accuracy}% to ${retryValidation.accuracy}%`);
                      } else {
                        logger.log(`Arabic retry did not significantly improve romanization quality - using current result`);
                      }
                    } catch (retryParseError) {
                      logger.error("Error parsing Arabic retry response:", retryParseError);
                      // Continue with current result
                    }
                  }
                } catch (retryError) {
                  logger.error("Error during Arabic romanization retry:", retryError);
                  // Continue with current result
                }
              }
            } else if (validation.isValid) {
              logger.log(`Arabic romanization validation passed with ${validation.arabicCoverage}% Arabic coverage and ${validation.accuracy}% accuracy`);
            }
          }

          // Hindi romanization validation and smart retry logic
          if ((primaryLanguage === "Hindi" || forcedLanguage === 'hi') && furiganaText) {
            const validation = validateHindiRomanization(text, furiganaText);
            logger.log(`Hindi romanization validation: ${validation.details}`);
            
            if (!validation.isValid && validation.accuracy < 90) {
              logger.warn(`Hindi romanization quality issues detected: ${validation.details}`);
              
              // If this is first attempt and we have significant issues, retry with corrective prompt
              if (retryCount === 0 && validation.issues.length > 0) {
                logger.log("Retrying with enhanced Hindi romanization correction prompt...");
                retryCount++;
                
                // Create specific correction prompt based on validation issues
                const correctionPrompt = `
${promptTopSection}
CRITICAL HINDI ROMANIZATION RETRY - PREVIOUS ATTEMPT HAD FORMATTING ISSUES

You are a Hindi language expert. The previous attempt had these specific issues that must be fixed:

DETECTED ISSUES:
${validation.issues.map(issue => `- ${issue}`).join('\n')}

SUGGESTED CORRECTIONS:
${validation.suggestions.map(suggestion => `- ${suggestion}`).join('\n')}

Original text: "${text}"
Previous result Hindi coverage: ${validation.hindiCoverage}%
Previous result accuracy: ${validation.accuracy}%

MANDATORY CORRECTIONS - Fix these specific problems:
1. ${validation.issues.some(i => i.includes('Missing Hindi base')) ? 'PRESERVE ORIGINAL HINDI TEXT - DO NOT replace with romanization' : ''}
2. ${validation.issues.some(i => i.includes('wrong order')) ? 'CORRECT ORDER - Must be Hindi(romanization), NOT (romanization)Hindi' : ''}
3. ${validation.issues.some(i => i.includes('without Hindi base')) ? 'ADD HINDI BASE before romanization - format must be: हिन्दी(hindī) NOT (hindī)' : ''}
4. ${validation.issues.some(i => i.includes('inside parentheses')) ? 'MOVE QUOTES OUTSIDE - Format: हूं(hūṃ)" NOT हूं(hūṃ")' : ''}
5. ${validation.issues.some(i => i.includes('vowel length')) ? 'ADD VOWEL LENGTH MARKS - Use ā, ī, ū with macrons for long vowels' : ''}
6. ${validation.issues.some(i => i.includes('retroflex')) ? 'ADD RETROFLEX DOTS - Use ṭ, ḍ, ṇ, ṣ with dots below' : ''}
7. ${validation.issues.some(i => i.includes('coverage')) ? 'ENSURE COMPLETE COVERAGE - every Hindi word must have IAST romanization' : ''}

CRITICAL FORMAT REQUIREMENTS:
- MUST preserve original Devanagari characters as the BASE text
- Add IAST romanization in parentheses AFTER the Hindi
- Format: हिन्दी(hindī) NOT (hindī) or (hindī)हिन्दी
- Quotes and punctuation MUST be OUTSIDE parentheses: हूं(hūṃ)" NOT हूं(hūṃ")
- Use proper IAST with diacritical marks (ā, ī, ū, ṭ, ḍ, ṇ, ṣ, ṃ)

Examples of CORRECT formatting:
- "नमस्ते" → "नमस्ते(namaste)"
- "हिन्दी" → "हिन्दी(hindī)"
- "राष्ट्रपति" → "राष्ट्रपति(rāṣṭrapati)"
- "कहा 'हम यह कर सकते हैं'" → "कहा(kahā) 'हम(ham) यह(yah) कर(kar) सकते(sakte) हैं(haiṃ)'"

WRONG examples (DO NOT USE):
- "(namaste)" ❌ (missing Hindi base)
- "(hindī)हिन्दी" ❌ (wrong order - romanization before Hindi)
- "हूं(hūṃ"" ❌ (quote inside parentheses - should be हूं(hūṃ)")
- "hindi" ❌ (missing macron - should be hindī)
- "rashtrapati" ❌ (missing diacritics - should be rāṣṭrapati)

Format your response as valid JSON with these exact keys:
{
  "readingsText": "Hindi text with Devanagari base + IAST romanization addressing all issues above",
  "translatedText": "Accurate translation in ${targetLangName} language"
}

CRITICAL: Every Hindi word must have its ORIGINAL DEVANAGARI text preserved with romanization in parentheses immediately after. Quotes and punctuation MUST be outside parentheses.
`;

                try {
                  logger.log('Making Hindi romanization correction request to Claude...');
                  const retryResponse = await axios.post(
                    'https://api.anthropic.com/v1/messages',
                    {
                      model: "claude-haiku-4-5-20251001",
                      max_tokens: 4000,
                      temperature: 0,
                      messages: [{
                        role: "user",
                        content: correctionPrompt
                      }]
                    },
                    {
                      headers: {
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01',
                        'x-api-key': apiKey
                      },
                      timeout: 60000
                    }
                  );

                  if (retryResponse.data && retryResponse.data.content && retryResponse.data.content[0] && retryResponse.data.content[0].text) {
                    try {
                      const retryResponseText = retryResponse.data.content[0].text;
                      logger.log("Hindi retry response received:", retryResponseText.substring(0, 200) + "...");
                      
                      const retryCleanedJson = cleanJsonString(retryResponseText);
                      const retryParsedResponse = JSON.parse(retryCleanedJson);
                      const retryRomanizedText = retryParsedResponse.readingsText;
                      
                      // Validate the retry result
                      const retryValidation = validateHindiRomanization(text, retryRomanizedText);
                      logger.log(`Hindi retry validation: ${retryValidation.details}`);
                      
                      // Use retry result if it's significantly better
                      if (retryValidation.accuracy > validation.accuracy + 10 || 
                          (retryValidation.isValid && !validation.isValid)) {
                        furiganaText = retryRomanizedText;
                        logger.log(`Hindi retry successful - improved accuracy from ${validation.accuracy}% to ${retryValidation.accuracy}%`);
                      } else {
                        logger.log(`Hindi retry did not significantly improve romanization quality - using current result`);
                      }
                    } catch (retryParseError) {
                      logger.error("Error parsing Hindi retry response:", retryParseError);
                      // Continue with current result
                    }
                  }
                } catch (retryError) {
                  logger.error("Error during Hindi romanization retry:", retryError);
                  // Continue with current result
                }
              }
            } else if (validation.isValid) {
              logger.log(`Hindi romanization validation passed with ${validation.hindiCoverage}% Hindi coverage and ${validation.accuracy}% accuracy`);
            }
          }
          
            // ============================================================================
            // STEP 2: UNIVERSAL READING VERIFICATION (Completeness Check)
            // Run this AFTER language-specific validation to check for missing annotations
            // SKIP when translating TO a reading language to avoid script confusion
            // ============================================================================
            
            // Universal verification for readings (furigana, pinyin, etc.)
            // Skip if target is a reading language (causes Claude to rewrite source in target script)
            const targetIsReadingLanguage = ['ja', 'zh', 'ko', 'ru', 'ar', 'hi'].includes(targetLanguage);
            if (furiganaText && retryCount < MAX_RETRIES - 1 && !targetIsReadingLanguage) {
              logger.log("Verifying reading completeness...");
              trackInternalApiCall(`Reading verification (${primaryLanguage || forcedLanguage})`);
              
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
- Verify common patterns: particles (은/는 = eun/neun), time expressions (시 = si), causative forms (-시키다 = -si-ki-da)
- Reject any annotations where the base text has zero Hangul (numbers, Latin text, punctuation). Those parentheses must be removed entirely.
- Flag readings that contain Japanese-only romaji such as ni-sen, san-ju, gatsu, desu, shi, or tsu.`;
              } else if (primaryLanguage === "Russian" || forcedLanguage === 'ru') {
                readingType = "transliteration";
                readingSpecificInstructions = `
For Russian text:
- EVERY Cyrillic word should have transliteration
- Readings should follow the pattern: Русский(russkiy)
- Check for any missing transliteration
- Verify transliteration follows standard conventions`;
              } else if (primaryLanguage === "Thai" || forcedLanguage === 'th') {
                readingType = "RTGS romanization";
                readingSpecificInstructions = `
For Thai text:
- EVERY Thai word should have RTGS romanization with NO SPACE before the parenthesis
- CORRECT format: ภาษาไทย(phaasaa thai) - parenthesis directly touches Thai text
- WRONG format: ภาษาไทย (phaasaa thai) - NO spaces before opening parenthesis!
- Check for any missing romanization
- Verify romanization follows RTGS conventions (ph, th, kh, ch for aspirated consonants)
- Ensure no tone marks are used (RTGS doesn't use tone marks)
- Verify compound words and classifiers are treated as units
- Check that long vowels are properly represented (aa, ii, uu, ee, oo)`;
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
  "readingsText": "Complete text with ${readingType} for ALL appropriate words - either the original if it was complete, or a new complete version if it wasn't",
  "translatedText": "${parsedContent.translatedText || ""}"
}`;

              // Start logging metrics for reading verification
              const readingVerificationMetrics: APIUsageMetrics = apiLogger.startAPICall('https://api.anthropic.com/v1/messages', {
                operation: 'reading_verification',
                textLength: text.length,
                readingType
              });

              // Make reading verification request
              const readingVerificationResponse = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                  model: "claude-haiku-4-5-20251001",
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
              
              // Extract token usage from reading verification response
              const readingVerificationUsage = readingVerificationResponse.data?.usage;
              const readingVerificationInputTokens = readingVerificationUsage?.input_tokens;
              const readingVerificationOutputTokens = readingVerificationUsage?.output_tokens;
              
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
                    logger.log("Reading verification raw response text length:", readingVerificationTextContent.text.length);
                    logger.log("Reading verification extracted JSON string length:", readingVerificationJsonString.length);
                    
                    const readingVerificationParsedContent = JSON.parse(readingVerificationJsonString);
                    const isReadingComplete = readingVerificationParsedContent.isComplete === true;
                    const readingAnalysis = readingVerificationParsedContent.analysis || "";
                    const verifiedFuriganaText = readingVerificationParsedContent.readingsText || "";
                    
                    // Log token usage for reading verification
                    await logClaudeAPI(readingVerificationMetrics, true, readingVerificationTextContent.text, undefined, {
                      model: 'claude-haiku-4-5-20251001',
                      operationType: 'reading_verification',
                      targetLanguage,
                      forcedLanguage,
                      textLength: text.length,
                      readingType
                    }, readingVerificationInputTokens, readingVerificationOutputTokens);
                    
                    if (!isReadingComplete && verifiedFuriganaText.length > furiganaText.length) {
                      logger.log(`${readingType} were incomplete. Analysis: ${readingAnalysis}`);
                      logger.log(`Using improved ${readingType} from verification`);
                      furiganaText = applyKoreanRomanizationGuards(verifiedFuriganaText, "reading-verification");
                    } else {
                      logger.log(`${readingType} verification result: ${isReadingComplete ? 'Complete' : 'Incomplete'}`);
                      if (!isReadingComplete) {
                        logger.log(`Analysis: ${readingAnalysis}`);
                        logger.log(`Verification did not provide better ${readingType} - using original`);
                      }
                    }
                  } catch (readingVerificationParseError) {
                    logger.error("Error parsing reading verification response:", readingVerificationParseError);
                    // Log error for reading verification
                    await logClaudeAPI(readingVerificationMetrics, false, undefined, readingVerificationParseError instanceof Error ? readingVerificationParseError : new Error(String(readingVerificationParseError)), {
                      model: 'claude-haiku-4-5-20251001',
                      operationType: 'reading_verification',
                      targetLanguage,
                      forcedLanguage,
                      readingType
                    }, readingVerificationInputTokens, readingVerificationOutputTokens);
                    // Continue with original result
                  }
                } else {
                  // Log error if no text content found
                  await logClaudeAPI(readingVerificationMetrics, false, undefined, new Error('No text content in reading verification response'), {
                    model: 'claude-haiku-4-5-20251001',
                    operationType: 'reading_verification',
                    targetLanguage,
                    forcedLanguage,
                    readingType
                  }, readingVerificationInputTokens, readingVerificationOutputTokens);
                }
              } else {
                // Log error if response structure is invalid
                await logClaudeAPI(readingVerificationMetrics, false, undefined, new Error('Invalid reading verification response structure'), {
                  model: 'claude-haiku-4-5-20251001',
                  operationType: 'reading_verification',
                  targetLanguage,
                  forcedLanguage,
                  readingType
                }, readingVerificationInputTokens, readingVerificationOutputTokens);
              }
            }
            
            // Checkpoint 4: Processing complete successfully, polishing complete
            logger.log('🎯 [Claude API] Checkpoint 4: Processing complete successfully, polishing complete');
            onProgress?.(4);
            
            const result = {
              readingsText: applyKoreanRomanizationGuards(furiganaText, "final-output"),
              translatedText: sanitizeTranslatedText(translatedText, targetLanguage),
              tokenUsage
            };

            // RETRY COUNTER LOGGING: Summary before returning
            if (internalApiCallCount > 1) {
              logger.warn(`⚠️ [API Retry Tracker] processWithClaude SUCCESS - Total internal API calls: ${internalApiCallCount}`);
              logger.warn(`⚠️ [API Retry Tracker] Internal retry reasons: ${internalRetryReasons.join(', ')}`);
            }

            // Log successful API call
            try {
              logger.log('[Claude API] About to log translate API call...');
              await logClaudeAPI(metrics, true, JSON.stringify(result), undefined, {
                model: 'claude-haiku-4-5-20251001',
                targetLanguage,
                forcedLanguage,
                textLength: text.length,
                hasJapanese: result.readingsText ? true : false,
                parseMethod: 'direct',
                operationType: 'translate',
                internalApiCallCount,
                internalRetryReasons: internalRetryReasons.join(', ')
              }, inputTokens, outputTokens);
              logger.log('[Claude API] Successfully logged translate API call');
            } catch (logError) {
              logger.error('[Claude API] Error logging translate API call:', logError);
            }

            return result;
          } catch (parseError) {
            logger.error("Error parsing JSON from Claude response:", parseError);
            logger.log("Raw content received:", textContent.text);
            
            // Try alternative JSON extraction methods
            try {
              logger.log("Attempting alternative JSON extraction methods...");
              
              // Method 1: Look for JSON blocks with ```json markers
              const jsonBlockMatch = textContent.text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
              if (jsonBlockMatch) {
                logger.log("Found JSON block with markers, trying to parse...");
                const blockJsonString = cleanJsonString(jsonBlockMatch[1]);
                const blockParsedContent = JSON.parse(blockJsonString);
                logger.log("Successfully parsed JSON from block markers");
                const result = {
                  readingsText: applyKoreanRomanizationGuards(blockParsedContent.readingsText || "", "fallback-block-parse"),
                  translatedText: sanitizeTranslatedText(blockParsedContent.translatedText || "", targetLanguage),
                  tokenUsage
                };

                // Log successful API call
                await logClaudeAPI(metrics, true, JSON.stringify(result), undefined, {
                  model: 'claude-haiku-4-5-20251001',
                  targetLanguage,
                  forcedLanguage,
                  textLength: text.length,
                  hasJapanese: result.readingsText ? true : false,
                  parseMethod: 'block',
                  operationType: 'translate'
                }, inputTokens, outputTokens);

                return result;
              }
              
              // Method 2: Try to extract JSON with more flexible regex
              const flexibleJsonMatch = textContent.text.match(/\{[^{}]*"readingsText"[^{}]*"translatedText"[^{}]*\}/);
              if (flexibleJsonMatch) {
                logger.log("Found JSON with flexible regex, trying to parse...");
                const flexibleJsonString = cleanJsonString(flexibleJsonMatch[0]);
                const flexibleParsedContent = JSON.parse(flexibleJsonString);
                logger.log("Successfully parsed JSON with flexible regex");
                const result = {
                  readingsText: applyKoreanRomanizationGuards(flexibleParsedContent.readingsText || "", "fallback-flex-parse"),
                  translatedText: sanitizeTranslatedText(flexibleParsedContent.translatedText || "", targetLanguage),
                  tokenUsage
                };

                // Log successful API call
                await logClaudeAPI(metrics, true, JSON.stringify(result), undefined, {
                  model: 'claude-haiku-4-5-20251001',
                  targetLanguage,
                  forcedLanguage,
                  textLength: text.length,
                  hasJapanese: result.readingsText ? true : false,
                  parseMethod: 'flexible',
                  operationType: 'translate'
                }, inputTokens, outputTokens);

                return result;
              }
              
              // Method 3: Try to extract values manually with regex
              const furiganaMatch = textContent.text.match(/"readingsText":\s*"([^"]*(?:\\.[^"]*)*)"/);
              const translatedMatch = textContent.text.match(/"translatedText":\s*"([^"]*(?:\\.[^"]*)*)"/);
              
              if (furiganaMatch && translatedMatch) {
                logger.log("Extracted values manually with regex");
                const result = {
                  readingsText: applyKoreanRomanizationGuards(
                    furiganaMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
                    "fallback-manual-parse"
                  ),
                  translatedText: sanitizeTranslatedText(
                    translatedMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
                    targetLanguage
                  ),
                  tokenUsage
                };

                // Log successful API call
                await logClaudeAPI(metrics, true, JSON.stringify(result), undefined, {
                  model: 'claude-haiku-4-5-20251001',
                  targetLanguage,
                  forcedLanguage,
                  textLength: text.length,
                  hasJapanese: result.readingsText ? true : false,
                  parseMethod: 'manual',
                  operationType: 'translate'
                }, inputTokens, outputTokens);

                return result;
              }
              
            } catch (alternativeError) {
              logger.error("Alternative JSON extraction also failed:", alternativeError);
            }
            
            throw new Error("Failed to parse Claude API response");
          }
        } else {
          logger.error("No text content found in response:", JSON.stringify(response.data));
          throw new Error("No text content in Claude API response");
        }
      } else {
        logger.error("Unexpected response structure:", JSON.stringify(response.data));
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
        
        logger.log(`Claude API overloaded. Retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        trackInternalApiCall(`API overload retry (529 error, attempt ${retryCount + 1})`);
        
        // Wait before retrying
        await sleep(backoffDelay);
        
        // Increment retry counter
        retryCount++;
      } else {
        // Max retries reached or non-retryable error, log and exit loop
        logger.error('Error processing text with Claude:', error);
        
        // Log more details about the error
        if (error instanceof AxiosError && error.response) {
          // The request was made and the server responded with a status code
          logger.error('Error data:', JSON.stringify(error.response.data));
          logger.error('Error status:', error.response.status);
          logger.error('Error headers:', JSON.stringify(error.response.headers));
        } else if (error instanceof AxiosError && error.request) {
          // The request was made but no response was received
          logger.error('No response received:', error.request);
        } else {
          // Something happened in setting up the request
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Error message:', errorMessage);
        }
        
        break;
      }
    }
  }
  
  // If we've exhausted all retries or encountered a non-retryable error
  if (retryCount >= MAX_RETRIES) {
    logger.error(`Claude API still unavailable after ${MAX_RETRIES} retry attempts`);
  }
  
  // RETRY COUNTER LOGGING: Final summary for processWithClaude
  if (internalApiCallCount > 1) {
    logger.warn(`⚠️ [API Retry Tracker] processWithClaude FINAL SUMMARY - Total internal API calls: ${internalApiCallCount}`);
    logger.warn(`⚠️ [API Retry Tracker] Internal retry reasons: ${internalRetryReasons.join(', ')}`);
    logger.warn(`⚠️ [API Retry Tracker] This translation consumed ${internalApiCallCount}x the base API usage!`);
  } else {
    logger.log(`✅ [API Retry Tracker] processWithClaude completed with 1 API call (no internal retries)`);
  }
  
  // Log failed API call
  const finalError = lastError instanceof Error ? lastError : new Error(String(lastError));
  await logClaudeAPI(metrics, false, undefined, finalError, {
    model: 'claude-haiku-4-5-20251001',
    targetLanguage,
    forcedLanguage,
    textLength: text.length,
    retryCount,
    maxRetries: MAX_RETRIES,
    operationType: 'translate',
    internalApiCallCount,
    internalRetryReasons: internalRetryReasons.join(', ')
  });
  
  return {
    readingsText: '',
    translatedText: 'Error processing text with Claude API. The service may be temporarily overloaded. Please try again later.'
  };
}

/**
 * Robust JSON parser for WordScope responses with nested structures
 * Uses industry-standard progressive parsing strategy
 */
function parseWordScopeResponse(rawResponse: string): {
  readingsText?: string;
  translatedText: string;
  scopeAnalysis: string | {
    word: string;
    reading: string;
    partOfSpeech: string;
    baseForm?: string;
    grammar?: {
      explanation?: string;
      particles?: Array<{ particle: string; use: string; example: string }>;
    };
    examples: Array<{ sentence: string; translation: string; note: string }>;
    commonMistake: {
      wrong: string;
      correct: string;
      reason: string;
    };
    commonContext?: string;
  };
} | null {
  const cleanedResponse = rawResponse.trim();
  
  // Strategy 1: Try direct JSON.parse (most common case)
  try {
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e: any) {
    logger.log(`[WordScope Parser] Strategy 1 (direct parse) failed: ${e.message}, trying next...`);
  }
  
  // Strategy 2: Try extracting from markdown code blocks
  try {
    const jsonBlockMatch = cleanedResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonBlockMatch) {
      return JSON.parse(jsonBlockMatch[1]);
    }
  } catch (e: any) {
    logger.log(`[WordScope Parser] Strategy 2 (markdown blocks) failed: ${e.message}, trying next...`);
  }
  
  // Strategy 3: Try with aggressive JSON extraction and cleaning
  try {
    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      let jsonString = cleanedResponse.substring(firstBrace, lastBrace + 1);
      
      // Fix common JSON issues
      // Remove trailing commas before closing braces/brackets
      jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
      
      // Fix unescaped quotes in string values (basic approach)
      // This is tricky for nested objects, so we'll try parsing first
      try {
        return JSON.parse(jsonString);
      } catch (e: any) {
        // If still failing, try more aggressive cleaning
        logger.log(`[WordScope Parser] Strategy 3a failed: ${e.message}, trying aggressive cleaning...`);
        
        // Strategy 3b: Try escaping smart quotes inside string values
        // Smart quotes ("" '') can cause parsing issues when not escaped
        // This regex finds content between JSON string delimiters and escapes smart quotes
        try {
          // First, let's try replacing smart quotes with escaped straight quotes
          let cleanedJsonString = jsonString
            // Convert smart double quotes inside strings to escaped regular quotes
            .replace(/[\u201C\u201D]/g, '\\"')
            // Convert smart single quotes to escaped apostrophes
            .replace(/[\u2018\u2019]/g, "\\'");
          
          return JSON.parse(cleanedJsonString);
        } catch (e2: any) {
          logger.log(`[WordScope Parser] Strategy 3b (smart quote escaping) failed: ${e2.message}`);
        }
        
        // Strategy 3c: More aggressive - try to fix double JSON objects
        // Sometimes Claude outputs two separate JSON objects instead of nested
        try {
          // Check if response contains two separate JSON objects
          const firstCloseBrace = jsonString.indexOf('}');
          const secondOpenBrace = jsonString.indexOf('{', firstCloseBrace);
          
          if (firstCloseBrace !== -1 && secondOpenBrace !== -1 && secondOpenBrace > firstCloseBrace) {
            // Detected two separate JSON objects - try to merge them
            const firstObject = jsonString.substring(0, firstCloseBrace + 1);
            const secondObject = jsonString.substring(secondOpenBrace);
            
            try {
              const parsed1 = JSON.parse(firstObject);
              const parsed2 = JSON.parse(secondObject);
              
              // Merge them - assume first is translation, second is scope
              if (parsed1.translatedText && !parsed1.scopeAnalysis && parsed2.word) {
                logger.log('[WordScope Parser] Strategy 3c (merge separate objects) succeeded');
                return {
                  readingsText: parsed1.readingsText || '',
                  translatedText: parsed1.translatedText,
                  scopeAnalysis: parsed2
                };
              }
            } catch (mergeError) {
              // Merging failed, continue to next strategy
            }
          }
        } catch (e3: any) {
          logger.log(`[WordScope Parser] Strategy 3c (merge objects) failed: ${e3.message}`);
        }
      }
    }
  } catch (e: any) {
    logger.log(`[WordScope Parser] Strategy 3 failed: ${e.message}, trying next...`);
  }
  
  // Strategy 4: Manual extraction for nested structures using balanced brace matching
  // This handles cases where JSON has unescaped quotes or other issues
  try {
    const extractFieldValue = (fieldName: string, jsonString: string, isObject: boolean = false): any | null => {
      const fieldPattern = new RegExp(`"${fieldName}"\\s*:`, 'g');
      const match = fieldPattern.exec(jsonString);
      if (!match) return null;
      
      const valueStart = match.index + match[0].length;
      let valueEnd = valueStart;
      
      // Skip whitespace
      while (valueEnd < jsonString.length && /\s/.test(jsonString[valueEnd])) {
        valueEnd++;
      }
      
      if (isObject) {
        // Extract object value by finding balanced braces
        if (jsonString[valueEnd] !== '{') return null;
        
        let depth = 0;
        let inString = false;
        let escapeNext = false;
        let i = valueEnd;
        
        while (i < jsonString.length) {
          const char = jsonString[i];
          
          if (escapeNext) {
            escapeNext = false;
            i++;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            i++;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
          } else if (!inString) {
            if (char === '{') depth++;
            if (char === '}') {
              depth--;
              if (depth === 0) {
                const objectString = jsonString.substring(valueEnd, i + 1);
                try {
                  return JSON.parse(objectString);
                } catch (e) {
                  // Try cleaning trailing commas
                  const cleaned = objectString.replace(/,(\s*[}\]])/g, '$1');
                  try {
                    return JSON.parse(cleaned);
                  } catch (e2) {
                    return null;
                  }
                }
              }
            }
          }
          i++;
        }
        return null;
      } else {
        // Extract string value
        if (jsonString[valueEnd] !== '"') return null;
        
        let i = valueEnd + 1;
        let inEscape = false;
        const valueChars: string[] = [];
        
        while (i < jsonString.length) {
          const char = jsonString[i];
          
          if (inEscape) {
            inEscape = false;
            valueChars.push(char);
            i++;
            continue;
          }
          
          if (char === '\\') {
            inEscape = true;
            valueChars.push(char);
            i++;
            continue;
          }
          
          if (char === '"') {
            // Check if this is the end of the value
            let nextNonWhitespace = i + 1;
            while (nextNonWhitespace < jsonString.length && /\s/.test(jsonString[nextNonWhitespace])) {
              nextNonWhitespace++;
            }
            const nextChar = jsonString[nextNonWhitespace];
            if (nextChar === ',' || nextChar === '}' || nextNonWhitespace >= jsonString.length) {
              // This is the end
              const rawValue = valueChars.join('');
              // Unescape
              return rawValue
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t');
            }
          }
          
          valueChars.push(char);
          i++;
        }
        return null;
      }
    };
    
    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      const jsonString = cleanedResponse.substring(firstBrace, lastBrace + 1);
      
      const furiganaText = extractFieldValue('readingsText', jsonString, false) ?? extractFieldValue('furiganaText', jsonString, false);
      const translatedText = extractFieldValue('translatedText', jsonString, false);
      const scopeAnalysis = extractFieldValue('scopeAnalysis', jsonString, true);
      
      if (translatedText && scopeAnalysis) {
        const result: any = {
          translatedText,
          scopeAnalysis
        };
        if (furiganaText) {
          result.readingsText = furiganaText;
        }
        logger.log('[WordScope Parser] Strategy 4 (manual extraction) succeeded');
        return result;
      }
    }
  } catch (e: any) {
    logger.log(`[WordScope Parser] Strategy 4 (manual extraction) failed: ${e.message}`);
  }
  
  // All strategies failed - log the problematic response for debugging
  logger.error('[WordScope Parser] All parsing strategies failed');
  logger.error(`[WordScope Parser] Response length: ${cleanedResponse.length} chars`);
  logger.error(`[WordScope Parser] First 500 chars: ${cleanedResponse.substring(0, 500)}`);
  logger.error(`[WordScope Parser] Last 500 chars: ${cleanedResponse.substring(Math.max(0, cleanedResponse.length - 500))}`);
  return null;
}

/**
 * Ensures a sentence ends with a period, question mark, or exclamation point
 * Adds a period if the text doesn't end with sentence-ending punctuation
 */
function ensureSentenceEnding(text: string | undefined): string {
  if (text == null || String(text).trim().length === 0) {
    return '';
  }
  
  const trimmed = text.trim();
  const lastChar = trimmed[trimmed.length - 1];
  
  // If it already ends with sentence-ending punctuation, return as is
  if (lastChar === '.' || lastChar === '!' || lastChar === '?' || lastChar === '。' || lastChar === '！' || lastChar === '？') {
    return text;
  }
  
  // Add a period at the end
  return text.trim() + '.';
}

/**
 * Formats the JSON scope analysis response into plain text format
 */
function formatScopeAnalysis(analysisJson: {
  word?: string;
  reading?: string;
  partOfSpeech?: string;
  baseForm?: string;
  grammar?: {
    explanation?: string;
    particles?: Array<{ particle: string; use: string; example: string }>;
  };
  examples?: Array<{ sentence: string; translation: string; note: string }>;
  commonMistake?: {
    wrong: string;
    correct: string;
    reason: string;
  };
  commonContext?: string;
  synonyms?: Array<{ phrase: string; translation: string; nuance: string }>;
}): string {
  const a = analysisJson as Record<string, unknown>;
  const partOfSpeech = (a.partOfSpeech ?? a.part_of_speech ?? a.pos ?? '') as string;
  const baseForm = (a.baseForm ?? a.base_form ?? '') as string;
  const word = (a.word ?? a.key ?? a.phrase ?? '') as string;

  let formatted = '';
  if (word) {
    formatted += `${word}\n`;
  }
  if (partOfSpeech) {
    if (baseForm) {
      formatted += `${partOfSpeech}\n→ Base: ${baseForm}\n`;
    } else {
      formatted += `${partOfSpeech}\n`;
    }
  }
  if (!partOfSpeech && !word) {
    formatted += '(No word or part-of-speech breakdown)\n';
  }

  formatted += '\nGrammar\n';
  if (analysisJson.grammar?.explanation) {
    formatted += `${ensureSentenceEnding(analysisJson.grammar.explanation)}\n`;
  } else {
    formatted += 'Grammar information unavailable.\n';
  }

  // Particles section (if applicable) — guard: API may return non-array (e.g. string/object)
  const particlesList = Array.isArray(analysisJson.grammar?.particles)
    ? analysisJson.grammar.particles
    : [];
  if (particlesList.length > 0) {
    formatted += '\nCommon particles:\n';
    particlesList.forEach((p: { particle?: string; use?: string; example?: string }) => {
      const particle = p.particle ?? '';
      const use = ensureSentenceEnding(p.use ?? '');
      const example = ensureSentenceEnding(p.example ?? '');
      if (particle || use || example) {
        formatted += `- ${particle} (${use}): ${example}\n`;
      }
    });
  }
  
  // Examples section (support alternate keys from API: sentence/translation/note or text/meaning/definition)
  formatted += '\nExamples\n';
  const examples = Array.isArray(analysisJson.examples) ? analysisJson.examples : [];
  examples.forEach((ex: { sentence?: string; translation?: string; note?: string; text?: string; meaning?: string; definition?: string }, index: number) => {
    const sentence = ensureSentenceEnding(ex.sentence ?? ex.text ?? '');
    const translation = ensureSentenceEnding(ex.translation ?? ex.meaning ?? '');
    const note = ensureSentenceEnding(ex.note ?? ex.definition ?? '');
    if (sentence || translation || note) {
      formatted += `${index + 1}. ${sentence}\n`;
      formatted += `   ${translation}\n`;
      formatted += `   → ${note}\n`;
      if (index < examples.length - 1) {
        formatted += '\n';
      }
    }
  });
  
  // Common mistake or nuance section
  const cm = analysisJson.commonMistake;
  formatted += '\n⚠️ Common Mistake or Nuance\n';
  if (cm) {
    formatted += `✗ ${ensureSentenceEnding(cm.wrong)}\n`;
    formatted += `✓ ${ensureSentenceEnding(cm.correct)}\n`;
    formatted += `${ensureSentenceEnding(cm.reason)}`;
  } else {
    formatted += 'Common mistake information unavailable.\n';
  }
  
  // Common context section (if provided)
  if (analysisJson.commonContext) {
    formatted += '\n\n📍 Common Context\n';
    formatted += `${ensureSentenceEnding(analysisJson.commonContext)}`;
  }
  
  // Synonyms/Alternative expressions section (support phrase/translation/nuance or expression/meaning/note)
  const synonyms = Array.isArray(analysisJson.synonyms) ? analysisJson.synonyms : [];
  if (synonyms.length > 0) {
    formatted += '\n\n🔄 Alternative Expressions\n';
    synonyms.forEach((syn: { phrase?: string; translation?: string; nuance?: string; expression?: string; meaning?: string; note?: string }, index: number) => {
      const phrase = syn.phrase ?? syn.expression ?? '';
      const translation = ensureSentenceEnding(syn.translation ?? syn.meaning ?? '');
      const nuance = ensureSentenceEnding(syn.nuance ?? syn.note ?? '');
      if (phrase || translation || nuance) {
        formatted += `${index + 1}. ${phrase}\n`;
        formatted += `   ${translation}\n`;
        formatted += `   → ${nuance}\n`;
        if (index < synonyms.length - 1) {
          formatted += '\n';
        }
      }
    });
  }
  
  return formatted;
}

/**
 * Process text with Claude API and generate scope analysis (etymology/grammar)
 * This is a simple wrapper that first gets translation, then adds scope analysis
 * 
 * @param text The text to process
 * @param targetLanguage Target language code (e.g., 'en', 'ja', 'fr')
 * @param forcedLanguage Forced source language detection code
 * @param onProgress Optional callback for progress updates
 * @param subscriptionPlan Optional subscription plan to use for rate limiting (avoids re-fetching)
 * @returns Promise with furiganaText, translatedText, and scopeAnalysis
 */
export async function processWithClaudeAndScope(
  text: string,
  targetLanguage: string = 'en',
  forcedLanguage: string = 'ja',
  onProgress?: (checkpoint: number) => void,
  subscriptionPlan?: 'PREMIUM' | 'FREE'
): Promise<ClaudeResponse> {
  // OPTIMIZED: Combined single API call for translation + scope analysis
  // This saves ~40-50% of API costs compared to making two separate calls
  logger.log('[WordScope Combined] Starting combined translation + scope analysis...');
  
  // Normalize text for safe JSON processing
  const normalizedText = normalizeQuotationMarks(text);
  
  // Start metrics for combined call
  const metrics = apiLogger.startAPICall('https://api.anthropic.com/v1/messages', {
    text: normalizedText.substring(0, 100),
    targetLanguage,
    forcedLanguage,
    operationType: 'wordscope_combined'
  });

  // Check unified rate limits for all API calls
  try {
    // Use passed subscription plan if provided, otherwise fetch from database
    let effectiveSubscriptionPlan = subscriptionPlan;
    if (!effectiveSubscriptionPlan) {
      const subscription = await fetchSubscriptionStatus();
      effectiveSubscriptionPlan = getSubscriptionPlan(subscription);
    }
    logger.log(`[WordScope Combined] Using subscription plan for rate limit: ${effectiveSubscriptionPlan}`);
    const rateLimitStatus = await apiLogger.checkRateLimitStatus(effectiveSubscriptionPlan);
    
    if (rateLimitStatus.apiCallsRemaining <= 0) {
      const isPremium = effectiveSubscriptionPlan === 'PREMIUM';
      const errorMessage = isPremium 
        ? 'API limit reached. You have used all your API calls for this period.'
        : 'Daily API limit reached. Upgrade to Premium for more API calls.';
      logger.warn(`[WordScope Combined] Rate limit exceeded - daily: ${rateLimitStatus.apiCallsUsedToday}/${rateLimitStatus.dailyLimit}, monthly: ${rateLimitStatus.apiCallsUsedThisMonth}/${rateLimitStatus.monthlyLimit || 'N/A'}`);
      throw new Error(errorMessage);
    }
  } catch (error) {
    // If rate limit check fails, log but don't block (fail open for better UX)
    if (error instanceof Error && (error.message.includes('API limit reached') || error.message.includes('Daily API limit'))) {
      throw error; // Re-throw rate limit errors
    }
    logger.warn('[WordScope Combined] Rate limit check failed, proceeding:', error);
  }

  try {
    const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }
    
    // Haiku 4.5 for all languages (WordScope combined translation + grammar)
    const wordScopeModel = 'claude-haiku-4-5-20251001';
    
    // LANGUAGE VALIDATION (same logic as processWithClaude)
    // This ensures Latin-to-Latin language mismatches are caught before processing
    const latinLanguages = ['en', 'fr', 'es', 'it', 'pt', 'de', 'tl', 'eo'];
    const nonLatinLanguages = ['ja', 'zh', 'ko', 'ru', 'ar', 'hi', 'th'];
    
    if (forcedLanguage) {
      const usePatternValidation = nonLatinLanguages.includes(forcedLanguage);
      
      if (usePatternValidation) {
        // Pattern-based validation for non-Latin languages
        const validationResult = validateTextMatchesLanguage(text, forcedLanguage);
        if (!validationResult.isValid) {
          const mismatchInfo = buildLanguageMismatchInfo(
            forcedLanguage,
            validationResult.detectedLanguage
          );
          logger.log(`[WordScope Combined] Language mismatch: expected ${forcedLanguage}, detected ${validationResult.detectedLanguage}`);
          return {
            readingsText: '',
            translatedText: '',
            languageMismatch: mismatchInfo
          };
        }
      } else {
        // Latin languages: Check for non-Latin characters first
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
        const hasChinese = /[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text);
        const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF]/.test(text);
        const hasRussian = /[\u0400-\u04FF]/.test(text);
        const hasArabic = /[\u0600-\u06FF]/.test(text);
        const hasHindi = /[\u0900-\u097F]/.test(text);
        const hasThai = /[\u0E00-\u0E7F]/.test(text);
        
        let detectedNonLatinLanguage: string | null = null;
        if (hasJapanese) detectedNonLatinLanguage = 'Japanese';
        else if (hasChinese) detectedNonLatinLanguage = 'Chinese';
        else if (hasKorean) detectedNonLatinLanguage = 'Korean';
        else if (hasRussian) detectedNonLatinLanguage = 'Russian';
        else if (hasArabic) detectedNonLatinLanguage = 'Arabic';
        else if (hasHindi) detectedNonLatinLanguage = 'Hindi';
        else if (hasThai) detectedNonLatinLanguage = 'Thai';
        
        if (detectedNonLatinLanguage) {
          const mismatchInfo = buildLanguageMismatchInfo(forcedLanguage, detectedNonLatinLanguage);
          logger.log(`[WordScope Combined] Non-Latin text detected: ${detectedNonLatinLanguage} (expected ${forcedLanguage})`);
          return {
            readingsText: '',
            translatedText: '',
            languageMismatch: mismatchInfo
          };
        }
        
        // Latin-to-Latin validation using AI
        const isLatinToLatinScenario = latinLanguages.includes(forcedLanguage) && latinLanguages.includes(targetLanguage);
        
        if (isLatinToLatinScenario && text.trim().length >= 10) {
          logger.log(`[WordScope Combined] Latin-to-Latin scenario (${forcedLanguage}→${targetLanguage}), using AI validation`);
          
          try {
            const aiValidation = await validateLanguageWithClaude(text, forcedLanguage, apiKey);
            
            if (!aiValidation.isValid && aiValidation.detectedLanguage) {
              logger.log(`[WordScope Combined] AI detected language mismatch: expected ${forcedLanguage}, got ${aiValidation.detectedLanguage}`);
              const mismatchInfo = buildLanguageMismatchInfo(forcedLanguage, aiValidation.detectedLanguage);
              return {
                readingsText: '',
                translatedText: '',
                languageMismatch: mismatchInfo
              };
            }
            logger.log(`[WordScope Combined] AI validation passed: text is ${aiValidation.detectedLanguage}`);
            // Add a small delay after validation to space out API calls and reduce 529 overload errors
            await sleep(200); // 200ms delay to space out requests
          } catch (validationError) {
            logger.warn(`[WordScope Combined] AI validation failed, proceeding:`, validationError);
          }
        }
      }
    }
    
    const targetLangName = LANGUAGE_NAMES_MAP[targetLanguage as keyof typeof LANGUAGE_NAMES_MAP] || 'English';
    const sourceLangName = LANGUAGE_NAMES_MAP[forcedLanguage as keyof typeof LANGUAGE_NAMES_MAP] || 'the source language';
    
    // Check if source language needs readings (furigana/pinyin/romanization)
    const readingLanguages: { [key: string]: { name: string; readingType: string; format: string } } = {
      'ja': { name: 'Japanese', readingType: 'furigana', format: 'kanji(hiragana) e.g. 漢字(かんじ)' },
      'zh': { name: 'Chinese', readingType: 'pinyin', format: 'hanzi(pinyin) e.g. 中国(zhōngguó)' },
      'ko': { name: 'Korean', readingType: 'romanization', format: 'hangul(romanization) e.g. 한국어(han-gug-eo)' },
      'ru': { name: 'Russian', readingType: 'romanization', format: 'cyrillic(romanization) e.g. Русский(russkiy)' },
      'ar': { name: 'Arabic', readingType: 'transliteration', format: 'arabic(transliteration) e.g. العربية(al-arabiya)' },
      'hi': { name: 'Hindi', readingType: 'romanization', format: 'devanagari(IAST) e.g. हिन्दी(hindī)' },
      'th': { name: 'Thai', readingType: 'RTGS romanization', format: 'thai(rtgs) e.g. ภาษา(phaasaa)' }
    };
    
    const needsReadings = forcedLanguage in readingLanguages;
    const readingInfo = needsReadings ? readingLanguages[forcedLanguage] : null;
    
    logger.log(`[WordScope Combined] Grammar analysis, needsReadings: ${needsReadings}`);
    
    // Build scope instructions (lite - Haiku 4.5 optimized)
    const scopeInstructions = buildScopeInstructionsLite(normalizedText, sourceLangName, targetLangName);

    // Build reading instructions. System prompt has full rules - use short reminder only.
    let readingTask = '';
    if (needsReadings && readingInfo) {
      if (USE_LITE_PROMPTS) {
        readingTask = `
=== TASK 3: READINGS ===
Add readings to the original ${sourceLangName} text per system instructions (furigana/pinyin/romanization in parentheses).`;
      } else if (forcedLanguage === 'ja') {
        // Japanese - detailed furigana instructions (same as Translate button)
        readingTask = `
=== TASK 3: FURIGANA ===
Add furigana to ALL words containing kanji in the ORIGINAL Japanese text.

CRITICAL REQUIREMENTS:
1. Keep all original text exactly as is (including any English words, numbers, or punctuation)
2. For EVERY word containing kanji, add the complete hiragana reading in parentheses immediately after the word
3. The reading should cover the entire word (including any hiragana/katakana parts attached to the kanji)
4. USE STANDARD DICTIONARY READINGS for all compound words - do NOT create readings by combining individual kanji sounds phonetically
5. You MUST NOT skip any kanji - every single kanji character must have furigana
6. CRITICAL: Non-kanji words (pure hiragana/katakana), English words, and numbers should remain COMPLETELY UNCHANGED - NEVER add furigana to words with NO kanji
   - WRONG: うそ(うそ), それは(それは), ない(ない) ❌
   - CORRECT: うそ, それは, ない ✓ (no furigana needed - already in hiragana)
7. NEVER CONVERT HIRAGANA TO KANJI: If the user wrote a word in hiragana, keep it in hiragana. Do NOT "correct" or convert it to kanji.
   - Input: こくのある甘み → Output: こくのある甘(あま)み ✓ (keep こく as hiragana)
   - WRONG: こく → 国(くに) ❌ (do NOT convert hiragana to kanji)
8. Double check that your output meets all requirements.


WORD-LEVEL READING PRIORITY:
- FIRST analyze the text for compound words, counter words, and context-dependent readings
- Compound words MUST use their STANDARD DICTIONARY READING
- DO NOT phonetically combine individual kanji readings - compound words have fixed, standard readings
- Counter words undergo sound changes (rendaku) and must be read as complete units

Examples of correct formatting:
- "東京" → "東京(とうきょう)" [compound place name]
- "日本語" → "日本語(にほんご)" [compound word]
- "一匹" → "一匹(いっぴき)" [counter word with rendaku]
- "今日" → "今日(きょう)" [special compound reading]
- "食べ物" → "食(た)べ物(もの)" [individual readings when needed]
- "新しい本を読みました" → "新(あたら)しい本(ほん)を読(よ)みました"

SPECIAL ATTENTION TO COUNTERS:
- 一匹 = いっぴき, 三匹 = さんびき, 六匹 = ろっぴき
- 一人 = ひとり, 二人 = ふたり
- 一つ = ひとつ, 二つ = ふたつ

NO spaces between kanji and the opening parenthesis.
`;
      } else if (forcedLanguage === 'zh') {
        // Chinese - detailed pinyin instructions
        readingTask = `
=== TASK 3: PINYIN ===
Add pinyin to the ORIGINAL Chinese text.

CRITICAL REQUIREMENTS:
1. KEEP ALL ORIGINAL CHINESE CHARACTERS exactly as they appear
2. For EACH Chinese word/phrase, add pinyin in parentheses IMMEDIATELY AFTER the Chinese characters
3. Format: 中文(zhōngwén) - Chinese characters followed by pinyin in parentheses
4. Include tone marks in pinyin (ā, á, ǎ, à, etc.)
5. Group characters into meaningful words - don't add pinyin to each character separately unless it's a single-character word
6. Double check that your output meets all requirements.

Examples:
- "中国" → "中国(zhōngguó)"
- "你好" → "你好(nǐhǎo)"
- "学习中文" → "学习(xuéxí)中文(zhōngwén)"

NO spaces between characters and the opening parenthesis.
`;
      } else if (forcedLanguage === 'ko') {
        // Korean - Revised Romanization
        readingTask = `
=== TASK 3: ROMANIZATION ===
Add Revised Romanization to the ORIGINAL Korean text.

CRITICAL REQUIREMENTS:
1. Keep all original Hangul text exactly as it appears
2. Add romanization in parentheses IMMEDIATELY AFTER each Korean word
3. Use standard Revised Romanization of Korean
4. Format: 한글(hangeul) - Hangul followed by romanization
5. Double check that your output meets all requirements.

Examples:
- "한국어" → "한국어(han-gug-eo)"
- "안녕하세요" → "안녕하세요(annyeonghaseyo)"
- "감사합니다" → "감사합니다(gamsahamnida)"

NO spaces between Hangul and the opening parenthesis.
`;
      } else if (forcedLanguage === 'ru') {
        // Russian - Latin romanization
        readingTask = `
=== TASK 3: ROMANIZATION ===
Add Latin romanization to the ORIGINAL Russian text.

CRITICAL REQUIREMENTS:
1. Keep all original Cyrillic text exactly as it appears
2. Add romanization in parentheses IMMEDIATELY AFTER each Russian word
3. Use standard Latin transliteration
4. Format: Русский(russkiy) - Cyrillic followed by romanization
5. Double check that your output meets all requirements.

Examples:
- "Россия" → "Россия(rossiya)"
- "Привет" → "Привет(privet)"
- "Спасибо" → "Спасибо(spasibo)"

NO spaces between Cyrillic and the opening parenthesis.
`;
      } else if (forcedLanguage === 'ar') {
        // Arabic - transliteration
        readingTask = `
=== TASK 3: TRANSLITERATION ===
Add transliteration to the ORIGINAL Arabic text.

CRITICAL REQUIREMENTS:
1. Keep all original Arabic script exactly as it appears
2. Add transliteration in parentheses IMMEDIATELY AFTER each Arabic word
3. Use Arabic Chat Alphabet or standard transliteration
4. Format: العربية(al-arabiya) - Arabic followed by transliteration
5. Double check that your output meets all requirements.

Examples:
- "مرحبا" → "مرحبا(marhaba)"
- "شكرا" → "شكرا(shukran)"

NO spaces between Arabic and the opening parenthesis.
`;
      } else if (forcedLanguage === 'hi') {
        // Hindi - IAST romanization
        readingTask = `
=== TASK 3: ROMANIZATION ===
Add IAST romanization to the ORIGINAL Hindi text.

CRITICAL REQUIREMENTS:
1. Keep all original Devanagari script exactly as it appears
2. Add IAST romanization in parentheses IMMEDIATELY AFTER each Hindi word
3. Include diacritical marks (ā, ī, ū, etc.)
4. Format: हिन्दी(hindī) - Devanagari followed by romanization
5. Double check that your output meets all requirements.

Examples:
- "नमस्ते" → "नमस्ते(namaste)"
- "धन्यवाद" → "धन्यवाद(dhanyavād)"

NO spaces between Devanagari and the opening parenthesis.
`;
      } else if (forcedLanguage === 'th') {
        // Thai - RTGS romanization
        readingTask = `
=== TASK 3: RTGS ROMANIZATION ===
Add Royal Thai General System (RTGS) romanization to the ORIGINAL Thai text.

CRITICAL REQUIREMENTS:
1. Keep all original Thai script exactly as it appears
2. Add RTGS romanization in parentheses IMMEDIATELY AFTER each Thai word
3. Use standard RTGS transliteration (may include periods for abbreviations)
4. Format: ภาษา(phaasaa) - Thai followed by romanization
5. Double check that your output meets all requirements.

Examples:
- "สวัสดี" → "สวัสดี(sawatdi)"
- "ขอบคุณ" → "ขอบคุณ(khop khun)"
- "ประเทศไทย" → "ประเทศไทย(prathet thai)"

NO spaces between Thai script and the opening parenthesis.
`;
      }
    }

    // Build the readingsText field instruction based on language
    let furiganaFieldInstruction = `"readingsText": "",`;
    if (needsReadings && readingInfo) {
      if (forcedLanguage === 'ja') {
        furiganaFieldInstruction = `"readingsText": "Original Japanese text with furigana after EVERY kanji word - THIS IS MANDATORY",`;
      } else if (forcedLanguage === 'zh') {
        furiganaFieldInstruction = `"readingsText": "Original Chinese text with pinyin (including tone marks) after each word",`;
      } else {
        furiganaFieldInstruction = `"readingsText": "Original ${sourceLangName} text with ${readingInfo.readingType} in parentheses",`;
      }
    }

    // Combined prompt for translation + scope analysis (+ readings if needed)
    const combinedPrompt = `You are a ${needsReadings ? `${sourceLangName} language expert` : 'language expert'}. I need you to ${needsReadings ? 'translate, analyze, AND add readings to' : 'BOTH translate AND analyze'} the following ${sourceLangName} text.

TEXT TO PROCESS: "${normalizedText}"

=== TASK 1: TRANSLATION ===
- Translate the text into natural, fluent ${targetLangName}.
- Preserve the original meaning and tone
- Use natural expressions in ${targetLangName}
- Do NOT add any readings, romanization, or furigana to the TRANSLATION
- Handle idioms appropriately - translate meaning, not word-for-word
-Consider vulgarity level and match the emotional intensity of the original text.
- Double check that your output is a natural translation of the input text that matches its emotional intensity and context

=== TASK 2: GRAMMAR ANALYSIS ===
${scopeInstructions}
${readingTask}
=== RESPONSE FORMAT ===
You MUST respond with valid JSON in this exact format:
{
  ${furiganaFieldInstruction}
  "translatedText": "Your ${targetLangName} translation here",
  "scopeAnalysis": {
    "word": "main word or key phrase from the source sentence",
    "reading": "pronunciation guide",
    "partOfSpeech": "FULL sentence breakdown: word1 [label] + word2 [label] + word3 [label] + ... - analyze ALL words from '${normalizedText}'",
    "baseForm": "dictionary form if different, otherwise omit this field",
    "grammar": {
      "explanation": "one clear sentence explaining the grammar pattern",
      "particles": [
        {"particle": "particle", "use": "what it marks", "example": "short example"}
      ]
    },
    "examples": [
      {
        "sentence": "simple example sentence that uses the EXACT same words/phrase from '${normalizedText}' in a different context",
        "translation": "translation",
        "note": "brief grammar point (under 10 words)"
      },
      {
        "sentence": "intermediate example sentence that uses the EXACT same words/phrase from '${normalizedText}' in a more complex context",
        "translation": "translation",
        "note": "different usage point"
      },
      {
        "sentence": "intermediate example sentence that uses the EXACT same words/phrase from '${normalizedText}' in another context",
        "translation": "translation",
        "note": "additional usage point"
      }
    ],
    "commonMistake": {
      "wrong": "incorrect usage",
      "correct": "correct usage",
      "reason": "brief explanation (under 15 words)"
    },
    "commonContext": "brief note about when/where this phrase is commonly used (e.g., 'customer-to-patron contexts', 'formal business settings', 'casual conversations'). Omit if not applicable.",
    "synonyms": [
      {
        "phrase": "alternative way to express the same meaning",
        "translation": "translation",
        "nuance": "brief note on when to use this vs the original (under 15 words)"
      },
      {
        "phrase": "second alternative expression",
        "translation": "translation",
        "nuance": "nuance difference"
      },
      {
        "phrase": "third alternative expression",
        "translation": "translation",
        "nuance": "nuance difference"
      }
    ]
  }
}

CRITICAL REQUIREMENTS:
- ALL sentence fields MUST end with a period (.) unless they end with ! or ?:
  * "explanation" must end with a period
  * "translation" fields must end with periods for complete sentences
  * "note" fields must end with periods
  * "wrong" and "correct" must end with periods (unless questions/exclamations)
  * "reason" must end with a period
  * "use" in particles array must end with a period
  * "example" in particles array must end with a period
  * "commonContext" must end with a period if it's a complete sentence
  * "nuance" in synonyms array must end with a period
- CRITICAL: The "examples" section MUST use the EXACT same words/phrase from "${normalizedText}" - create new sentences that contain the same phrase/words in different contexts, NOT synonyms or alternatives
- The examples are to show how "${normalizedText}" works in different contexts, but must include the actual words/phrase from the scanned text
- The "synonyms" section provides 3 alternative expressions for advanced learners - these MUST be DIFFERENT from what's used in examples
- ALL fields are required and must be complete${needsReadings ? `
- readingsText MUST contain the COMPLETE original text WITH ${readingInfo?.readingType} for EVERY applicable character/word
- Do NOT skip any readings - every ${forcedLanguage === 'ja' ? 'kanji' : 'word'} must have its reading` : ''}
- Write translation and analysis in ${targetLangName}
- Do not include any text outside the JSON object
- Ensure proper JSON escaping: use \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes
- Do NOT truncate or abbreviate any field
- commonContext should briefly mention typical situations, relationships, or settings where the phrase appears
- partOfSpeech MUST be a COMPLETE breakdown of ALL words in "${normalizedText}" - format: "word1 [label] + word2 [label] + word3 [label] + ..." with ALL words from the source sentence`;

    // Progress callback
    onProgress?.(1);
    
    // ALL LANGUAGES NOW USE CACHING - Select appropriate system prompt based on language
    const isChineseWithCaching = forcedLanguage === 'zh';
    const isJapaneseWithCaching = forcedLanguage === 'ja';
    const isKoreanWithCaching = forcedLanguage === 'ko';
    const isCJKLanguage = isChineseWithCaching || isJapaneseWithCaching || isKoreanWithCaching;
    
    // Reading languages that are not CJK: Arabic, Hindi, Thai (have dedicated prompts with transliteration/romanization rules)
    const isArabicWithReadings = forcedLanguage === 'ar';
    const isHindiWithReadings = forcedLanguage === 'hi';
    const isThaiWithReadings = forcedLanguage === 'th';
    const isRussianWithReadings = forcedLanguage === 'ru';
    const isOtherReadingLanguage = isArabicWithReadings || isHindiWithReadings || isThaiWithReadings || isRussianWithReadings;
    
    // Select the appropriate system prompt - CJK and other reading languages get specialized prompts
    const systemPrompt = isChineseWithCaching ? chineseWordScopeSystemPromptLite :
                         isJapaneseWithCaching ? japaneseWordScopeSystemPromptLite :
                         isKoreanWithCaching ? koreanWordScopeSystemPromptLite :
                         isArabicWithReadings ? arabicWordScopeSystemPromptLite :
                         isHindiWithReadings ? hindiWordScopeSystemPromptLite :
                         isThaiWithReadings ? thaiWordScopeSystemPromptLite :
                         isRussianWithReadings ? russianWordScopeSystemPromptLite :
                         buildGeneralLanguageSystemPromptLite(forcedLanguage);
    
    // Determine language name for logging
    const languageDisplayNames: Record<string, string> = {
      'zh': 'Chinese', 'ja': 'Japanese', 'ko': 'Korean',
      'fr': 'French', 'es': 'Spanish', 'it': 'Italian', 'pt': 'Portuguese', 'de': 'German',
      'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi', 'th': 'Thai', 'vi': 'Vietnamese',
      'tl': 'Tagalog', 'eo': 'Esperanto', 'en': 'English'
    };
    const languageDisplayName = languageDisplayNames[forcedLanguage] || forcedLanguage.toUpperCase();
    
    let response;
    let dynamicUserMessage: string;
    
    if (isCJKLanguage) {
      // CJK languages need special handling for readings (furigana/pinyin/romanization)
      const readingType = isChineseWithCaching ? 'pinyin' : 
                         isJapaneseWithCaching ? 'furigana' : 
                         'romanization';
      const wordType = isJapaneseWithCaching ? 'kanji' : 'word';
      
      if (USE_LITE_PROMPTS) {
        // Lite CJK user message: bare minimum; exact keys required for formatScopeAnalysis (camelCase: word, partOfSpeech).
        const jaFuriganaReminder = isJapaneseWithCaching ? '\nFurigana: Be extra careful with compound words; double-check against standard dictionary readings.\n' : '';
        dynamicUserMessage = `TARGET LANGUAGE: ${targetLangName}. You MUST translate the text INTO ${targetLangName}. The translatedText must be in ${targetLangName} only (e.g. Korean if target is Korean, not English).

TEXT: "${normalizedText}"${jaFuriganaReminder}

GRAMMAR: ${scopeInstructions}

JSON (camelCase keys): readingsText, translatedText, scopeAnalysis: { word (main phrase), reading, partOfSpeech (word1 [label]+...), baseForm?, grammar: { explanation, particles? }, examples: [ { sentence, translation, note } ] x3, commonMistake: { wrong, correct, reason }, commonContext?, synonyms: [ { phrase, translation, nuance } ] x3 }. Period-end sentence fields. Labels and translatedText in ${targetLangName}. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes.`;
      } else {
        dynamicUserMessage = `TEXT TO PROCESS: "${normalizedText}"

=== TASK 2: GRAMMAR ANALYSIS ===
${scopeInstructions}

=== RESPONSE FORMAT ===
You MUST respond with valid JSON in this exact format:
{
  ${furiganaFieldInstruction}
  "translatedText": "Your ${targetLangName} translation here",
  "scopeAnalysis": {
    "word": "main word or key phrase from the source sentence",
    "reading": "pronunciation guide",
    "partOfSpeech": "SEE MANDATORY FORMAT BELOW",
    "baseForm": "dictionary form if different, otherwise omit this field",
    "grammar": {
      "explanation": "one clear sentence explaining the grammar pattern in ${targetLangName}",
      "particles": [
        {"particle": "particle", "use": "what it marks", "example": "short example"}
      ]
    },
    "examples": [
      {
        "sentence": "simple example sentence that uses the EXACT same words/phrase from '${normalizedText}' in a different context",
        "translation": "translation",
        "note": "brief grammar point (under 10 words)"
      },
      {
        "sentence": "intermediate example sentence that uses the EXACT same words/phrase from '${normalizedText}' in a more complex context",
        "translation": "translation",
        "note": "different usage point"
      },
      {
        "sentence": "intermediate example sentence that uses the EXACT same words/phrase from '${normalizedText}' in another context",
        "translation": "translation",
        "note": "additional usage point"
      }
    ],
    "commonMistake": {
      "wrong": "incorrect usage",
      "correct": "correct usage",
      "reason": "brief explanation (under 15 words)"
    },
    "commonContext": "brief note about when/where this phrase is commonly used. Omit if not applicable."
  }
}

=== MANDATORY partOfSpeech FORMAT ===
The partOfSpeech field MUST use ${targetLangName} grammar labels:
- Format: [source word] [${targetLangName} label] + [source word] [${targetLangName} label] + ...
- Words from "${normalizedText}", labels in ${targetLangName}

ALLOWED ${targetLangName} LABELS ONLY (use these in ${targetLangName}):
${getGrammarLabels(targetLanguage)}

EXAMPLE (${sourceLangName} to ${targetLangName}):
✗ WRONG: Using labels in ${sourceLangName} like [${forcedLanguage === 'ja' ? '代名詞' : forcedLanguage === 'zh' ? '代词' : 'grammar term'}]
✓ CORRECT: Using labels in ${targetLangName} like [${targetLanguage === 'ja' ? '代名詞' : targetLanguage === 'en' ? 'pronoun' : 'grammar term'}]

CRITICAL REQUIREMENTS:
- ALL fields are required and must be complete
- readingsText MUST contain the COMPLETE original text WITH ${readingType} for EVERY applicable ${wordType}
- Do NOT skip any readings - every ${isJapaneseWithCaching ? 'kanji' : isChineseWithCaching ? 'Chinese word' : 'Korean word'} must have its ${readingType} reading
- Write translation and analysis in ${targetLangName}
- Do not include any text outside the JSON object
- Ensure proper JSON escaping: use \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes
- Do NOT truncate or abbreviate any field
- commonContext should briefly mention typical situations, relationships, or settings where the phrase appears`;
      }

      logger.log(`🔄 [WordScope Prompt Caching] Sending ${languageDisplayName} request with caching enabled - system prompt: ${systemPrompt.length} chars, user message: ${dynamicUserMessage.length} chars`);
      
      response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: wordScopeModel,  // Haiku 4.5 for all languages
          max_tokens: 4000, // Increased to handle full scope analysis with examples
          temperature: 0.3,
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" }  // ENABLES PROMPT CACHING
            }
          ],
          messages: [
            {
              role: "user",
              content: dynamicUserMessage  // Only dynamic content here
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31'  // REQUIRED FOR CACHING
          },
          timeout: 30000
        }
      );
      
      // Extract cache metrics for WordScope
      const usage = response.data?.usage;
      const cacheCreationTokens = usage?.cache_creation_input_tokens || 0;
      const cacheReadTokens = usage?.cache_read_input_tokens || 0;
      
      // Debug: Log full usage object to diagnose caching
      logger.log(`🔍 [WordScope Cache Debug CJK] Full usage object: ${JSON.stringify(usage)}`);
      logger.log(`🔍 [WordScope Cache Debug CJK] cache_creation_input_tokens: ${usage?.cache_creation_input_tokens}, cache_read_input_tokens: ${usage?.cache_read_input_tokens}`);
      
      if (cacheCreationTokens > 0) {
        logger.log(`🔄 [WordScope Cache] 💾 CREATED - ${cacheCreationTokens} tokens cached (full price)`);
      } else if (cacheReadTokens > 0) {
        const cacheCost = Math.round(cacheReadTokens * 0.1);
        const cacheSavings = Math.round(cacheReadTokens * 0.9);
        logger.log(`🔄 [WordScope Cache] ✅ HIT - ${cacheReadTokens} tokens read (90% discount = ${cacheCost} billed)`);
        logger.log(`💵 [WordScope Savings] ${cacheSavings} tokens saved (90% off cached portion)`);
      } else {
        logger.log(`🔄 [WordScope Cache] ⚠️ NONE - Prompt may be too small (need ${MIN_CACHEABLE_TOKENS_HAIKU_45}+ tokens for Haiku 4.5)`);
      }
    } else if (needsReadings && (isOtherReadingLanguage || forcedLanguage === 'ru')) {
      // READING LANGUAGES (Arabic, Hindi, Thai, Russian): Request readings via combinedPrompt or lite user message
      // ar/hi/th/ru use language-specific system prompts with full transliteration/romanization rules
      if (USE_LITE_PROMPTS && (isArabicWithReadings || isHindiWithReadings || isThaiWithReadings || forcedLanguage === 'ru')) {
        dynamicUserMessage = `TARGET LANGUAGE: ${targetLangName}. You MUST translate the text INTO ${targetLangName}. The translatedText must be in ${targetLangName} only (e.g. Korean text if target is Korean, not English).

TEXT: "${normalizedText}"

GRAMMAR: ${scopeInstructions}

JSON (camelCase keys): readingsText, translatedText, scopeAnalysis: { word (main phrase), reading, partOfSpeech (word1 [label]+...), baseForm?, grammar: { explanation, particles? }, examples: [ { sentence, translation, note } ] x3, commonMistake: { wrong, correct, reason }, commonContext?, synonyms: [ { phrase, translation, nuance } ] x3 }. Period-end sentence fields. Labels in ${targetLangName}. All explanations and translatedText in ${targetLangName}. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes.`;
      } else {
        dynamicUserMessage = combinedPrompt;
      }

      logger.log(`🔄 [WordScope Prompt Caching] Sending ${languageDisplayName} request with caching enabled (readings) - system prompt: ${systemPrompt.length} chars, user message: ${dynamicUserMessage.length} chars`);

      response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: wordScopeModel,
          max_tokens: 4000,
          temperature: 0.3,
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" }
            }
          ],
          messages: [
            {
              role: "user",
              content: dynamicUserMessage
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31'
          },
          timeout: 30000
        }
      );

      const usage = response.data?.usage;
      const cacheCreationTokens = usage?.cache_creation_input_tokens || 0;
      const cacheReadTokens = usage?.cache_read_input_tokens || 0;

      if (cacheCreationTokens > 0) {
        logger.log(`🔄 [WordScope Cache] 💾 CREATED - ${cacheCreationTokens} tokens cached (full price)`);
      } else if (cacheReadTokens > 0) {
        const cacheCost = Math.round(cacheReadTokens * 0.1);
        const cacheSavings = Math.round(cacheReadTokens * 0.9);
        logger.log(`🔄 [WordScope Cache] ✅ HIT - ${cacheReadTokens} tokens read (90% discount = ${cacheCost} billed)`);
        logger.log(`💵 [WordScope Savings] ${cacheSavings} tokens saved (90% off cached portion)`);
      } else {
        logger.log(`🔄 [WordScope Cache] ⚠️ NONE - Prompt may be too small (need ${MIN_CACHEABLE_TOKENS_HAIKU_45}+ tokens for Haiku 4.5)`);
      }
    } else {
      // NON-READING LANGUAGES (e.g. English→any): general system prompt, no reading annotations
      if (USE_LITE_PROMPTS) {
        // Lite user message for ENG→any WordScope: ~400 chars vs ~5000, cuts input from ~1400 to ~400 tokens
        dynamicUserMessage = `TEXT: "${normalizedText}"
SOURCE: ${sourceLangName}
TARGET: ${targetLangName}
Translate to ${targetLangName}. Grammar: ${scopeInstructions}
All explanations in TARGET (${targetLangName}): grammar.explanation, note, translation (in examples/synonyms), reason, nuance must be in ${targetLangName}. Example sentences stay in SOURCE (${sourceLangName}). Double-check every scope field is in the correct language.
JSON (camelCase): readingsText "", translatedText, scopeAnalysis: { word, reading, partOfSpeech (word1 [label]+...), baseForm?, grammar: { explanation, particles? }, examples [ { sentence, translation, note } ] x3, commonMistake { wrong, correct, reason }, synonyms [ { phrase, translation, nuance } ] x3 }. Labels in ${targetLangName}. Period-end sentence fields. Do NOT add preamble or explanation outside the JSON. Escape JSON: \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes. No trailing commas.`;
      } else {
        dynamicUserMessage = `TEXT TO PROCESS: "${normalizedText}"
SOURCE LANGUAGE: ${sourceLangName}
TARGET LANGUAGE: ${targetLangName}

=== TASK 1: TRANSLATION ===
Translate the text from ${sourceLangName} to ${targetLangName}.
- Produce a natural, fluent translation
- Do NOT add any pronunciation guides or annotations

=== TASK 2: GRAMMAR ANALYSIS ===
${scopeInstructions}

=== RESPONSE FORMAT ===
You MUST respond with valid JSON in this exact format:
{
  "readingsText": "",
  "translatedText": "Your ${targetLangName} translation here",
  "scopeAnalysis": {
    "word": "main word or key phrase from the source sentence",
    "reading": "",
    "partOfSpeech": "SEE MANDATORY FORMAT BELOW",
    "baseForm": "dictionary form if different, otherwise omit this field",
    "grammar": {
      "explanation": "one clear sentence explaining the grammar pattern in ${targetLangName}",
      "particles": [
        {"particle": "key grammatical element", "use": "its function", "example": "short example"}
      ]
    },
    "examples": [
      {
        "sentence": "simple example sentence in ${sourceLangName} that uses the EXACT same words/phrase from '${normalizedText}' in a different context",
        "translation": "translation in ${targetLangName}",
        "note": "brief grammar point (under 10 words)"
      },
      {
        "sentence": "intermediate example sentence in ${sourceLangName} that uses the EXACT same words/phrase from '${normalizedText}' in a more complex context",
        "translation": "translation in ${targetLangName}",
        "note": "different usage point"
      },
      {
        "sentence": "intermediate example sentence in ${sourceLangName} that uses the EXACT same words/phrase from '${normalizedText}' in another context",
        "translation": "translation in ${targetLangName}",
        "note": "additional usage point"
      }
    ],
    "commonMistake": {
      "wrong": "incorrect usage in ${sourceLangName}",
      "correct": "correct usage in ${sourceLangName}",
      "reason": "brief explanation in ${targetLangName} (under 15 words)"
    },
    "commonContext": "brief note about when/where this phrase is commonly used. Omit if not applicable.",
    "synonyms": [
      {
        "phrase": "alternative way to express the same meaning in ${sourceLangName}",
        "translation": "translation in ${targetLangName}",
        "nuance": "brief note on when to use this vs the original (under 15 words)"
      },
      {
        "phrase": "second alternative expression in ${sourceLangName}",
        "translation": "translation in ${targetLangName}",
        "nuance": "nuance difference"
      },
      {
        "phrase": "third alternative expression in ${sourceLangName}",
        "translation": "translation in ${targetLangName}",
        "nuance": "nuance difference"
      }
    ]
  }
}

=== MANDATORY partOfSpeech FORMAT ===
The partOfSpeech field MUST follow this EXACT pattern:
- Format: [${sourceLangName} word] [${targetLangName} grammar label] + [${sourceLangName} word] [${targetLangName} grammar label] + ...
- The WORDS come from the source text "${normalizedText}"
- The LABELS must be common ${targetLangName} grammar terms

ALLOWED ${targetLangName} LABELS (use ONLY these in ${targetLangName}):
${getGrammarLabels(targetLanguage)}

EXAMPLE (if translating ${sourceLangName} to ${targetLangName}):
✗ WRONG: Using labels in ${sourceLangName} like [${sourceLangName === 'French' ? 'article défini' : sourceLangName === 'Spanish' ? 'artículo' : 'grammar term'}]
✓ CORRECT: Using labels in ${targetLangName} like [${targetLanguage === 'ja' ? '名詞' : targetLanguage === 'fr' ? 'nom' : targetLanguage === 'es' ? 'sustantivo' : 'noun'}]

CRITICAL REQUIREMENTS:
- ALL fields are required and must be complete
- readingsText should be empty for languages that do not require readings (no transliteration/romanization needed)
- Write translation and analysis in ${targetLangName}
- All explanations and learner-facing text (grammar.explanation, note, translation in examples/synonyms, reason, nuance) MUST be in ${targetLangName}. Example sentences (sentence field) and wrong/correct examples stay in ${sourceLangName}. Double-check that scope output is in target language, not source.
- Example sentences MUST be in ${sourceLangName}
- CRITICAL: The "examples" section MUST use the EXACT same words/phrase from "${normalizedText}" - create new sentences that contain the same phrase/words in different contexts, NOT synonyms or alternatives
- The examples are to show how "${normalizedText}" works in different contexts, but must include the actual words/phrase from the scanned text
- The "synonyms" section provides 3 alternative expressions for advanced learners - these MUST be DIFFERENT from what's used in examples
- Do not include any text outside the JSON object
- Ensure proper JSON escaping: use \\" for quotes inside strings, \\n for newlines, \\\\ for backslashes
- Do NOT truncate or abbreviate any field
- commonContext should briefly mention typical situations, relationships, or settings where the phrase appears
- ALL sentence fields MUST end with a period (.) unless they end with ! or ?:
  * "explanation" must end with a period
  * "translation" fields must end with periods for complete sentences
  * "note" fields must end with periods
  * "wrong" and "correct" must end with periods (unless questions/exclamations)
  * "reason" must end with a period
  * "use" in particles array must end with a period
  * "example" in particles array must end with a period
  * "commonContext" must end with a period if it's a complete sentence
  * "nuance" in synonyms array must end with a period`;
      }

      logger.log(`🔄 [WordScope Prompt Caching] Sending ${languageDisplayName} request with caching enabled - system prompt: ${systemPrompt.length} chars, user message: ${dynamicUserMessage.length} chars`);
      
      response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: wordScopeModel,
          max_tokens: 4000,
          temperature: 0.3,
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" }  // ENABLES PROMPT CACHING
            }
          ],
          messages: [
            {
              role: "user",
              content: dynamicUserMessage
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31'  // REQUIRED FOR CACHING
          },
          timeout: 30000
        }
      );
      
      // Extract cache metrics for general languages
      const usage = response.data?.usage;
      const cacheCreationTokens = usage?.cache_creation_input_tokens || 0;
      const cacheReadTokens = usage?.cache_read_input_tokens || 0;
      
      // Debug: Log full usage object to diagnose caching
      logger.log(`🔍 [WordScope Cache Debug] Full usage object: ${JSON.stringify(usage)}`);
      logger.log(`🔍 [WordScope Cache Debug] cache_creation_input_tokens: ${usage?.cache_creation_input_tokens}, cache_read_input_tokens: ${usage?.cache_read_input_tokens}`);
      
      if (cacheCreationTokens > 0) {
        logger.log(`🔄 [WordScope Cache] 💾 CREATED - ${cacheCreationTokens} tokens cached (full price)`);
      } else if (cacheReadTokens > 0) {
        const cacheCost = Math.round(cacheReadTokens * 0.1);
        const cacheSavings = Math.round(cacheReadTokens * 0.9);
        logger.log(`🔄 [WordScope Cache] ✅ HIT - ${cacheReadTokens} tokens read (90% discount = ${cacheCost} billed)`);
        logger.log(`💵 [WordScope Savings] ${cacheSavings} tokens saved (90% off cached portion)`);
      } else {
        logger.log(`🔄 [WordScope Cache] ⚠️ NONE - Prompt may be too small (need ${MIN_CACHEABLE_TOKENS_HAIKU_45}+ tokens for Haiku 4.5)`);
      }
    }
    
    onProgress?.(2);
    
    // Extract token usage
    const usage = response.data?.usage;
    const inputTokens = usage?.input_tokens;
    const outputTokens = usage?.output_tokens;
    
    // Calculate WordScope cost
    const wordScopeCost = (inputTokens || 0) + (outputTokens || 0);
    logger.log(`💵 [WordScope Cost] Input: ${inputTokens} | Output: ${outputTokens} | TOTAL: ${wordScopeCost} tokens`);
    
    // Parse the combined response
    const content = response.data.content as ClaudeContentItem[];
    const rawResponse = content.find((item) => item.type === 'text')?.text || '';
    
    logger.log(`[WordScope Combined] Raw response length: ${rawResponse.length}`);
    
    // Use robust JSON parser with progressive strategy
    const parsedResult = parseWordScopeResponse(rawResponse);
    
    if (!parsedResult || !parsedResult.translatedText) {
      logger.warn('[WordScope Combined] Failed to parse response, falling back to separate calls');
      logger.log(`[WordScope Combined] Raw response preview (first 500 chars): ${rawResponse.substring(0, 500)}`);
      
      // Fall back to the separate calls approach
      return await processWithClaudeAndScopeFallback(text, targetLanguage, forcedLanguage, onProgress, subscriptionPlan);
    }
    
    // Log successful parsing
    logger.log(`[WordScope Combined] Successfully parsed - readingsText: ${parsedResult?.readingsText?.length || 0} chars, translatedText: ${parsedResult?.translatedText?.length || 0} chars`);
    if (parsedResult?.readingsText) {
      logger.log(`[WordScope Combined] readingsText: "${parsedResult.readingsText.substring(0, 100)}..."`);
    }
    if (parsedResult?.scopeAnalysis && typeof parsedResult.scopeAnalysis === 'object') {
      logger.log(`[WordScope Combined] scopeAnalysis is JSON object with word: ${parsedResult.scopeAnalysis.word}`);
    }
    
    // Format scopeAnalysis if it's an object
    let formattedScopeAnalysis: string;
    if (typeof parsedResult.scopeAnalysis === 'object' && parsedResult.scopeAnalysis !== null) {
      try {
        formattedScopeAnalysis = formatScopeAnalysis(parsedResult.scopeAnalysis);
        logger.log(`[WordScope Combined] Formatted scopeAnalysis: ${formattedScopeAnalysis.length} chars`);
        
        // Validate formatted output doesn't look like code/JSON
        const looksLikeCode = formattedScopeAnalysis.includes('{') && formattedScopeAnalysis.includes('"') && 
                             (formattedScopeAnalysis.match(/\{[^}]*\}/g)?.length || 0) > 3;
        if (looksLikeCode || formattedScopeAnalysis.trim().length === 0) {
          logger.error('[WordScope Combined] Formatted scopeAnalysis appears malformed, falling back');
          return await processWithClaudeAndScopeFallback(text, targetLanguage, forcedLanguage, onProgress, subscriptionPlan);
        }
      } catch (formatError) {
        logger.error('[WordScope Combined] Failed to format scopeAnalysis:', formatError);
        return await processWithClaudeAndScopeFallback(text, targetLanguage, forcedLanguage, onProgress, subscriptionPlan);
      }
    } else if (typeof parsedResult.scopeAnalysis === 'string') {
      // Legacy format - validate it doesn't look like raw code/JSON
      const scopeStr = parsedResult.scopeAnalysis;
      const looksLikeCode = scopeStr.includes('{') && scopeStr.includes('"') && 
                           (scopeStr.match(/\{[^}]*\}/g)?.length || 0) > 3;
      if (looksLikeCode) {
        logger.error('[WordScope Combined] String scopeAnalysis appears to be raw code/JSON, falling back');
        return await processWithClaudeAndScopeFallback(text, targetLanguage, forcedLanguage, onProgress, subscriptionPlan);
      }
      formattedScopeAnalysis = scopeStr;
    } else {
      logger.error('[WordScope Combined] scopeAnalysis is missing or invalid');
      return await processWithClaudeAndScopeFallback(text, targetLanguage, forcedLanguage, onProgress, subscriptionPlan);
    }
    
    onProgress?.(3);
    
    // Log successful combined API call
    await logClaudeAPI(metrics, true, rawResponse, undefined, {
      model: wordScopeModel,
      targetLanguage,
      forcedLanguage,
      textLength: normalizedText.length,
      operationType: 'wordscope_combined'
    }, inputTokens, outputTokens);
    
    logger.log('[WordScope Combined] Successfully completed combined translation + scope analysis');
    
    // Return readingsText if provided by Claude (for reading languages)
    const furiganaResult = parsedResult.readingsText || '';
    if (furiganaResult) {
      logger.log(`[WordScope Combined] Returning readingsText: "${furiganaResult.substring(0, 50)}..."`);
    }
    
    return {
      readingsText: furiganaResult,
      translatedText: parsedResult.translatedText,
      scopeAnalysis: formattedScopeAnalysis,
      languageMismatch: undefined,
      tokenUsage: { input: inputTokens ?? 0, output: outputTokens ?? 0, total: (inputTokens ?? 0) + (outputTokens ?? 0) }
    };
    
  } catch (error) {
    logger.error('[WordScope Combined] Combined call failed, falling back to separate calls:', error);
    // Fall back to the original two-call approach if combined fails
    return await processWithClaudeAndScopeFallback(text, targetLanguage, forcedLanguage, onProgress, subscriptionPlan);
  }
}

/**
 * Fallback function that uses the original two-call approach
 * Used when the combined approach fails for any reason
 */
async function processWithClaudeAndScopeFallback(
  text: string,
  targetLanguage: string = 'en',
  forcedLanguage: string = 'ja',
  onProgress?: (checkpoint: number) => void,
  subscriptionPlan?: 'PREMIUM' | 'FREE'
): Promise<ClaudeResponse> {
  logger.log('[WordScope Fallback] Using separate calls approach...');
  
  // CRITICAL: Normalize quotation marks to prevent JSON parsing issues
  // This fixes the bug where quotes in source text (e.g., "tapas") would cause
  // Claude to output malformed JSON with nested unescaped quotes
  const normalizedText = normalizeQuotationMarks(text);
  
  // First, get the normal translation (pass subscription plan to avoid re-fetching)
  const translationResult = await processWithClaude(text, targetLanguage, forcedLanguage, onProgress, false, subscriptionPlan);
  
  if (translationResult.languageMismatch) {
    logger.log('[WordScope Fallback] Language mismatch detected, skipping scope analysis');
    return translationResult;
  }

  // Now get scope analysis with a separate call
  try {
    const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }
    
    // Haiku 4.5 for all languages (fallback scope-only call)
    const wordScopeModel = 'claude-haiku-4-5-20251001';
    
    const targetLangName = LANGUAGE_NAMES_MAP[targetLanguage as keyof typeof LANGUAGE_NAMES_MAP] || 'English';
    const sourceLangName = LANGUAGE_NAMES_MAP[forcedLanguage as keyof typeof LANGUAGE_NAMES_MAP] || 'the source language';
    
    const scopePrompt = `TASK: Grammar analysis ONLY (translation already provided separately)

Analyze the grammatical structure of this ${sourceLangName} text: "${normalizedText}"

IMPORTANT: Output ONLY the grammar analysis JSON below. DO NOT include readingsText or translatedText fields.

Respond with this exact JSON structure:
{
  "word": "word in original script",
  "reading": "pronunciation guide",
  "partOfSpeech": "FORMAT: word1 [${targetLangName} label] + word2 [${targetLangName} label] + ... - use ${sourceLangName} words with ${targetLangName} labels like [noun], [verb], [adjective]",
  "baseForm": "dictionary form if different, otherwise omit this field",
  "grammar": {
    "explanation": "one clear sentence explaining the grammar pattern",
    "particles": [
      {"particle": "particle", "use": "what it marks", "example": "short example"}
    ]
  },
  "examples": [
    {
      "sentence": "simple example sentence that uses the EXACT same words/phrase from '${normalizedText}' in a different context",
      "translation": "translation",
      "note": "brief grammar point (under 10 words)"
    },
    {
      "sentence": "intermediate example sentence that uses the EXACT same words/phrase from '${normalizedText}' in a more complex context",
      "translation": "translation",
      "note": "different usage point"
    },
    {
      "sentence": "intermediate example sentence that uses the EXACT same words/phrase from '${normalizedText}' in another context",
      "translation": "translation",
      "note": "additional usage point"
    }
  ],
  "commonMistake": {
    "wrong": "incorrect usage",
    "correct": "correct usage",
    "reason": "brief explanation (under 15 words)"
  },
  "commonContext": "brief note about when/where this phrase is commonly used (e.g., 'customer-to-patron contexts', 'formal business settings', 'casual conversations'). Omit if not applicable.",
  "synonyms": [
    {
      "phrase": "alternative way to express the same meaning in ${sourceLangName}",
      "translation": "translation in ${targetLangName}",
      "nuance": "brief note on when to use this vs the original (under 15 words)"
    },
    {
      "phrase": "second alternative expression",
      "translation": "translation",
      "nuance": "nuance difference"
    },
    {
      "phrase": "third alternative expression",
      "translation": "translation",
      "nuance": "nuance difference"
    }
  ]
}

RULES:
- Keep all explanations SHORT and practical
- Example notes must be under 10 words
- Examples should progress: simple → intermediate → intermediate
- CRITICAL: The "examples" section MUST use the EXACT same words/phrase from "${normalizedText}" - create new sentences that contain the same phrase/words in different contexts, NOT synonyms or alternatives
- The examples are to show how "${normalizedText}" works in different contexts, but must include the actual words/phrase from the scanned text
- The "synonyms" section provides 3 alternative expressions for advanced learners - these MUST be DIFFERENT from what's used in examples
- Particles array only needed for languages that use them (Japanese, Korean)
- Focus only on what helps the learner USE the word correctly
- If baseForm is the same as word, omit the baseForm field
- commonContext should briefly mention typical situations, relationships, or settings where the phrase appears
- ALL sentence fields MUST end with a period (.) unless they end with ! or ?:
  * "explanation" must end with a period
  * "translation" fields must end with periods for complete sentences
  * "note" fields must end with periods
  * "wrong" and "correct" must end with periods (unless questions/exclamations)
  * "reason" must end with a period
  * "use" in particles array must end with a period
  * "example" in particles array must end with a period
  * "commonContext" must end with a period if it's a complete sentence
  * "nuance" in synonyms array must end with a period
- CRITICAL for "partOfSpeech": 
  * YOU MUST ANALYZE THE SOURCE SENTENCE: "${normalizedText}"
  * DO NOT analyze the translation - analyze the ORIGINAL SOURCE TEXT above
  * FORMAT: word1 [${targetLangName} label] + word2 [${targetLangName} label] + word3 [${targetLangName} label] + ...
  * The words MUST come from "${normalizedText}" - the ${sourceLangName} source
  * The labels MUST be in ${targetLangName} - use these: ${getGrammarLabels(targetLanguage)}
  * Include ALL words from the source
  * WRONG: Using labels in ${sourceLangName} like [${sourceLangName === 'French' ? 'nom' : sourceLangName === 'Spanish' ? 'sustantivo' : 'grammar term'}]
  * CORRECT: Using labels in ${targetLangName} like [${targetLanguage === 'ja' ? '名詞' : targetLanguage === 'en' ? 'noun' : targetLanguage === 'fr' ? 'nom' : 'grammar term'}]
- LANGUAGE REQUIREMENTS:
  * Example sentences ("sentence" field) must be in ${sourceLangName} (the scanned language)
  * Translations ("translation" field) must be in ${targetLangName}
  * Notes, explanations, and all other text must be in ${targetLangName}
  * Common mistake examples ("wrong" and "correct" fields) must be in ${sourceLangName}
  * Common mistake explanation ("reason" field) must be in ${targetLangName}
- CRITICAL JSON ESCAPING: When including quotes in string values (like "tapas"), you MUST escape them as \\" in the JSON output`;
    
    const scopeMetrics = apiLogger.startAPICall('https://api.anthropic.com/v1/messages', {
      text: normalizedText.substring(0, 100),
      targetLanguage,
      forcedLanguage,
      analysisType: 'grammar'
    });
    
    // IMPORTANT: Use a simple, non-cached system prompt for fallback scope analysis.
    // The main WordScope prompt includes translation + readings; for retry we already have those.
    // This dedicated scope-only prompt ensures Claude outputs ONLY the scope JSON.
    const scopeOnlySystemPrompt = `You are a ${sourceLangName} language expert helping ${targetLangName} speakers learn grammar.

YOUR TASK: Analyze the grammatical structure of the given ${sourceLangName} text.

CRITICAL RULES:
1. Output ONLY a single JSON object for grammar analysis
2. DO NOT include any translation (readingsText, translatedText fields)
3. DO NOT output multiple JSON objects
4. DO NOT include any text outside the JSON object
5. Ensure all quotes inside JSON string values are properly escaped as \\"
6. The partOfSpeech field must analyze the SOURCE text words, NOT translations

OUTPUT FORMAT:
{
  "word": "main word/phrase from source",
  "reading": "pronunciation if applicable, otherwise empty string",
  "partOfSpeech": "word1 [label] + word2 [label] + ...",
  "grammar": { "explanation": "...", "particles": [...] },
  "examples": [...],
  "commonMistake": { "wrong": "...", "correct": "...", "reason": "..." },
  "synonyms": [...]
}`;
    
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: wordScopeModel,
        max_tokens: 2000, // Increased from 512 to prevent truncation
        temperature: 0.3,
        system: scopeOnlySystemPrompt,  // Simple non-cached prompt for scope-only analysis
        messages: [{ role: 'user', content: scopePrompt }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
          // Note: No prompt caching for fallback - we use a simple scope-only prompt
        },
        timeout: 15000
      }
    );
    
    // Log cache metrics for fallback scope analysis
    const fallbackUsage = response.data?.usage;
    const fallbackCacheCreation = fallbackUsage?.cache_creation_input_tokens || 0;
    const fallbackCacheRead = fallbackUsage?.cache_read_input_tokens || 0;
    
    if (fallbackCacheCreation > 0) {
      logger.log(`🔄 [WordScope Fallback Cache] 💾 CREATED - ${fallbackCacheCreation} tokens cached`);
    } else if (fallbackCacheRead > 0) {
      logger.log(`🔄 [WordScope Fallback Cache] ✅ HIT - ${fallbackCacheRead} tokens read (90% discount)`);
    }
    
    const scopeUsage = response.data?.usage;
    const scopeInputTokens = scopeUsage?.input_tokens;
    const scopeOutputTokens = scopeUsage?.output_tokens;
    
    const content = response.data.content as ClaudeContentItem[];
    const rawScopeResponse = content.find((item) => item.type === 'text')?.text || '';
    
    // Parse JSON response using robust parser and format it
    // The fallback response is just the scopeAnalysis JSON object
    let formattedScopeAnalysis: string;
    try {
      // Try parsing as direct scopeAnalysis object
      const cleanedResponse = rawScopeResponse.trim();
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        let parsedAnalysis: any = null;
        
        // Strategy 1: Direct parse
        try {
          parsedAnalysis = JSON.parse(jsonMatch[0]);
        } catch (e) {
          // Strategy 2: Try with trailing comma removal
          try {
            const cleaned = jsonMatch[0].replace(/,(\s*[}\]])/g, '$1');
            parsedAnalysis = JSON.parse(cleaned);
          } catch (e2) {
            // Strategy 3: Try extracting from markdown
            const markdownMatch = cleanedResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (markdownMatch) {
              try {
                parsedAnalysis = JSON.parse(markdownMatch[1]);
              } catch (e3) {
                throw new Error('All parsing strategies failed');
              }
            } else {
              throw new Error('All parsing strategies failed');
            }
          }
        }
        
        if (parsedAnalysis && typeof parsedAnalysis === 'object') {
          formattedScopeAnalysis = formatScopeAnalysis(parsedAnalysis);
          logger.log(`[WordScope Fallback] Formatted scopeAnalysis: ${formattedScopeAnalysis.length} chars`);
        } else {
          throw new Error('Parsed result is not an object');
        }
      } else {
        throw new Error('No JSON object found in response');
      }
    } catch (parseError) {
      logger.error('[WordScope Fallback] Failed to parse scope analysis JSON:', parseError);
      logger.log(`[WordScope Fallback] Raw response preview: ${rawScopeResponse.substring(0, 200)}`);
      
      // Log the failed attempt
      await logClaudeAPI(scopeMetrics, false, undefined, parseError instanceof Error ? parseError : new Error(String(parseError)), {
        model: wordScopeModel,
        targetLanguage,
        forcedLanguage,
        textLength: text.length,
        analysisType: 'grammar',
        operationType: 'scope_analysis_fallback',
        parseError: true
      }, scopeInputTokens, scopeOutputTokens);
      
      // Throw error instead of returning broken output
      throw new Error('Failed to parse scope analysis. The API response was malformed. Please try again or check your language settings.');
    }
    
    // Validate that formattedScopeAnalysis is a proper string (not raw JSON or code)
    if (!formattedScopeAnalysis || formattedScopeAnalysis.trim().length === 0) {
      logger.error('[WordScope Fallback] Formatted scope analysis is empty or invalid');
      await logClaudeAPI(scopeMetrics, false, undefined, new Error('Formatted scope analysis is empty'), {
        model: wordScopeModel,
        targetLanguage,
        forcedLanguage,
        textLength: text.length,
        analysisType: 'grammar',
        operationType: 'scope_analysis_fallback',
        validationError: true
      }, scopeInputTokens, scopeOutputTokens);
      throw new Error('Scope analysis formatting failed. Please try again or check your language settings.');
    }
    
    // Check if the formatted output looks like raw code/JSON (common failure pattern)
    const looksLikeCode = formattedScopeAnalysis.includes('{') && formattedScopeAnalysis.includes('"') && 
                          (formattedScopeAnalysis.match(/\{[^}]*\}/g)?.length || 0) > 3;
    if (looksLikeCode) {
      logger.error('[WordScope Fallback] Formatted scope analysis looks like raw code/JSON, not formatted text');
      await logClaudeAPI(scopeMetrics, false, undefined, new Error('Scope analysis output is malformed (looks like code)'), {
        model: wordScopeModel,
        targetLanguage,
        forcedLanguage,
        textLength: text.length,
        analysisType: 'grammar',
        operationType: 'scope_analysis_fallback',
        malformedOutput: true
      }, scopeInputTokens, scopeOutputTokens);
      throw new Error('Scope analysis output is malformed. Please try again or check your language settings.');
    }
    
    await logClaudeAPI(scopeMetrics, true, formattedScopeAnalysis, undefined, {
      model: wordScopeModel,
      targetLanguage,
      forcedLanguage,
      textLength: text.length,
      analysisType: 'grammar',
      operationType: 'scope_analysis_fallback'
    }, scopeInputTokens, scopeOutputTokens);
    
    const translateUsage = translationResult.tokenUsage;
    const totalInput = (translateUsage?.input ?? 0) + scopeInputTokens;
    const totalOutput = (translateUsage?.output ?? 0) + scopeOutputTokens;
    return {
      ...translationResult,
      scopeAnalysis: formattedScopeAnalysis,
      tokenUsage: { input: totalInput, output: totalOutput, total: totalInput + totalOutput }
    };
  } catch (error) {
    logger.error('[WordScope Fallback] Scope analysis failed:', error);
    
    // If it's already our custom error, re-throw it
    if (error instanceof Error && (
      error.message.includes('Failed to parse scope analysis') ||
      error.message.includes('Scope analysis formatting failed') ||
      error.message.includes('Scope analysis output is malformed')
    )) {
      throw error;
    }
    
    // For other errors (network, API, etc.), throw a user-friendly error
    throw new Error('Scope analysis failed. Please try again or check your language settings.');
  }
}

/**
 * Fetch a single type of scope analysis (etymology or grammar) without translation
 * Used for appending alternate analysis to existing scope analysis
 * 
 * @param text The text to analyze
 * @param analysisType Type of analysis: 'etymology' or 'grammar'
 * @param targetLanguage Target language code for the analysis
 * @param forcedLanguage Source language code
 * @returns Promise with just the analysis text
 */
export async function fetchSingleScopeAnalysis(
  text: string,
  analysisType: 'etymology' | 'grammar',
  targetLanguage: string = 'en',
  forcedLanguage: string = 'ja'
): Promise<string> {
  // Start metrics for single scope analysis call
  const scopeMetrics = apiLogger.startAPICall('https://api.anthropic.com/v1/messages', {
    text: text.substring(0, 100),
    targetLanguage,
    forcedLanguage,
    analysisType
  });
  
  try {
    const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }
    
    const targetLangName = LANGUAGE_NAMES_MAP[targetLanguage as keyof typeof LANGUAGE_NAMES_MAP] || 'English';
    const sourceLangName = LANGUAGE_NAMES_MAP[forcedLanguage as keyof typeof LANGUAGE_NAMES_MAP] || 'the source language';
    
    const scopePrompt = analysisType === 'etymology'
      ? `You are a language expert. Analyze this ${sourceLangName} word/idiom and provide etymology and context.

Text to analyze: "${text}"

Provide (in ${targetLangName} language):
1. Etymology: Origin and historical development of this ${sourceLangName} word/idiom
2. How the meaning evolved over time
3. Cultural context and interesting usage notes
4. Be factual - only include information you're confident about, but you don't need to mention this factualness to the user

Write your analysis in ${targetLangName}. Maximum 200 words. Focus on helping language learners understand the ${sourceLangName} word/idiom better.`
      : `You are a language expert. Analyze this ${sourceLangName} sentence and explain its grammar structure.

Text to analyze: "${text}"

Provide (in ${targetLangName} language):
1. Parts of speech: Identify key words and their grammatical roles
2. Sentence structure: How the sentence is constructed
3. Verb forms: Tense, mood, aspect (if applicable)
4. Key grammar points: Important grammatical features for language learners
5. Example sentences: When possible, provide 2 new example sentences in ${sourceLangName} that follow the same grammar structure as the analyzed sentence. These should demonstrate the same grammatical patterns. Only create examples if you can do so naturally without forcing or inventing unrealistic content. If no natural examples are possible, skip this section entirely.
6. Keep it accessible - avoid overwhelming technical jargon

Write your analysis in ${targetLangName}. Maximum 200 words. Focus on helping learners understand how this ${sourceLangName} sentence works grammatically.`;
    
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        temperature: 0.3,
        messages: [{ role: 'user', content: scopePrompt }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: 15000
      }
    );
    
    // Extract token usage from response
    const scopeUsage = response.data?.usage;
    const scopeInputTokens = scopeUsage?.input_tokens;
    const scopeOutputTokens = scopeUsage?.output_tokens;
    
    const content = response.data.content as ClaudeContentItem[];
    const analysis = content.find((item) => item.type === 'text')?.text || '';
    
    logger.log(`[Scope] Successfully fetched ${analysisType} analysis`);
    
    // Log single scope analysis API call with token usage
    await logClaudeAPI(scopeMetrics, true, analysis, undefined, {
      model: 'claude-haiku-4-5-20251001',
      targetLanguage,
      forcedLanguage,
      textLength: text.length,
      analysisType,
      operationType: 'single_scope_analysis'
    }, scopeInputTokens, scopeOutputTokens);
    
    return analysis;
  } catch (error) {
    logger.error(`[Scope] Failed to fetch ${analysisType} analysis:`, error);
    throw error;
  }
}

// Add default export to satisfy Expo Router's requirement
export default {
  processWithClaude,
  processWithClaudeAndScope,
  fetchSingleScopeAnalysis
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
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };
  
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
  // Look for patterns like 漢字(かんじ) or 周り(まわり) - base must START with kanji
  // Hiragana/katakana (okurigana) can follow AFTER the initial kanji, but not before
  const furiganaPattern = /[\u4e00-\u9fff][\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]*\([ぁ-ゟ\?]+\)/g;
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
        logger.log(`Incorrect reading for ${compound}: got ${match[1]}, expected ${expectedReading}`);
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
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };
  
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
  
  // CRITICAL CHECK: Detect if Claude returned romanization-only without Korean characters
  // This happens when input text contains slashes/parentheses that confuse the model
  const romanizedKorean = romanizedText.match(koreanRegex) || [];
  const romanizedKoreanCount = romanizedKorean.length;
  
  if (romanizedKoreanCount === 0 || romanizedKoreanCount < totalKoreanCount * 0.3) {
    // Claude returned romanization-only without preserving Korean characters
    // This is a critical failure that needs retry
    return {
      isValid: false,
      issues: ["CRITICAL: Claude returned romanization-only without Korean characters - original Hangul was lost"],
      suggestions: [
        "Retry with explicit instruction to preserve original Korean text",
        "Format must be: 한글(romanization) not just romanization"
      ],
      accuracy: 0,
      details: `Critical failure: Original text had ${totalKoreanCount} Korean characters, but romanized result has only ${romanizedKoreanCount}. Claude likely misinterpreted slashes/parentheses in input.`
    };
  }
  
  // Check 1: Complete coverage - ensure all Korean words have romanization
  // Updated regex to handle punctuation between Korean text and romanization
  const koreanWordsWithRomanization = romanizedText.match(/[\uAC00-\uD7AF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = koreanWordsWithRomanization.join('').length;
  
  if (totalCoveredChars < totalKoreanCount * 0.9) { // Allow 10% tolerance for edge cases
    issues.push("Incomplete romanization coverage - some Korean words missing romanization");
    addSuggestion("Ensure all Korean words have romanization readings");
  }

  const annotationIssues = analyzeKoreanRomanization(romanizedText);
  annotationIssues.forEach(issue => {
    if (issue.reason === 'nonHangulBase') {
      issues.push(`Romanization applied to non-Hangul text: ${issue.base}(${issue.reading})`);
      addSuggestion("Remove romanization from numbers/Latin text and only annotate Hangul words.");
    } else if (issue.reason === 'japaneseSyllable') {
      issues.push(`Japanese-style romaji detected: ${issue.base}(${issue.reading})`);
      addSuggestion("Use Revised Romanization syllables (no ni-sen, san-ju, shi, tsu, gatsu, desu, etc.).");
    }
  });
  
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
 * Validates Russian text with transliteration for accuracy and completeness
 * @param originalText The original Russian text
 * @param transliteratedText The text with transliteration added
 * @returns Object with validation result and details
 */
function validateRussianTransliteration(originalText: string, transliteratedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  cyrillicCoverage: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };
  
  // Extract all Cyrillic characters from original text
  const cyrillicRegex = /[\u0400-\u04FF]/g;
  const originalCyrillic = originalText.match(cyrillicRegex) || [];
  const totalCyrillicCount = originalCyrillic.length;
  
  if (totalCyrillicCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      cyrillicCoverage: 100,
      details: "No Russian characters found in text"
    };
  }
  
  // Check 1: Ensure Cyrillic base text is preserved in transliteratedText
  // Pattern: Cyrillic(romanization) - the Cyrillic MUST be present
  const cyrillicWordsWithTranslit = transliteratedText.match(/[\u0400-\u04FF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = cyrillicWordsWithTranslit.join('').length;
  const cyrillicCoverage = totalCyrillicCount > 0 ? Math.round((totalCoveredChars / totalCyrillicCount) * 100) : 0;
  
  if (cyrillicCoverage < 90) { // Allow 10% tolerance for edge cases
    issues.push(`Missing Cyrillic base text - only ${cyrillicCoverage}% of original Cyrillic preserved`);
    addSuggestion("Ensure all Russian words keep their original Cyrillic text with romanization in parentheses");
  }
  
  // Check 2: Detect if romanization is shown WITHOUT Cyrillic base (common Claude error)
  // This happens when Claude outputs "Putin(Putin)" instead of "Путин(Putin)"
  const romanOnlyPattern = /\b([a-zA-Z]+)\(\1\)/g;
  const romanOnlyMatches = transliteratedText.match(romanOnlyPattern);
  if (romanOnlyMatches && romanOnlyMatches.length > 0) {
    issues.push(`Romanization without Cyrillic base detected: ${romanOnlyMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Replace Latin text with original Cyrillic characters before the romanization");
  }
  
  // Check 3: Palatalization marker consistency (soft sign handling)
  const palatalizationChecks = [
    { cyrillic: 'ль', translit: "l'", description: 'Soft L should use apostrophe' },
    { cyrillic: 'нь', translit: "n'", description: 'Soft N should use apostrophe' },
    { cyrillic: 'ть', translit: "t'", description: 'Soft T should use apostrophe' },
    { cyrillic: 'дь', translit: "d'", description: 'Soft D should use apostrophe' },
    { cyrillic: 'сь', translit: "s'", description: 'Soft S should use apostrophe' }
  ];
  
  palatalizationChecks.forEach(check => {
    const cyrillicPattern = new RegExp(`[\\u0400-\\u04FF]*${check.cyrillic}[\\u0400-\\u04FF]*[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\(([^)]+)\\)`, 'g');
    const matches = transliteratedText.match(cyrillicPattern);
    if (matches) {
      matches.forEach(match => {
        const translitPart = match.match(/\(([^)]+)\)/)?.[1] || '';
        if (!translitPart.includes("'")) {
          issues.push(`Missing palatalization marker in: ${match}`);
          addSuggestion(`Use ${check.translit} for ${check.cyrillic} (${check.description})`);
        }
      });
    }
  });
  
  // Check 4: Complete coverage - ensure all Russian words have transliteration
  // Count Cyrillic sequences (words) in both texts
  const originalCyrillicWords = originalText.match(/[\u0400-\u04FF]+/g) || [];
  const coveredCyrillicWords = transliteratedText.match(/[\u0400-\u04FF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  
  if (coveredCyrillicWords.length < originalCyrillicWords.length * 0.9) {
    issues.push("Incomplete transliteration coverage - some Russian words missing romanization");
    addSuggestion("Ensure all Russian words have transliteration readings");
  }
  
  return {
    isValid: issues.length === 0 && cyrillicCoverage >= 90,
    issues,
    suggestions,
    cyrillicCoverage,
    details: `Checked ${totalCyrillicCount} Cyrillic characters, coverage: ${cyrillicCoverage}%, found ${issues.length} issues`
  };
}

/**
 * Attempts to rebuild Russian furigana text by matching romanization back to original Cyrillic
 * This is a fallback when Claude outputs romanization without Cyrillic base text
 * @param originalText The original Russian text with Cyrillic
 * @param brokenFuriganaText The text where Cyrillic was replaced with romanization
 * @returns Rebuilt text with Cyrillic(romanization) format, or empty string if rebuild fails
 */
function rebuildRussianFuriganaFromRomanization(originalText: string, brokenFuriganaText: string): string {
  try {
    // Extract Cyrillic words from original text in order
    const cyrillicWords = originalText.match(/[\u0400-\u04FF]+/g) || [];
    
    // Extract romanization patterns like "Putin(Putin)" or "zayavil(zayavil')"
    const romanizationPattern = /([a-zA-Z]+)\(([a-zA-Z'"\s\-]+)\)/g;
    
    let rebuilt = brokenFuriganaText;
    let wordIndex = 0;
    
    rebuilt = rebuilt.replace(romanizationPattern, (match, base, reading) => {
      // If we have a corresponding Cyrillic word, use it as the base
      if (wordIndex < cyrillicWords.length) {
        const cyrillicBase = cyrillicWords[wordIndex];
        wordIndex++;
        // Return Cyrillic with the romanization reading
        return `${cyrillicBase}(${reading})`;
      }
      // If no Cyrillic word available, keep as is (might be actual Latin text)
      return match;
    });
    
    logger.log(`[Russian Rebuild] Attempted to rebuild ${wordIndex} words from romanization to Cyrillic`);
    
    // Verify the rebuild actually improved things
    const cyrillicCount = (rebuilt.match(/[\u0400-\u04FF]/g) || []).length;
    if (cyrillicCount > 0) {
      logger.log(`[Russian Rebuild] Successfully restored ${cyrillicCount} Cyrillic characters`);
      return rebuilt;
    }
    
    logger.warn('[Russian Rebuild] Rebuild did not restore Cyrillic characters');
    return '';
  } catch (error) {
    logger.error('[Russian Rebuild] Error during rebuild:', error);
    return '';
  }
}

/**
 * Validates Arabic text with romanization for accuracy and completeness
 * @param originalText The original Arabic text
 * @param romanizedText The text with Chat Alphabet romanization added
 * @returns Object with validation result and details
 */
function validateArabicRomanization(originalText: string, romanizedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  arabicCoverage: number;
  accuracy: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };
  
  // Extract all Arabic characters from original text
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
  const originalArabic = originalText.match(arabicRegex) || [];
  const totalArabicCount = originalArabic.length;
  
  if (totalArabicCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      arabicCoverage: 100,
      accuracy: 100,
      details: "No Arabic characters found in text"
    };
  }
  
  // Check 1: Ensure Arabic base text is preserved in romanizedText
  // Pattern: Arabic(romanization) - the Arabic MUST be present before the parentheses
  const arabicWordsWithRoman = romanizedText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = arabicWordsWithRoman.join('').length;
  const arabicCoverage = totalArabicCount > 0 ? Math.round((totalCoveredChars / totalArabicCount) * 100) : 0;
  
  if (arabicCoverage < 90) {
    issues.push(`Missing Arabic base text - only ${arabicCoverage}% of original Arabic preserved`);
    addSuggestion("Ensure all Arabic words keep their original Arabic script with Chat Alphabet in parentheses");
  }
  
  // Check 2: Detect if romanization is shown BEFORE Arabic (wrong order)
  // Pattern: (romanization)Arabic is WRONG - should be Arabic(romanization)
  const wrongOrderPattern = /\([a-zA-Z\-']+\)[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g;
  const wrongOrderMatches = romanizedText.match(wrongOrderPattern);
  if (wrongOrderMatches && wrongOrderMatches.length > 0) {
    issues.push(`Romanization before Arabic text detected (wrong order): ${wrongOrderMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Format must be: Arabic(romanization), NOT (romanization)Arabic");
  }
  
  // Check 3: Detect if romanization appears without Arabic base (lone parentheses)
  // Pattern: (sarakha) without Arabic text nearby
  const loneRomanPattern = /(?<![[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF])\([a-zA-Z\-']+\)(?![[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF])/g;
  const loneRomanMatches = romanizedText.match(loneRomanPattern);
  if (loneRomanMatches && loneRomanMatches.length > 0) {
    issues.push(`Romanization without Arabic base detected: ${loneRomanMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Add the original Arabic text before each romanization in parentheses");
  }
  
  // Check 4: Verify sun letter assimilation usage (quality check)
  // If we see 'al-' before known sun letters, flag it as incorrect
  const sunLetterErrors = [
    { pattern: /al-t[ahiou]/g, correction: 'at-', example: 'at-ta, at-ti' },
    { pattern: /al-d[ahiou]/g, correction: 'ad-', example: 'ad-da, ad-du' },
    { pattern: /al-r[ahiou]/g, correction: 'ar-', example: 'ar-ra, ar-ri' },
    { pattern: /al-s[ahiou]/g, correction: 'as-', example: 'as-sa, as-si' },
    { pattern: /al-sh[ahiou]/g, correction: 'ash-', example: 'ash-sha' },
    { pattern: /al-n[ahiou]/g, correction: 'an-', example: 'an-na, an-ni' }
  ];
  
  sunLetterErrors.forEach(check => {
    const matches = romanizedText.match(check.pattern);
    if (matches && matches.length > 0) {
      issues.push(`Sun letter assimilation error: found "${matches[0]}" - should use "${check.correction}"`);
      addSuggestion(`Use ${check.correction} for sun letters (e.g., ${check.example})`);
    }
  });
  
  // Check 5: Complete coverage - ensure all Arabic words have romanization
  const originalArabicWords = originalText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g) || [];
  const coveredArabicWords = romanizedText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  
  if (coveredArabicWords.length < originalArabicWords.length * 0.9) {
    issues.push("Incomplete romanization coverage - some Arabic words missing Chat Alphabet");
    addSuggestion("Ensure all Arabic words have romanization readings");
  }
  
  // Check 6: Detect diacritical marks in romanization (should use simple ASCII)
  // Common problematic patterns: k̲h̲, s̲h̲, d̲, ṣ, ḍ, ṭ (underlines and dots below)
  const diacriticalPattern = /[\u0300-\u036F\u0323-\u0333]/g;
  const diacriticalMatches = romanizedText.match(diacriticalPattern);
  if (diacriticalMatches && diacriticalMatches.length > 0) {
    issues.push(`Diacritical marks detected in romanization (${diacriticalMatches.length} found) - should use simple ASCII`);
    addSuggestion("Use simple ASCII letters: kh (not k̲h̲), sh (not s̲h̲), d (not ḍ or d̲)");
  }
  
  // Calculate accuracy based on coverage and issues
  const issueWeight = Math.min(issues.length * 5, 30); // Each issue reduces accuracy by 5%, max 30%
  const accuracy = Math.max(0, arabicCoverage - issueWeight);
  
  return {
    isValid: issues.length === 0 && arabicCoverage >= 90,
    issues,
    suggestions,
    arabicCoverage,
    accuracy,
    details: `Checked ${totalArabicCount} Arabic characters, coverage: ${arabicCoverage}%, accuracy: ${accuracy}%, found ${issues.length} issues`
  };
}

/**
 * Strips diacritical marks from Arabic romanization text
 * Converts academic transliteration (k̲h̲, ṣ, ḍ) to simple Chat Alphabet (kh, s, d)
 * @param text The romanized text that may contain diacritical marks
 * @returns Text with diacritical marks removed
 */
function stripArabicDiacritics(text: string): string {
  if (!text) return text;
  
  // Remove combining diacritical marks (underlines, dots below, etc.)
  // U+0300-U+036F: Combining Diacritical Marks
  // U+0323-U+0333: Combining dot below, combining low line, etc.
  let cleaned = text.normalize('NFD').replace(/[\u0300-\u036F\u0323-\u0333]/g, '');
  
  // Normalize back to composed form
  cleaned = cleaned.normalize('NFC');
  
  logger.log(`[Arabic Diacritics] Stripped diacritics: "${text.substring(0, 50)}..." -> "${cleaned.substring(0, 50)}..."`);
  
  return cleaned;
}

/**
 * Validates Hindi text with romanization for accuracy and completeness
 * @param originalText The original Hindi text
 * @param romanizedText The text with IAST romanization added
 * @returns Object with validation result and details
 */
function validateHindiRomanization(originalText: string, romanizedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  hindiCoverage: number;
  accuracy: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };
  
  // Extract all Hindi (Devanagari) characters from original text
  const hindiRegex = /[\u0900-\u097F]/g;
  const originalHindi = originalText.match(hindiRegex) || [];
  const totalHindiCount = originalHindi.length;
  
  if (totalHindiCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      hindiCoverage: 100,
      accuracy: 100,
      details: "No Hindi characters found in text"
    };
  }
  
  // Check 1: Ensure Hindi base text is preserved in romanizedText
  // Pattern: Hindi(romanization) - the Hindi MUST be present before the parentheses
  const hindiWordsWithRoman = romanizedText.match(/[\u0900-\u097F]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = hindiWordsWithRoman.join('').length;
  const hindiCoverage = totalHindiCount > 0 ? Math.round((totalCoveredChars / totalHindiCount) * 100) : 0;
  
  if (hindiCoverage < 90) {
    issues.push(`Missing Hindi base text - only ${hindiCoverage}% of original Hindi preserved`);
    addSuggestion("Ensure all Hindi words keep their original Devanagari script with IAST romanization in parentheses");
  }
  
  // Check 2: Detect if romanization is shown BEFORE Hindi (wrong order)
  // Pattern: (romanization)Hindi is WRONG - should be Hindi(romanization)
  const wrongOrderPattern = /\([a-zA-ZāēīōūǎěǐǒǔàèìòùáéíóúǘǙǚǜǖǕǗǙǛüÜɑśṅñṭḍṇḷṛṣḥṁṃḷ̥ṝṟĝśḱńṗṟť\-']+\)[\u0900-\u097F]+/g;
  const wrongOrderMatches = romanizedText.match(wrongOrderPattern);
  if (wrongOrderMatches && wrongOrderMatches.length > 0) {
    issues.push(`Romanization before Hindi text detected (wrong order): ${wrongOrderMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Format must be: Hindi(romanization), NOT (romanization)Hindi");
  }
  
  // Check 3: Detect if romanization appears without Hindi base (lone parentheses)
  // Pattern: (romanization) without Hindi text nearby
  const loneRomanPattern = /(?<![\u0900-\u097F])\([a-zA-ZāēīōūǎěǐǒǔàèìòùáéíóúǘǙǚǜǖǕǗǙǛüÜɑśṅñṭḍṇḷṛṣḥṁṃḷ̥ṝṟĝśḱńṗṟť\-']+\)(?![\u0900-\u097F])/g;
  const loneRomanMatches = romanizedText.match(loneRomanPattern);
  if (loneRomanMatches && loneRomanMatches.length > 0) {
    issues.push(`Romanization without Hindi base detected: ${loneRomanMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Add the original Hindi text before each romanization in parentheses");
  }
  
  // Check 4: Detect quotes or punctuation INSIDE parentheses (formatting error)
  // Pattern: Hindi(romanization" or Hindi(romanization') - quote should be OUTSIDE
  const quoteInsidePattern = /[\u0900-\u097F]+\([^)]*['""][^)]*\)/g;
  const quoteInsideMatches = romanizedText.match(quoteInsidePattern);
  if (quoteInsideMatches && quoteInsideMatches.length > 0) {
    issues.push(`Quote or punctuation inside parentheses detected: ${quoteInsideMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Quotes and punctuation should be OUTSIDE parentheses: हूं(hūṃ)\" NOT हूं(hūṃ\")");
  }
  
  // Check 5: Verify IAST diacritical marks are present (quality check)
  // Hindi romanization should have macrons (ā, ī, ū) and dots (ṭ, ḍ, ṇ, ṣ, ṃ)
  const hasMacrons = /[āīū]/.test(romanizedText);
  const hasRetroflexDots = /[ṭḍṇṣṃṅñśḥḷṛ]/.test(romanizedText);
  
  if (!hasMacrons && totalHindiCount > 10) {
    issues.push("Missing vowel length marks (ā, ī, ū) - romanization may be incomplete");
    addSuggestion("Use proper IAST: आ = ā, ई = ī, ऊ = ū (with macrons)");
  }
  
  if (!hasRetroflexDots && totalHindiCount > 10) {
    issues.push("Missing retroflex/nasal marks (ṭ, ḍ, ṇ, ṣ, ṃ) - romanization may be incomplete");
    addSuggestion("Use proper IAST: ट = ṭ, ड = ḍ, ण = ṇ, ष = ṣ, ं = ṃ (with dots)");
  }
  
  // Check 6: Complete coverage - ensure all Hindi words have romanization
  const originalHindiWords = originalText.match(/[\u0900-\u097F]+/g) || [];
  const coveredHindiWords = romanizedText.match(/[\u0900-\u097F]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  
  if (coveredHindiWords.length < originalHindiWords.length * 0.9) {
    issues.push("Incomplete romanization coverage - some Hindi words missing IAST");
    addSuggestion("Ensure all Hindi words have romanization readings");
  }
  
  // Calculate accuracy based on coverage and issues
  const issueWeight = Math.min(issues.length * 5, 30); // Each issue reduces accuracy by 5%, max 30%
  const accuracy = Math.max(0, hindiCoverage - issueWeight);
  
  return {
    isValid: issues.length === 0 && hindiCoverage >= 90,
    issues,
    suggestions,
    hindiCoverage,
    accuracy,
    details: `Checked ${totalHindiCount} Hindi characters, coverage: ${hindiCoverage}%, accuracy: ${accuracy}%, found ${issues.length} issues`
  };
}

/**
 * Exported validation functions for use in other parts of the app
 */
export { validateJapaneseFurigana, validateKoreanRomanization, validateRussianTransliteration, validateArabicRomanization, validateHindiRomanization }; 