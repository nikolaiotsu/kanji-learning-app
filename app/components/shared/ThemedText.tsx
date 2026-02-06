import React from 'react';
import { Text, TextProps } from 'react-native';
import { FONTS } from '../../constants/typography';

type Weight = 'regular' | 'medium' | 'semiBold' | 'bold';

const fontFamilyByWeight: Record<Weight, string> = {
  regular: FONTS.sans,
  medium: FONTS.sansMedium,
  semiBold: FONTS.sansSemiBold,
  bold: FONTS.sansBold,
};

export interface ThemedTextProps extends TextProps {
  weight?: Weight;
}

/**
 * Text component that uses the app's premium font (DM Sans).
 * Use this for UI labels, body text, and headings to keep typography consistent.
 */
export default function ThemedText({
  weight = 'regular',
  style,
  ...rest
}: ThemedTextProps) {
  return (
    <Text
      style={[{ fontFamily: fontFamilyByWeight[weight] }, style]}
      {...rest}
    />
  );
}
