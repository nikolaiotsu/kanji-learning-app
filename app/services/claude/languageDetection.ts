/**
 * Language detection and translation quality assessment (extracted from claudeApi to reduce bundle size).
 */
import { logger } from '../../utils/logger';
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
} from '../../utils/textFormatting';

// Quality assessment interface
export interface QualityAssessment {
  score: number;
  needsVerification: boolean;
  reasons: string[];
}

export function assessTranslationQuality(
  translatedText: string,
  targetLanguage: string,
  originalTextLength: number
): QualityAssessment {
  let score = 100;
  const reasons: string[] = [];

  const minExpectedLength = Math.max(3, Math.floor(originalTextLength * 0.3));
  if (translatedText.length < minExpectedLength) {
    const lengthPenalty = Math.min(50, (minExpectedLength - translatedText.length) * 5);
    score -= lengthPenalty;
    reasons.push(`Too short (${translatedText.length} chars, expected >${minExpectedLength})`);
  }

  const hasExpectedChars = checkLanguageCharacterPatterns(translatedText, targetLanguage);
  if (!hasExpectedChars) {
    score -= 30;
    reasons.push(`Missing expected ${targetLanguage} characters`);
  }

  if (containsErrorPatterns(translatedText)) {
    score -= 60;
    reasons.push('Contains error messages or API failures');
  }

  if (containsJsonArtifacts(translatedText)) {
    score -= 40;
    reasons.push('Contains JSON parsing artifacts');
  }

  score = Math.max(0, score);
  return {
    score,
    needsVerification: score < 70,
    reasons
  };
}

export function checkLanguageCharacterPatterns(text: string, language: string): boolean {
  const patterns: Record<string, RegExp> = {
    'ja': /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/,
    'zh': /[\u4e00-\u9fff]/,
    'ko': /[\uac00-\ud7af\u1100-\u11ff]/,
    'ru': /[\u0400-\u04ff]/,
    'ar': /[\u0600-\u06ff]/,
    'hi': /[\u0900-\u097f]/,
    'th': /[\u0E00-\u0E7F]/
  };

  if (patterns[language]) {
    return patterns[language].test(text);
  }

  const isLatinLanguage = ['en', 'fr', 'es', 'it', 'pt', 'de', 'tl', 'eo', 'vi'].includes(language);
  if (isLatinLanguage) {
    const hasLatinChars = /[a-zA-Z]/.test(text);
    const hasUnexpectedCJK = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uac00-\ud7af]/.test(text);
    return hasLatinChars && !hasUnexpectedCJK;
  }

  return text.length > 0;
}

export function containsErrorPatterns(text: string): boolean {
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

export function containsJsonArtifacts(text: string): boolean {
  const jsonArtifacts = [
    /"readingsText"\s*:/,
    /"translatedText"\s*:/,
    /"isComplete"\s*:/,
    /\{[\s\S]*\}/,
    /,[\s\S]*\}/
  ];
  return jsonArtifacts.some(pattern => pattern.test(text));
}

export function detectPrimaryLanguage(text: string, forcedLanguage: string = 'ja'): string {
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
      default: return forcedLanguage;
    }
  }

  let russianChars = 0;
  let japaneseChars = 0;
  let chineseChars = 0;
  let koreanChars = 0;
  let arabicChars = 0;
  let hindiChars = 0;
  let thaiChars = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/[\u0400-\u04FF]/.test(char)) {
      russianChars++;
    } else if (/[\u3040-\u30ff]/.test(char)) {
      japaneseChars++;
    } else if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(char)) {
      if (!containsJapanese(text)) {
        chineseChars++;
      } else {
        japaneseChars++;
      }
    } else if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC]/.test(char)) {
      koreanChars++;
    } else if (/[\u0600-\u06FF\u0750-\u077F]/.test(char)) {
      arabicChars++;
    } else if (/[\u0900-\u097F]/.test(char)) {
      hindiChars++;
    } else if (/[\u0E00-\u0E7F]/.test(char)) {
      thaiChars++;
    }
  }

  if (containsItalianText(text) &&
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Italian";
  }
  if (containsTagalogText(text) &&
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Tagalog";
  }
  if (containsFrenchText(text) &&
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "French";
  }
  if (containsSpanishText(text) &&
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Spanish";
  }
  if (containsPortugueseText(text) &&
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "Portuguese";
  }
  if (containsGermanText(text) &&
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars || hindiChars || thaiChars)) {
    return "German";
  }
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

  if (counts[0].count === 0) {
    const latinChars = text.replace(/\s+/g, '').split('').filter(char => /[a-zA-Z]/.test(char)).length;
    const totalNonSpaceChars = text.replace(/\s+/g, '').length;
    const latinRatio = totalNonSpaceChars > 0 ? latinChars / totalNonSpaceChars : 0;
    logger.log(`[detectPrimaryLanguage] No special chars found. Latin chars: ${latinChars}, Total: ${totalNonSpaceChars}, Ratio: ${latinRatio}`);
    if (latinChars > 0 && latinRatio >= 0.5) {
      logger.log(`[detectPrimaryLanguage] Defaulting to English for Latin-based text: "${text.substring(0, 50)}..."`);
      return "English";
    }
    logger.log(`[detectPrimaryLanguage] Returning unknown for text: "${text.substring(0, 50)}..."`);
    return "unknown";
  }

  logger.log(`[detectPrimaryLanguage] Highest count language: ${counts[0].lang} (${counts[0].count} chars)`);
  return counts[0].lang;
}

/**
 * Validates if the text contains the specified forced language
 */
export function validateTextMatchesLanguage(text: string, forcedLanguage: string = 'ja'): { isValid: boolean; detectedLanguage: string } {
  const detectedLang = detectPrimaryLanguage(text, 'auto');

  if (text.trim().length < 2) {
    logger.log('[validateTextMatchesLanguage] Text too short, returning true');
    return { isValid: true, detectedLanguage: detectedLang };
  }

  const buildResult = (isValid: boolean) => ({ isValid, detectedLanguage: detectedLang });

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
      const hasJapaneseSpecific = /[\u3040-\u30ff]/.test(text);
      const hasCJKChars = /[\u4e00-\u9fff]/.test(text);
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
