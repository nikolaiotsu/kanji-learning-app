/**
 * Utility functions for processing furigana text
 */

/**
 * Cleans up reading text by normalizing format
 * @param text The reading text to clean (furigana/pinyin/romanization)
 * @returns Cleaned reading text
 * 
 * NOTE: We do NOT remove duplicate annotations anymore!
 * Users might want the same word annotated multiple times in a sentence.
 * Example: "番号(ばんごう)と番号(ばんごう)" should keep BOTH annotations
 * so each instance gets furigana displayed above it.
 */
export function cleanFuriganaText(text: string): string {
  if (!text) return text;
  
  // Currently this function just returns the text as-is
  // In the future, we could add other normalization here if needed
  // (e.g., normalizing whitespace, fixing malformed parentheses, etc.)
  return text;
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
  //          落ち着いた(おちついた) - mixed kanji-hiragana with hiragana reading
  //          食べ物(たべもの) - mixed kanji-hiragana with hiragana reading
  // Chinese: 中国(zhōngguó) - hanzi with pinyin
  // Korean: 한국어(han-gug-eo) - hangul with romanization
  // Russian: Русский(russkiy) - cyrillic with romanization
  // Arabic: العربية(al-arabiya) - arabic with transliteration
  // Hindi: हिन्दी(hindī) - devanagari with romanization
  // Esperanto: Esperanto characters with Latin script
  const readingRegex = /([\u4e00-\u9fff\u3400-\u4dbf\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u3040-\u309f\u30a0-\u30ff]+)\(([ぁ-ゟa-zA-ZāēīōūǎěǐǒǔàèìòùáéíóúǘǙǚǜǖǕǗǙǛüÜɑĉĝĥĵŝŭĈĜĤĴŜŬ\s\-0-9]+)\)/;
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
  // Updated to handle mixed kanji-hiragana-katakana words like 落ち着いた(おちついた)
  const furiganaRegex = /([\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff]+)\(([ぁ-ゟ]+)\)/g;
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

/**
 * Normalized furigana word structure
 * This is the industry standard approach used by HTML <ruby> tags and e-readers
 */
export interface FuriganaWord {
  /** The base text (kanji, hanzi, hangul, etc.) */
  base: string;
  /** The reading (hiragana, pinyin, romanization, etc.) - empty string for plain text */
  ruby: string;
  /** Type of segment */
  type: 'ruby' | 'text';
}

/**
 * Parse furigana-annotated text into normalized word segments.
 * 
 * This function converts text like "東京(とうきょう)ガス" into a normalized
 * array of {base, ruby, type} objects that can be rendered consistently.
 * 
 * Industry best practice: Keep each logical word unit together with its complete
 * reading, just like HTML <ruby><rb>東京</rb><rt>とうきょう</rt></ruby>
 * 
 * @param text Input text with readings in parentheses, e.g. "東京(とうきょう)"
 * @returns Array of normalized furigana words
 */
export function parseFuriganaText(text: string): FuriganaWord[] {
  if (!text) return [];
  
  // Fix quotes inside parentheses with missing closing paren: हूं(hūṃ" → हूं(hūṃ)"
  // This handles Claude's malformed output where quote ends up inside and ) is dropped
  let fixedText = text.replace(/\(([a-zA-Zāēīōūǎěǐǒǔàèìòùáéíóúṭḍṇṣṃṅñśḥṁḷṛ\-]+)(["']+)(?=\s|$)/g, '($1)$2');
  
  const words: FuriganaWord[] = [];
  const cleanedText = cleanFuriganaText(fixedText);
  
  // If no valid furigana format, return as plain text
  if (!validateFuriganaFormat(cleanedText)) {
    return [{ base: cleanedText, ruby: '', type: 'text' }];
  }
  
  // INDUSTRY STANDARD APPROACH: Split by finding ALL ruby annotations first,
  // then render everything between them as plain text.
  // This matches how HTML <ruby> tags work and how e-readers display furigana.
  
  // CRITICAL FIX: Only match CJK characters (kanji/hanzi/hangul) BEFORE the parentheses
  // Do NOT include hiragana/katakana [\u3040-\u309f\u30a0-\u30ff] in the base match
  // Those should be plain text between ruby annotations
  // This ensures "は東京(とうきょう)" becomes: は [text] + 東京(とうきょう) [ruby]
  // 
  // PUNCTUATION HANDLING: Allow optional punctuation between base and reading
  // e.g., 심각하다"(sim-gag-ha-da) or 요청했다.(yo-cheong-haess-da.)
  // We capture the punctuation and move it outside the ruby annotation
  //
  // QUOTE WRAPPING: Handle quotes/guillemets wrapping the base text
  // e.g., «الأهرام»(al-'ahraam) or "東京"(とうきょう)
  // We capture leading and trailing quotes separately
  //
  // COMBINING DIACRITICAL MARKS: Include Unicode combining marks (U+0300-U+036F, U+0323-U+0333)
  // for languages that use them in romanization (e.g., Arabic k̲h̲, Hindi ṃ, etc.)
  const rubyRegex = /([«»"'「」『』‹›]?)([\u4e00-\u9fff\u3400-\u4dbf\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F]+)([»«"'」」』』›‹.!?,;:。、]+)?\(([ぁ-ゟa-zA-ZāēīōūǎěǐǒǔàèìòùáéíóúǘǙǚǜǖǕǗǙǛüÜɑśṅñṭḍṇḷṛṣḥṁṃḷ̥ṝṟĝśḱńṗṟť\u0300-\u036F\u0323-\u0333\s\-0-9!?.,;:'"‚""„‹›«»‑–—…']+)\)/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = rubyRegex.exec(cleanedText)) !== null) {
    const fullMatch = match[0];          // e.g., "«الأهرام»(al-'ahraam)" or "東京(とうきょう)"
    const leadingQuote = match[1] || ''; // e.g., "«" or """ (captured group 1, optional)
    const baseText = match[2];           // e.g., "الأهرام" or "東京" (captured group 2)
    const trailingPunct = match[3] || '';// e.g., "»" or "." (captured group 3, optional)
    const reading = match[4];            // e.g., "al-'ahraam" or "とうきょう" (captured group 4)
    const matchStart = match.index;
    
    // Add plain text before this ruby annotation
    if (matchStart > lastIndex) {
      const plainText = cleanedText.slice(lastIndex, matchStart);
      if (plainText) {
        words.push({ base: plainText, ruby: '', type: 'text' });
      }
    }
    
    // Add leading quote as plain text if present
    if (leadingQuote) {
      words.push({ base: leadingQuote, ruby: '', type: 'text' });
    }
    
    // FILTER 1: Skip English-only words that shouldn't have furigana
    if (/^[a-zA-Z]+$/.test(baseText)) {
      words.push({ base: baseText, ruby: '', type: 'text' });
      if (trailingPunct) {
        words.push({ base: trailingPunct, ruby: '', type: 'text' });
      }
      lastIndex = rubyRegex.lastIndex;
      continue;
    }
    
    // FILTER 2: Skip nonsensical annotations where hiragana is annotated with itself
    // Example: それは(それは), になって(なって), ない(ない)
    // These are API errors - hiragana doesn't need furigana!
    const isOnlyHiragana = /^[\u3040-\u309f]+$/.test(baseText);
    const cleanedReading = reading.replace(/\s+/g, '');
    const readingMatchesBase = baseText === cleanedReading || baseText === reading;
    
    if (isOnlyHiragana && readingMatchesBase) {
      // This is hiragana annotated with itself - treat as plain text
      words.push({ base: baseText, ruby: '', type: 'text' });
      if (trailingPunct) {
        words.push({ base: trailingPunct, ruby: '', type: 'text' });
      }
      lastIndex = rubyRegex.lastIndex;
      continue;
    }
    
    // FILTER 3: Skip if base is only hiragana/katakana (doesn't need ruby)
    // Exception: Allow katakana with romanization for learning purposes
    const isOnlyKana = /^[\u3040-\u309f\u30a0-\u30ff]+$/.test(baseText);
    if (isOnlyKana) {
      words.push({ base: baseText, ruby: '', type: 'text' });
      if (trailingPunct) {
        words.push({ base: trailingPunct, ruby: '', type: 'text' });
      }
      lastIndex = rubyRegex.lastIndex;
      continue;
    }
    
    // Valid ruby annotation - add it
    words.push({
      base: baseText,
      ruby: cleanedReading,
      type: 'ruby'
    });
    
    // Add trailing punctuation as plain text if it was between base and reading
    if (trailingPunct) {
      words.push({ base: trailingPunct, ruby: '', type: 'text' });
    }
    
    lastIndex = rubyRegex.lastIndex;
  }
  
  // Add remaining plain text after the last ruby annotation
  if (lastIndex < cleanedText.length) {
    const remaining = cleanedText.slice(lastIndex);
    if (remaining) {
      words.push({ base: remaining, ruby: '', type: 'text' });
    }
  }
  
  // POST-PROCESSING: Clean up nonsensical annotations in plain text segments
  // These are hiragana/katakana annotated with readings (API errors) that our regex skipped
  // Example: "それは(それは)もう" should become "それはもう"
  const cleanedWords = words.map(word => {
    if (word.type === 'text' && word.base.includes('(')) {
      // Remove annotations where hiragana/katakana is annotated with itself or similar
      // Pattern: kana(reading) where both are kana
      const cleaned = word.base.replace(/([ぁ-ゟァ-ヿ]+)\(([ぁ-ゟァ-ヿa-zA-Z\s\-0-9]+)\)/g, (match, base, reading) => {
        // If base and reading are identical or very similar, just return base
        const cleanedReading = reading.replace(/\s+/g, '');
        if (base === reading || base === cleanedReading) {
          return base;
        }
        // If reading is also kana (API error), just return base
        if (/^[ぁ-ゟァ-ヿ]+$/.test(cleanedReading)) {
          return base;
        }
        // Otherwise keep the annotation (might be legitimate romanization)
        return match;
      });
      
      return { ...word, base: cleaned };
    }
    return word;
  });
  
  return cleanedWords;
} 