import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';
import { parseFuriganaText, FuriganaWord } from '../../utils/furiganaUtils';

interface FuriganaTextProps {
  text: string;
  fontSize?: number;
  furiganaFontSize?: number;
  color?: string;
  furiganaColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  style?: any;
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

  /**
   * Memoized parsing: Only re-parse when the input text changes.
   * This prevents expensive regex operations on every render.
   */
  const words = useMemo(() => {
    console.log('[FuriganaText] Input text:', text);
    const parsed = parseFuriganaText(text);
    console.log('[FuriganaText] Parsed words:', JSON.stringify(parsed, null, 2));
    
    // Validation: Log warnings for potential data quality issues
    parsed.forEach((word, index) => {
      if (word.type === 'ruby' && word.ruby) {
        const baseLength = Array.from(word.base).length;
        const rubyLength = Array.from(word.ruby).length;
        
        // Warn if ruby text is significantly shorter than base (might indicate missing mora)
        if (rubyLength < baseLength * 0.5) {
          console.warn(
            `[FuriganaText] Potential data issue at word ${index}: ` +
            `base="${word.base}" (${baseLength} chars) has unusually short ` +
            `ruby="${word.ruby}" (${rubyLength} chars). Check if reading is complete.`
          );
        }
      }
    });
    
    return parsed;
  }, [text]);

  /**
   * Render a word with ruby annotation (furigana above kanji).
   * Industry best practice: Stack ruby text directly above base text in a centered column.
   * This mimics HTML <ruby> behavior and ensures consistent alignment.
   * 
   * CRITICAL: Let React Native measure text naturally instead of forcing widths.
   * The container flexes to fit the wider of base or ruby text.
   */
  const renderRubyWord = (word: FuriganaWord, index: number) => {
    return (
      <View 
        key={`ruby-${index}`} 
        style={styles.rubyColumn}
      >
        <Text
          style={[
            styles.rubyText,
            {
              fontSize: calcFuriganaFontSize,
              color: calcFuriganaColor,
            }
          ]}
          numberOfLines={1}
        >
          {word.ruby}
        </Text>
        <Text
          style={[
            styles.baseText,
            {
              fontSize,
              color,
            }
          ]}
          numberOfLines={1}
        >
          {word.base}
        </Text>
      </View>
    );
  };

  /**
   * Render plain text without ruby annotation.
   * No artificial spacing - alignment is handled by flexbox baseline.
   */
  const renderPlainWord = (word: FuriganaWord, index: number) => (
    <View key={`text-${index}`} style={styles.textColumn}>
      <Text
        style={[
          styles.plainText,
          {
            fontSize,
            color,
          }
        ]}
      >
        {word.base}
      </Text>
    </View>
  );

  // If no words parsed or all plain text, render simply
  if (words.length === 0 || words.every(w => w.type === 'text')) {
    return (
      <Text style={[{ fontSize, color, textAlign }, style]}>
        {text}
      </Text>
    );
  }

  return (
    <View style={[styles.container, { alignItems: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start' }, style]}>
      <View style={styles.textContainer}>
        {words.map((word, index) =>
          word.type === 'ruby'
            ? renderRubyWord(word, index)
            : renderPlainWord(word, index)
        )}
      </View>
    </View>
  );
};

/**
 * Styles following industry best practices for ruby text rendering:
 * - Use flexbox baseline alignment to keep all text on the same line
 * - Center ruby text above base text naturally without width calculations
 * - Let Text components size themselves based on content
 * - Minimal spacing between words for natural reading flow
 * 
 * This matches the HTML <ruby> tag standard used by:
 * - NHK News Web Easy
 * - Kindle Japanese e-books
 * - Jisho.org dictionary
 * - Japanese language learning apps
 */
const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  textContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end', // Align all columns by their baseline (bottom text)
  },
  rubyColumn: {
    flexDirection: 'column',
    alignItems: 'center', // Center ruby text above base text
    justifyContent: 'flex-end', // Align to baseline
    flexShrink: 0, // Prevent shrinking
  },
  textColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end', // Align plain text with baseline of ruby columns
    flexShrink: 0, // Prevent shrinking
  },
  rubyText: {
    textAlign: 'center',
    marginBottom: 1, // Minimal gap between ruby and base text
    writingDirection: 'ltr', // Force left-to-right for horizontal furigana
  },
  baseText: {
    textAlign: 'center',
    writingDirection: 'ltr', // Force left-to-right
  },
  plainText: {
    textAlign: 'center',
    writingDirection: 'ltr', // Force left-to-right
  },
});

export default FuriganaText; 