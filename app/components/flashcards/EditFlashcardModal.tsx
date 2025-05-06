import React, { useState, useEffect } from 'react';
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
  Keyboard
} from 'react-native';
import { Flashcard } from '../../types/Flashcard';
import { updateFlashcard } from '../../services/supabaseStorage';
import { processWithClaude } from '../../services/claudeApi';
import { 
  containsJapanese, 
  containsChinese, 
  containsKoreanText, 
  containsRussianText, 
  containsArabicText,
  containsItalianText,
  containsTagalogText
} from '../../utils/textFormatting';
import { useSettings, AVAILABLE_LANGUAGES } from '../../context/SettingsContext';
import { COLORS } from '../../constants/colors';

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
  const { targetLanguage, forcedDetectionLanguage } = useSettings();
  const [originalText, setOriginalText] = useState('');
  const [furiganaText, setFuriganaText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [needsRomanization, setNeedsRomanization] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [error, setError] = useState('');

  // Get translated language name for display
  const translatedLanguageName = AVAILABLE_LANGUAGES[targetLanguage as keyof typeof AVAILABLE_LANGUAGES] || 'English';

  // Initialize form when flashcard changes
  useEffect(() => {
    if (flashcard) {
      setOriginalText(flashcard.originalText);
      setFuriganaText(flashcard.furiganaText);
      setTranslatedText(flashcard.translatedText);
      
      // Detect language and determine if romanization is needed
      const text = flashcard.originalText;
      const hasJapanese = containsJapanese(text);
      const hasChinese = containsChinese(text);
      const hasKorean = containsKoreanText(text);
      const hasRussian = containsRussianText(text);
      const hasArabic = containsArabicText(text);
      const hasItalian = containsItalianText(text);
      const hasTagalog = containsTagalogText(text);
      
      // Determine language
      let language = 'unknown';
      if (hasJapanese && !hasChinese && !hasKorean) language = 'Japanese';
      else if (hasChinese) language = 'Chinese';
      else if (hasKorean) language = 'Korean';
      else if (hasRussian) language = 'Russian';
      else if (hasArabic) language = 'Arabic';
      else if (hasItalian) language = 'Italian';
      else if (hasTagalog) language = 'Tagalog';
      else {
        // Check if the text is primarily Latin characters (likely English or other European languages)
        const latinChars = text.replace(/\s+/g, '').split('').filter(char => /[a-zA-Z]/.test(char)).length;
        if (latinChars > 0 && latinChars / text.replace(/\s+/g, '').length >= 0.5) {
          language = 'English';
        }
      }
      setDetectedLanguage(language);

      // All these languages need romanization
      const needsRom = hasJapanese || hasChinese || hasKorean || hasRussian || hasArabic;
      setNeedsRomanization(needsRom);
    }
  }, [flashcard]);

  // Function to save the edited flashcard
  const handleSave = () => {
    if (!flashcard) return;
    
    if (!originalText.trim()) {
      Alert.alert('Error', 'Original text cannot be empty.');
      return;
    }
    
    if (needsRomanization && !furiganaText.trim()) {
      Alert.alert('Warning', 'Romanization/Furigana text is empty. Would you like to continue?', [
        { 
          text: 'Cancel', 
          style: 'cancel' 
        },
        {
          text: 'Continue',
          onPress: () => saveFlashcard()
        }
      ]);
      return;
    }
    
    if (!translatedText.trim()) {
      Alert.alert('Warning', 'Translation is empty. Would you like to continue?', [
        { 
          text: 'Cancel', 
          style: 'cancel' 
        },
        {
          text: 'Continue',
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
      furiganaText,
      translatedText
    };
    
    onSave(updatedFlashcard);
  };

  // Function to retranslate with Claude API
  const handleRetranslate = async () => {
    if (!originalText.trim()) {
      Alert.alert('Error', 'Please enter text to translate.');
      return;
    }
    
    setIsRetranslating(true);
    setError('');
    
    try {
      const result = await processWithClaude(originalText, targetLanguage, forcedDetectionLanguage);
      
      if (result.translatedText) {
        setTranslatedText(result.translatedText);
        
        if (needsRomanization) {
          setFuriganaText(result.furiganaText);
          
          if (!result.furiganaText) {
            setError('Failed to get proper romanization for this text. The translation is still available.');
          }
        }
      } else {
        setError('Failed to process text with Claude API. Please try again later.');
      }
    } catch (err) {
      console.error('Error processing with Claude:', err);
      setError('Failed to process text with Claude API. Please try again later.');
    } finally {
      setIsRetranslating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Flashcard</Text>
            
            <ScrollView style={styles.scrollContent}>
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
                    value={furiganaText}
                    onChangeText={setFuriganaText}
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
                {isRetranslating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Retranslate</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: COLORS.text,
  },
  scrollContent: {
    maxHeight: '80%',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 5,
    color: COLORS.text,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.mediumSurface,
    borderRadius: 5,
    padding: 10,
    fontSize: 16,
    minHeight: 80,
    marginBottom: 15,
    backgroundColor: COLORS.mediumSurface,
    color: COLORS.text,
  },
  errorText: {
    color: COLORS.danger,
    marginBottom: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
  },
  retranslateButton: {
    backgroundColor: '#2CB67D',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 15,
  },
  disabledButton: {
    opacity: 0.7,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: COLORS.mediumSurface,
    backgroundColor: COLORS.mediumSurface,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default EditFlashcardModal; 