import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  SafeAreaView,
  Dimensions
} from 'react-native';
import { useTranslation } from 'react-i18next';
import i18next from '../../i18n';
import { Flashcard } from '../../types/Flashcard';
import { localizeScopeAnalysisHeadings, parseScopeAnalysisForStyling } from '../../utils/textFormatting';
import { updateFlashcard } from '../../services/supabaseStorage';
import { processWithClaude, processWithClaudeAndScope } from '../../services/claudeApi';
// Removed text formatting imports - no longer needed for direct content analysis
import { useSettings, AVAILABLE_LANGUAGES } from '../../context/SettingsContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { getCurrentSubscriptionPlan } from '../../services/receiptValidationService';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';

import { logger } from '../../utils/logger';
const { height: screenHeight } = Dimensions.get('window');

interface EditFlashcardModalProps {
  visible: boolean;
  flashcard: Flashcard | null;
  onClose: () => void;
  onSave: (updatedFlashcard: Flashcard) => void;
}

const EditFlashcardModal: React.FC<EditFlashcardModalProps> = ({ 
  visible, 
  flashcard, 
  onClose, 
  onSave 
}) => {
  const { t } = useTranslation();
  const { targetLanguage, forcedDetectionLanguage } = useSettings();
  const { subscription } = useSubscription();
  const [originalText, setOriginalText] = useState('');
  const [readingsText, setReadingsText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [scopeAnalysis, setScopeAnalysis] = useState('');
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [isRewordscoping, setIsRewordscoping] = useState(false);
  const [needsRomanization, setNeedsRomanization] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [error, setError] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  // Get translated language name for display (use the language stored with the flashcard)
  const translatedLanguageName = AVAILABLE_LANGUAGES[flashcard?.targetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'English';

  // Initialize form when flashcard changes
  useEffect(() => {
    if (flashcard) {
      setOriginalText(flashcard.originalText);
      setReadingsText(flashcard.readingsText);
      setTranslatedText(flashcard.translatedText);
      setScopeAnalysis(flashcard.scopeAnalysis ?? '');
      
      // Determine pronunciation guide type based on content (no language detection needed)
const readingsText = flashcard.readingsText;

      if (!readingsText) {
        setNeedsRomanization(false);
        setDetectedLanguage('English'); // Default for text without pronunciation guide
        return;
      }

      // Check what type of pronunciation guide the readingsText contains
      const containsHiragana = /[\u3040-\u309F]/.test(readingsText); // Japanese furigana
      const containsHangul = /[\uAC00-\uD7AF]/.test(readingsText); // Korean
      const containsCyrillic = /[\u0400-\u04FF]/.test(readingsText); // Russian
      const containsArabicScript = /[\u0600-\u06FF]/.test(readingsText); // Arabic
      const containsLatinInParentheses = /\([a-zA-Zāēīōūǎěǐǒǔàèìòùáéíóúǘǜɑ\s]+\)/.test(readingsText); // Chinese pinyin or other romanization

      let language = 'unknown';
      if (containsHiragana) {
        language = 'Japanese';
      } else if (containsLatinInParentheses) {
        // Could be Chinese pinyin, Korean romanization, Russian romanization, etc.
        // Check for specific patterns to distinguish
        if (containsHangul) {
          language = 'Korean';
        } else if (containsCyrillic) {
          language = 'Russian';
        } else if (containsArabicScript) {
          language = 'Arabic';
        } else {
          // Default to Chinese for Latin characters in parentheses
          language = 'Chinese';
        }
      } else if (containsHangul) {
        language = 'Korean';
      } else if (containsCyrillic) {
        language = 'Russian';
      } else if (containsArabicScript) {
        language = 'Arabic';
      } else {
        // Fallback: check original text for basic language patterns
        const originalText = flashcard.originalText;
        const latinChars = originalText.replace(/\s+/g, '').split('').filter(char => /[a-zA-Z]/.test(char)).length;
        if (latinChars > 0 && latinChars / originalText.replace(/\s+/g, '').length >= 0.5) {
          language = 'English';
        }
      }
      
      setDetectedLanguage(language);
      setNeedsRomanization(readingsText.length > 0);
    }
  }, [flashcard]);

  // Function to save the edited flashcard
  const handleSave = () => {
    if (!flashcard) return;
    
    if (!originalText.trim()) {
      Alert.alert(t('common.error'), t('flashcard.edit.emptyOriginal'));
      return;
    }
    
    if (needsRomanization && !readingsText.trim()) {
      Alert.alert(t('common.warning'), t('flashcard.edit.emptyRomanization'), [
        { 
          text: t('common.cancel'), 
          style: 'cancel' 
        },
        {
          text: t('common.continue'),
          onPress: () => saveFlashcard()
        }
      ]);
      return;
    }
    
    if (!translatedText.trim()) {
      Alert.alert(t('common.warning'), t('flashcard.edit.emptyTranslation'), [
        { 
          text: t('common.cancel'), 
          style: 'cancel' 
        },
        {
          text: t('common.continue'),
          onPress: () => saveFlashcard()
        }
      ]);
      return;
    }
    
    saveFlashcard();
  };

  // Function to actually save the flashcard
  const saveFlashcard = () => {
    if (!flashcard) return;
    
    const updatedFlashcard: Flashcard = {
      ...flashcard,
      originalText,
      readingsText,
      translatedText,
      scopeAnalysis: scopeAnalysis || undefined
    };
    
    onSave(updatedFlashcard);
  };

  // Function to retranslate with Claude API
  const handleRetranslate = async () => {
    if (!originalText.trim()) {
      Alert.alert(t('common.error'), t('flashcard.edit.enterText'));
      return;
    }
    
    setIsRetranslating(true);
    setError('');
    
    try {
      // Get subscription plan from context to pass to API function
      const subscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
      const result = await processWithClaude(originalText, targetLanguage, forcedDetectionLanguage, undefined, false, subscriptionPlan);

      if (result.errorCode) {
        Alert.alert(
          t('flashcard.apiUnavailableTitle'),
          t('flashcard.apiUnavailableMessage'),
          [{ text: t('common.ok'), style: 'default' }]
        );
        setError(t('flashcard.edit.retranslateFailed'));
        return;
      }
      
      if (result.translatedText) {
        setTranslatedText(result.translatedText);
        
        if (needsRomanization) {
          setReadingsText(result.readingsText);

          if (!result.readingsText) {
            setError(t('flashcard.edit.romanizationFailed'));
          }
        }
      } else {
        setError(t('flashcard.edit.retranslateFailed'));
      }
    } catch (err) {
        logger.error('Error processing with Claude:', err);
        setError(t('flashcard.edit.retranslateFailed'));
      } finally {
      setIsRetranslating(false);
    }
  };

  // Function to rewordscope with Claude API (translation + grammar analysis)
  const handleRewordscope = async () => {
    if (!originalText.trim()) {
      Alert.alert(t('common.error'), t('flashcard.edit.enterText'));
      return;
    }

    setIsRewordscoping(true);
    setError('');

    try {
      const subscriptionPlan = await getCurrentSubscriptionPlan(subscription?.plan);
      const flashcardTarget = flashcard?.targetLanguage ?? targetLanguage;
      const result = await processWithClaudeAndScope(
        originalText,
        flashcardTarget,
        forcedDetectionLanguage,
        undefined,
        subscriptionPlan
      );

      if (result.errorCode) {
        Alert.alert(
          t('flashcard.apiUnavailableTitle'),
          t('flashcard.apiUnavailableMessage'),
          [{ text: t('common.ok'), style: 'default' }]
        );
        setError(t('flashcard.edit.rewordscopeFailed'));
        return;
      }

      if (result.translatedText) {
        setTranslatedText(result.translatedText);
        setScopeAnalysis(result.scopeAnalysis ?? '');
        if (needsRomanization && result.readingsText) {
          setReadingsText(result.readingsText);
        } else if (!result.readingsText && needsRomanization) {
          setError(t('flashcard.edit.romanizationFailed'));
        }
        Keyboard.dismiss();
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 150);
      } else {
        setError(t('flashcard.edit.rewordscopeFailed'));
      }
    } catch (err) {
      logger.error('Error processing with WordScope:', err);
      setError(t('flashcard.edit.rewordscopeFailed'));
    } finally {
      setIsRewordscoping(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalOverlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoidingView}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.modalTitle}>Edit Flashcard</Text>
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {/* Content - No TouchableWithoutFeedback/scrollWrapper so ScrollView handles all scroll gestures including on Wordscope area */}
            <ScrollView 
              ref={scrollViewRef}
              style={styles.scrollContent}
              contentContainerStyle={styles.scrollContentContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
                <Text style={styles.inputLabel}>Original Text:</Text>
                <TextInput
                  style={styles.textInput}
                  value={originalText}
                  onChangeText={setOriginalText}
                  multiline
                  placeholder="Enter original text"
                  placeholderTextColor={COLORS.darkGray}
                  textAlignVertical="top"
                />
                
                {needsRomanization && (
                  <>
                    <Text style={styles.inputLabel}>
                      {detectedLanguage === 'Japanese' ? 'Furigana Text:' : 
                      detectedLanguage === 'Chinese' ? 'Pinyin Text:' :
                      detectedLanguage === 'Korean' ? 'Romanized Text:' :
                      detectedLanguage === 'Russian' ? 'Romanized Text:' :
                      detectedLanguage === 'Arabic' ? 'Transliterated Text:' :
                      detectedLanguage === 'Italian' ? 'Transliterated Text:' :
                      detectedLanguage === 'Tagalog' ? 'Transliterated Text:' :
                      'Romanized Text:'}
                    </Text>
                    <TextInput
                      style={styles.textInput}
                      value={readingsText}
                      onChangeText={setReadingsText}
                      multiline
                      placeholder="Enter romanized text"
                      placeholderTextColor={COLORS.darkGray}
                      textAlignVertical="top"
                    />
                  </>
                )}
                
                <Text style={styles.inputLabel}>Translated Text: ({translatedLanguageName})</Text>
                <TextInput
                  style={styles.textInput}
                  value={translatedText}
                  onChangeText={setTranslatedText}
                  multiline
                  placeholder="Enter translation"
                  placeholderTextColor={COLORS.darkGray}
                  textAlignVertical="top"
                />
                
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                
                <TouchableOpacity
                  style={[styles.retranslateButton, isRetranslating && styles.disabledButton]}
                  onPress={handleRetranslate}
                  disabled={isRetranslating}
                >
                  <View style={[styles.flashcardButtonFill, { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]} />
                  <View style={styles.flashcardButtonTopHighlight} />
                  <View style={styles.modalButtonContent}>
                    {isRetranslating ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="language" size={12} color={COLORS.text} style={styles.buttonIcon} />
                        <Text style={styles.modalButtonText}>{t('flashcard.edit.retranslate')}</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.rewordscopeButton, isRewordscoping && styles.disabledButton]}
                  onPress={handleRewordscope}
                  disabled={isRewordscoping}
                >
                  <View style={[styles.flashcardButtonFill, { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]} />
                  <View style={styles.flashcardButtonTopHighlight} />
                  <View style={styles.modalButtonContent}>
                    {isRewordscoping ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <FontAwesome5 name="microscope" size={12} color={COLORS.text} style={styles.buttonIcon} />
                        <Text style={styles.modalButtonText}>{t('flashcard.edit.rewordscope')}</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>

                {scopeAnalysis ? (
                  <View style={styles.scopeAnalysisContainer} pointerEvents="none">
                    <Text style={styles.scopeAnalysisLabel}>Wordscope</Text>
                    <Text style={styles.scopeAnalysisText}>
                      {(() => {
                        const targetLang = flashcard?.targetLanguage ?? 'en';
                        const targetT = i18next.getFixedT(targetLang, 'translation');
                        const localizedScopeAnalysis = localizeScopeAnalysisHeadings(scopeAnalysis, {
                          grammar: targetT('flashcard.wordscope.grammar'),
                          examples: targetT('flashcard.wordscope.examples'),
                          commonMistake: targetT('flashcard.wordscope.commonMistake'),
                          commonContext: targetT('flashcard.wordscope.commonContext'),
                          alternativeExpressions: targetT('flashcard.wordscope.alternativeExpressions'),
                        });
                        const segments = parseScopeAnalysisForStyling(localizedScopeAnalysis);
                        return segments.map((seg, i) => (
                          <Text key={i} style={seg.isSourceLanguage ? styles.scopeAnalysisSourceText : undefined}>
                            {seg.text}
                          </Text>
                        ));
                      })()}
                    </Text>
                  </View>
                ) : null}
            </ScrollView>
            
            {/* Footer */}
              <View style={styles.footer}>
                <View style={styles.buttonContainer}>
                  <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                    <View style={[styles.flashcardButtonFill, { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]} />
                    <View style={styles.flashcardButtonTopHighlight} />
                    <View style={styles.modalButtonContent}>
                      <Text style={styles.modalButtonText}>Cancel</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                    <View style={[styles.flashcardButtonFill, { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]} />
                    <View style={styles.flashcardButtonTopHighlight} />
                    <View style={styles.modalButtonContent}>
                      <Text style={styles.modalButtonText}>Save</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.darkSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: screenHeight * 0.9, // Use 90% of screen height maximum
    minHeight: screenHeight * 0.6, // Minimum 60% of screen height
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.mediumSurface,
  },
  modalTitle: {
    fontFamily: FONTS.sansBold,
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.mediumSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontFamily: FONTS.sansBold,
    fontSize: 18,
    color: COLORS.text,
    fontWeight: 'bold',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContentContainer: {
    paddingVertical: 16,
    paddingBottom: 20,
  },
  inputLabel: {
    fontFamily: FONTS.sansSemiBold,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    color: COLORS.text,
  },
  textInput: {
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: COLORS.mediumSurface,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    maxHeight: 120, // Limit input height to prevent oversized inputs
    marginBottom: 16,
    backgroundColor: COLORS.mediumSurface,
    color: COLORS.text,
  },
  errorText: {
    fontFamily: FONTS.sansMedium,
    color: COLORS.danger,
    fontSize: 14,
    marginBottom: 12,
    fontWeight: '500',
  },
  retranslateButton: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  rewordscopeButton: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 0,
    marginBottom: 16,
  },
  buttonIcon: {
    marginBottom: 4,
  },
  disabledButton: {
    opacity: 0.6,
  },
  flashcardButtonFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
  },
  flashcardButtonTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    pointerEvents: 'none',
  },
  modalButtonContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modalButtonText: {
    color: COLORS.text,
    fontFamily: FONTS.sansBold,
    fontWeight: 'bold',
    fontSize: 14,
  },
  scopeAnalysisContainer: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.mediumSurface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scopeAnalysisLabel: {
    fontFamily: FONTS.sansBold,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  scopeAnalysisText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.text,
    flexWrap: 'wrap',
  },
  scopeAnalysisSourceText: {
    color: '#4ADE80',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.mediumSurface,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  saveButton: {
    flex: 1,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  cancelButton: {
    flex: 1,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
});

export default EditFlashcardModal; 