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
    
    // Regex to match CJK characters, Korean Hangul, Cyrillic, Arabic, and Devanagari followed by readings in parentheses
    // For Japanese: 東京(とうきょう) - kanji with hiragana
    // For Chinese: 中国(zhōngguó) - hanzi with pinyin
    // For Korean: 한국어(han-gug-eo) - hangul with romanization
    // For Russian: Русский(russkiy) - cyrillic with romanization
    // For Arabic: العربية(al-arabiya) - arabic with transliteration
    // For Hindi: हिन्दी(hindī) - devanagari with IAST romanization
    const readingRegex = /([\u4e00-\u9fff\u3400-\u4dbf\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F]+)\(([ぁ-ゟa-zA-Zāēīōūǎěǐǒǔàèìòùáéíóúǘǜɑśṅñṭḍṇḷṛṣḥṁṃḷ̥ṝṟĝśḱńṗṟť\s\-0-9]+)\)/g;
    
    let lastIndex = 0;
    let match;
    
    while ((match = readingRegex.exec(cleanedText)) !== null) {
      // Add any plain text before this match
              if (match.index > lastIndex) {
          const plainText = cleanedText.slice(lastIndex, match.index);
        if (plainText.trim()) {
          segments.push({
            kanji: plainText,
            furigana: '',
            type: 'plain'
          });
        }
      }
      
      // Add the furigana segment
      segments.push({
        kanji: match[1],
        furigana: match[2],
        type: 'furigana'
      });
      
      lastIndex = readingRegex.lastIndex;
    }
    
    // Add any remaining plain text
    if (lastIndex < cleanedText.length) {
      const remainingText = cleanedText.slice(lastIndex);
      if (remainingText.trim()) {
        segments.push({
          kanji: remainingText,
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