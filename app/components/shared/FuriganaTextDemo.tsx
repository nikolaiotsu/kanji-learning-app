import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';
import FuriganaText from './FuriganaText';

const FuriganaTextDemo: React.FC = () => {
  // Example text with readings similar to what Claude API returns
  const examples = [
    { text: "こんばんは！", language: "Japanese" },
    { text: "恋愛(れんあい)は長い(ながい)会話(かいわ)のようなもの", language: "Japanese" },
    { text: "你好(nǐ hǎo)世界(shìjiè)！", language: "Chinese" },
    { text: "我(wǒ)爱(ài)学习(xuéxí)中文(zhōngwén)", language: "Chinese" },
    { text: "今天(jīntiān)天气(tiānqì)很好(hěn hǎo)", language: "Chinese" },
    { text: "안녕하세요(an-nyeong-ha-se-yo)！", language: "Korean" },
    { text: "저는(jeo-neun) 학생입니다(hag-saeng-im-ni-da)", language: "Korean" },
    { text: "오늘(o-neul) 날씨가(nal-ssi-ga) 좋아요(jo-a-yo)", language: "Korean" },
    { text: "Привет(privet)!", language: "Russian" },
    { text: "Я(ya) изучаю(izuchayu) русский(russkiy) язык(yazyk)", language: "Russian" },
    { text: "Сегодня(segodnya) хорошая(khoroshaya) погода(pogoda)", language: "Russian" },
    { text: "مرحبا(marhaban)!", language: "Arabic" },
    { text: "أنا(ana) أدرس(udrus) العربية(al-arabiya)", language: "Arabic" },
    { text: "اليوم(al-yawm) جو(jaw) جميل(jameel)", language: "Arabic" }
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reading System Demo</Text>
      
      {examples.map((example, index) => (
        <View key={index} style={styles.exampleContainer}>
          <Text style={styles.exampleLabel}>Example {index + 1} ({example.language}):</Text>
          <FuriganaText
            text={example.text}
            fontSize={20}
            furiganaFontSize={12}
            color={COLORS.text}
            furiganaColor={COLORS.darkGray}
            textAlign="center"
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  exampleContainer: {
    marginBottom: 30,
    padding: 15,
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.royalBlue,
  },
  exampleLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.darkGray,
    marginBottom: 10,
  },
});

export default FuriganaTextDemo; 