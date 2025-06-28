/**
 * Utility functions for processing furigana text
 */

/**
 * Cleans up reading text by removing duplicate entries and normalizing format
 * @param text The reading text to clean (furigana/pinyin/romanization)
 * @returns Cleaned reading text
 */
export function cleanFuriganaText(text: string): string {
  if (!text) return text;
  
  // Remove any duplicate reading patterns (e.g., "東京(とうきょう)東京(とうきょう)" -> "東京(とうきょう)")
  const readingRegex = /([\u4e00-\u9fff\u3400-\u4dbf\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F]+)\(([ぁ-ゟa-zA-Zāēīōūǎěǐǒǔàèìòùáéíóúǘǜɑ\s\-0-9]+)\)/g;
  const seen = new Set<string>();
  
  return text.replace(readingRegex, (match, characters, reading) => {
    const key = `${characters}(${reading})`;
    if (seen.has(key)) {
      return characters; // Return just the characters if we've seen this reading before
    }
    seen.add(key);
    return match;
  });
}

/**
 * Validates that reading text has proper format
 * @param text The reading text to validate (furigana/pinyin/romanization)
 * @returns True if the format is valid
 */
export function validateFuriganaFormat(text: string): boolean {
  if (!text) return false;
  
  // Check if text contains properly formatted readings
  // Japanese: 東京(とうきょう) - kanji with hiragana
  // Chinese: 中国(zhōngguó) - hanzi with pinyin
  // Korean: 한국어(han-gug-eo) - hangul with romanization
  // Russian: Русский(russkiy) - cyrillic with romanization
  // Arabic: العربية(al-arabiya) - arabic with transliteration
  // Hindi: हिन्दी(hindī) - devanagari with romanization
  const readingRegex = /([\u4e00-\u9fff\u3400-\u4dbf\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F]+)\(([ぁ-ゟa-zA-Zāēīōūǎěǐǒǔàèìòùáéíóúǘǜɑ\s\-0-9]+)\)/;
  return readingRegex.test(text);
}

/**
 * Extracts all kanji characters from text
 * @param text The text to extract kanji from
 * @returns Array of kanji characters
 */
export function extractKanji(text: string): string[] {
  const kanjiRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
  return text.match(kanjiRegex) || [];
}

/**
 * Counts furigana pairs in text
 * @param text The furigana text
 * @returns Number of furigana pairs found
 */
export function countFuriganaPairs(text: string): number {
  const furiganaRegex = /([\u4e00-\u9fff\u3400-\u4dbf]+)\(([ぁ-ゟ]+)\)/g;
  const matches = text.match(furiganaRegex);
  return matches ? matches.length : 0;
}

/**
 * Splits mixed furigana text into lines for better display
 * @param text The furigana text
 * @param maxCharactersPerLine Optional max characters per line
 * @returns Array of text lines
 */
export function splitFuriganaIntoLines(text: string, maxCharactersPerLine: number = 20): string[] {
  if (!text) return [];
  
  // Split by punctuation marks that naturally break sentences
  const sentences = text.split(/([。！？\n])/);
  const lines: string[] = [];
  let currentLine = '';
  
  for (const sentence of sentences) {
    if (sentence.match(/[。！？\n]/)) {
      // Add punctuation to current line and start new line
      currentLine += sentence;
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = '';
    } else if (currentLine.length + sentence.length <= maxCharactersPerLine) {
      currentLine += sentence;
    } else {
      // Current line would be too long, start new line
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = sentence;
    }
  }
  
  // Add any remaining text
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }
  
  return lines.filter(line => line.length > 0);
} 