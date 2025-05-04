/**
 * Cleans text by removing unwanted characters and formatting
 */
export function cleanText(text: string): string {
  // Remove newlines and replace with spaces
  let cleanedText = text.replace(/\n/g, ' ');
  
  // Remove extra spaces
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
  
  // Check if text contains Chinese or Japanese characters
  const containsChineseOrJapanese = containsChineseJapanese(cleanedText);
  const containsKorean = containsKoreanText(cleanedText);
  
  // Only remove spaces between characters for Chinese and Japanese texts
  // Korean should preserve the original spacing
  if (containsChineseOrJapanese && !containsKorean) {
    // Regex for Japanese and Chinese characters
    const cjCharRegex = /([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff])\s+([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff])/g;
    
    // Continue replacing until no more changes
    let previousText;
    do {
      previousText = cleanedText;
      cleanedText = cleanedText.replace(cjCharRegex, '$1$2');
    } while (previousText !== cleanedText);
  }
  
  return cleanedText;
}

/**
 * Checks if text contains Japanese characters
 */
export function containsJapanese(text: string): boolean {
  // Regex for hiragana, katakana, and kanji
  const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
  return japaneseRegex.test(text);
}

/**
 * Checks if text contains Chinese or Japanese characters
 */
export function containsChineseJapanese(text: string): boolean {
  // Regex for hiragana, katakana, and CJK unified ideographs (kanji/hanzi)
  const cjRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
  return cjRegex.test(text);
}

/**
 * Checks if text contains Chinese characters only (no Japanese-specific characters)
 */
export function containsChinese(text: string): boolean {
  // First check if it contains any CJK characters
  if (!containsChineseJapanese(text)) return false;
  
  // Then make sure it doesn't contain Japanese-specific characters (hiragana, katakana)
  const japaneseSpecificRegex = /[\u3040-\u30ff]/;
  return !japaneseSpecificRegex.test(text);
}

/**
 * Checks if text contains Korean characters
 */
export function containsKoreanText(text: string): boolean {
  // Comprehensive regex for Hangul (Korean alphabet)
  // Includes Hangul syllables, Hangul Jamo, and Hangul compatibility Jamo
  const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC]/;
  return koreanRegex.test(text);
}

/**
 * Checks if text contains Russian characters
 */
export function containsRussianText(text: string): boolean {
  // Regex for Cyrillic alphabet (covers Russian characters)
  const russianRegex = /[\u0400-\u04FF]/;
  return russianRegex.test(text);
}

/**
 * Checks if text contains Arabic characters
 */
export function containsArabicText(text: string): boolean {
  // Regex for Arabic alphabet
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F]/;
  return arabicRegex.test(text);
}

/**
 * Checks if text contains Italian characters and patterns
 */
export function containsItalianText(text: string): boolean {
  // Characters distinct to Italian (like accented vowels)
  const italianSpecificChars = /[àèéìíîòóùú]/i;
  
  // Common Italian word patterns (articles, prepositions, endings)
  const italianPatterns = /\b(il|lo|la|i|gli|le|un|uno|una|di|da|in|con|su|per|tra|fra)\b|\w+(zione|tà|ità|ismo|ista|mente|are|ere|ire)\b/i;
  
  // Check for Italian specific characters or word patterns
  return italianSpecificChars.test(text) || italianPatterns.test(text);
}

/**
 * Checks if text contains any content (from any language)
 */
export function containsText(text: string): boolean {
  // Regex for hiragana, katakana, kanji, Latin letters, numbers, symbols, and other characters used in various languages
  const textRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0030-\u0039\u0041-\u005A\u0061-\u007A\uFF65-\uFF9F\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u2010-\u2015\u2018-\u201D\u3000-\u303F]/;
  return textRegex.test(text);
}

// For backward compatibility
export const cleanJapaneseText = cleanText;

// Add this default export to satisfy Expo Router
const TextFormatting = { 
  cleanText, 
  cleanJapaneseText, 
  containsJapanese, 
  containsChineseJapanese,
  containsChinese,
  containsKoreanText,
  containsText,
  containsRussianText,
  containsArabicText,
  containsItalianText
};
export default TextFormatting; 