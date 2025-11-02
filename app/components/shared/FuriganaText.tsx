import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';
import { cleanFuriganaText, validateFuriganaFormat } from '../../utils/furiganaUtils';

interface FuriganaTextProps {
  text: string;
  fontSize?: number;
  furiganaFontSize?: number;
  color?: string;
  furiganaColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  style?: any;
}

interface FuriganaSegment {
  kanji: string;  // The original characters (kanji, hanzi, hangul, cyrillic, arabic, or devanagari)
  furigana: string;  // The reading (hiragana, pinyin, romanization, or transliteration)
  type: 'furigana' | 'plain';
}

const FuriganaText: React.FC<FuriganaTextProps> = ({
  text,
  fontSize = 24,
  furiganaFontSize,
  color = COLORS.text,
  furiganaColor,
  textAlign = 'left',
  style
}) => {
  // Calculate reading font size as a ratio of main text if not provided
  const calcFuriganaFontSize = furiganaFontSize || Math.max(10, fontSize * 0.5);
  const calcFuriganaColor = furiganaColor || color;

  // Parse the text into segments with and without furigana
  const parseText = (inputText: string): FuriganaSegment[] => {
    const segments: FuriganaSegment[] = [];
    
    // Clean the input text first
    const cleanedText = cleanFuriganaText(inputText);
    
    // Validate format
    if (!validateFuriganaFormat(cleanedText)) {
      // If no valid furigana format found, treat as plain text
      segments.push({
        kanji: cleanedText,
        furigana: '',
        type: 'plain'
      });
      return segments;
    }
    
    // Regex to match text with readings in parentheses
    // Now supports mixed kanji-hiragana-katakana words and punctuation
    // For Japanese: 東京(とうきょう) - kanji with hiragana
    //              落ち着いた(おちついた) - mixed kanji-hiragana with hiragana reading
    //              食べ物(たべもの) - mixed kanji-hiragana with hiragana reading
    // For Chinese: 中国(zhōngguó) - hanzi with pinyin
    // For Korean: 한국어(han-gug-eo) or 안녕하세요!(an-nyeong-ha-se-yo!) - hangul with romanization
    // For Russian: Русский(russkiy) - cyrillic with romanization
    // For Arabic: العربية(al-arabiya) - arabic with transliteration
    // For Hindi: हिन्दी(hindī) - devanagari with IAST romanization
    const readingRegex = /([\u4e00-\u9fff\u3400-\u4dbf\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u3040-\u309f\u30a0-\u30ff]+)([!?.,;:'"'"‚""„‹›«»‑–—…\s]*)\(([ぁ-ゟa-zA-ZāēīōūǎěǐǒǔàèìòùáéíóúǘǙǚǜǖǕǗǙǛüÜɑśṅñṭḍṇḷṛṣḥṁṃḷ̥ṝṟĝśḱńṗṟť\s\-0-9!?.,;:'"'"‚""„‹›«»‑–—…]+)\)/g;
    
    let lastIndex = 0;
    let match;
    
    while ((match = readingRegex.exec(cleanedText)) !== null) {
      // Add any plain text before this match
              if (match.index > lastIndex) {
          const plainText = cleanedText.slice(lastIndex, match.index);
        // Clean up any English words that accidentally got furigana annotations
        // Remove patterns like "LINE(らいん)" -> "LINE"
        const cleanedPlainText = plainText.replace(/([a-zA-Z]+)\([ぁ-ゟa-zA-Z\s\-0-9!?.,;:'"'"‚""„‹›«»‑–—…]+\)/g, '$1');
        if (cleanedPlainText.trim()) {
          segments.push({
            kanji: cleanedPlainText,
            furigana: '',
            type: 'plain'
          });
        }
      }
      
      // Safety check: Filter out English words that accidentally got furigana
      // Check if match[1] contains only ASCII letters (a-z, A-Z) - this is an error
      const mainText = match[1];
      const isOnlyEnglish = /^[a-zA-Z]+$/.test(mainText);
      
      if (isOnlyEnglish) {
        // This is an English word that shouldn't have furigana - treat as plain text
        segments.push({
          kanji: mainText + (match[2] || ''),
          furigana: '',
          type: 'plain'
        });
      } else {
        // Valid furigana segment - add it
        segments.push({
          kanji: mainText + (match[2] || ''), // Include punctuation with the main text
          furigana: match[3],
          type: 'furigana'
        });
      }
      
      lastIndex = readingRegex.lastIndex;
    }
    
    // Add any remaining plain text
    if (lastIndex < cleanedText.length) {
      const remainingText = cleanedText.slice(lastIndex);
      // Clean up any English words that accidentally got furigana annotations
      const cleanedRemainingText = remainingText.replace(/([a-zA-Z]+)\([ぁ-ゟa-zA-Z\s\-0-9!?.,;:'"'"‚""„‹›«»‑–—…]+\)/g, '$1');
      if (cleanedRemainingText.trim()) {
        segments.push({
          kanji: cleanedRemainingText,
          furigana: '',
          type: 'plain'
        });
      }
    }
    
    return segments;
  };

  const segments = parseText(text);

  // If no furigana found, render as plain text
  if (segments.length === 0 || segments.every(s => s.type === 'plain')) {
    return (
      <Text style={[{ fontSize, color, textAlign }, style]}>
        {text}
      </Text>
    );
  }

  return (
    <View style={[styles.container, { alignItems: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start' }, style]}>
      <View style={styles.textContainer}>
        {segments.map((segment, index) => (
          <View key={index} style={styles.segmentContainer}>
            {segment.type === 'furigana' ? (
              <>
                {/* Furigana text positioned above */}
                <Text style={[
                  styles.furiganaText,
                  {
                    fontSize: calcFuriganaFontSize,
                    color: calcFuriganaColor,
                    textAlign: 'center'
                  }
                ]}>
                  {segment.furigana}
                </Text>
                {/* Main kanji text below */}
                <Text style={[
                  styles.kanjiText,
                  {
                    fontSize,
                    color,
                    textAlign: 'center'
                  }
                ]}>
                  {segment.kanji}
                </Text>
              </>
            ) : (
              // Plain text without furigana
              <Text style={[
                styles.plainText,
                {
                  fontSize,
                  color,
                  // Add top margin to align with kanji that have furigana
                  marginTop: calcFuriganaFontSize + 2
                }
              ]}>
                {segment.kanji}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  textContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  segmentContainer: {
    alignItems: 'center',
    marginHorizontal: 1,
  },
  furiganaText: {
    lineHeight: undefined, // Use default line height for furigana
    marginBottom: 2,
  },
  kanjiText: {
    lineHeight: undefined, // Use default line height for kanji
  },
  plainText: {
    lineHeight: undefined, // Use default line height for plain text
  },
});

export default FuriganaText; 