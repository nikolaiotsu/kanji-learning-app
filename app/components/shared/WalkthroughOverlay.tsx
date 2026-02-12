import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { FONTS } from '../../constants/typography';
import { Ionicons } from '@expo/vector-icons';

interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
  targetRef?: React.RefObject<View>;
  targetLayout?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface WalkthroughOverlayProps {
  visible: boolean;
  currentStep: WalkthroughStep | null;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onDone: () => void;
  customNextLabel?: string;
  treatAsNonFinal?: boolean;
  zIndex?: number; // Optional z-index for overlay priority (higher = on top)
  /** When true, hide Next/Done button so user must complete the action to advance (e.g. flip card twice) */
  hideNextButton?: boolean;
  /** When true, dimmed background does not capture touches so user can tap through to the card */
  allowTouchThrough?: boolean;
  /** Called when the overlay has finished its close animation and unmounted. Use to coordinate showing the next modal (e.g. sign-in prompt). */
  onClosed?: () => void;
  /** When true, only show dimmed background and skip button (no tooltip/modal content). Used e.g. after "Your first card" Continue so user can tap gallery/photo. */
  hideTooltip?: boolean;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function WalkthroughOverlay({
  visible,
  currentStep,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrevious,
  onSkip,
  onDone,
  customNextLabel,
  treatAsNonFinal,
  zIndex = 1000, // Default z-index, can be overridden
  hideNextButton = false,
  allowTouchThrough = false,
  onClosed,
  hideTooltip = false,
}: WalkthroughOverlayProps) {
  const { t } = useTranslation();
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  // Animated opacity for cross-fade transitions between steps
  const fadeAnim = useRef(new Animated.Value(1)).current;
  // Separate animated value to track if layout is ready (prevents flicker on initial render)
  const layoutReadyAnim = useRef(new Animated.Value(0)).current;
  // Float animation for congratulations step (gentle up-down)
  const floatAnim = useRef(new Animated.Value(0)).current;
  // Track if we're currently closing (for fade-out animation)
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const isFirstRender = useRef(true);
  const previousStepIdRef = useRef<string | null>(null);
  const previousVisibleRef = useRef(visible);

  // Handle visibility changes with fade-out animation
  useEffect(() => {
    if (visible && !previousVisibleRef.current) {
      // Opening - show immediately and let layoutReadyAnim handle fade-in
      setShouldRender(true);
      setIsClosing(false);
    } else if (!visible && previousVisibleRef.current && shouldRender) {
      // Closing - fade out first, then hide and notify parent
      setIsClosing(true);
      Animated.timing(layoutReadyAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false);
        setIsClosing(false);
        onClosedRef.current?.();
      });
    }
    previousVisibleRef.current = visible;
  }, [visible]);

  // Initial sync of shouldRender with visible
  useEffect(() => {
    if (visible) {
      setShouldRender(true);
    }
  }, []);

  // Check if layout is ready for current step
  const targetLayout = currentStep?.targetLayout;
  const isCollectionsStep = currentStep?.id === 'collections';
  const isReviewButtonStep = currentStep?.id === 'review-button';
  const isChooseTranslationStep = currentStep?.id === 'choose-translation';
  const isCongratulationsStep = currentStep?.id === 'congratulations';
  const isGoHomePromptStep = currentStep?.id === 'go-home-prompt';
  const isFinalCongratulationsStep = currentStep?.id === 'final-congratulations';
  const isSwipeLeftInstructionStep = currentStep?.id === 'swipe-left-instruction';
  const isSwipeRightInstructionStep = currentStep?.id === 'swipe-right-instruction';
  const isFinalSavePromptStep = currentStep?.id === 'final-save-prompt';
  const isFindTextStep = currentStep?.id === 'find-text';
  // Card interaction steps: stronger shadow so tooltip doesn't blend with the card
  const cardInteractionStepIds = ['flip-card', 'image-button', 'swipe-left-instruction', 'swipe-right-instruction'];
  const isCardInteractionStep = currentStep?.id ? cardInteractionStepIds.includes(currentStep.id) : false;
  // Note: final-save-prompt is NOT in canUseFallback - it requires actual button measurement
  const isFlipCardStep = currentStep?.id === 'flip-card';
  const centeredModalSteps = isCongratulationsStep || isGoHomePromptStep || isFinalCongratulationsStep || isSwipeLeftInstructionStep || isSwipeRightInstructionStep || isFlipCardStep || isFindTextStep;
  const canUseFallback = isCollectionsStep || isReviewButtonStep || isChooseTranslationStep || centeredModalSteps;
  const isLayoutReady = targetLayout || canUseFallback;

  // Handle layout ready state - fade in when layout becomes available
  useEffect(() => {
    if (!visible || !currentStep || isClosing) {
      if (!isClosing) {
        layoutReadyAnim.setValue(0);
      }
      previousStepIdRef.current = null;
      return;
    }

    // Check if step changed
    const stepChanged = previousStepIdRef.current !== currentStep.id;
    if (stepChanged) {
      previousStepIdRef.current = currentStep.id;
      // Reset opacity when step changes
      layoutReadyAnim.setValue(0);
    }

    if (isLayoutReady) {
      // Layout is ready, fade in smoothly
      Animated.timing(layoutReadyAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    // If layout not ready, keep invisible (already set to 0 above if step changed)
  }, [visible, currentStep?.id, isLayoutReady, layoutReadyAnim, isClosing]);

  // Trigger fade animation on step change (for cross-fade between steps)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isClosing) return; // Don't animate steps when closing

    // Fade out, then fade in
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [currentStepIndex, isClosing]);

  // Float animation for congratulations, go-home-prompt, final-congratulations, and swipe instruction steps
  useEffect(() => {
    const floatSteps = ['congratulations', 'go-home-prompt', 'final-congratulations', 'swipe-left-instruction', 'swipe-right-instruction'];
    if (!currentStep || !floatSteps.includes(currentStep.id) || !visible) {
      floatAnim.setValue(0);
      return;
    }
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.start();
    return () => floatLoop.stop();
  }, [currentStep?.id, visible, floatAnim]);

  // Don't render if not visible and not in the process of closing
  if (!shouldRender || !currentStep) {
    return null;
  }

  if (!targetLayout && !canUseFallback) {
    // Wait for layout measurement before showing overlay on steps where we expect a measured layout
    return null;
  }
  
  if (!targetLayout) {
    console.warn(`[WalkthroughOverlay] No layout for step ${currentStep.id}, using fallback positioning`);
  }

  // Combine both animations: layoutReadyAnim prevents flicker, fadeAnim handles step transitions
  const combinedOpacity = Animated.multiply(layoutReadyAnim, fadeAnim);
  // Float: gentle vertical oscillation for congratulations step only
  const floatTranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  // Calculate position for the tooltip box - position it above the button
  const TOOLTIP_PADDING = 16;
  const TOOLTIP_SPACING = 20; // Space between button and tooltip
  const TOOLTIP_WIDTH = Math.min(SCREEN_WIDTH - 32, 300);
  const TOOLTIP_HEIGHT = 160; // Approximate height

  // Use fallback layout if not measured yet (only for collections/choose-translation)
  const layout = targetLayout || { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2, width: 100, height: 50 };

  // Center tooltip horizontally
  // collections, review-button, choose-translation, congratulations, go-home-prompt, final-congratulations, find-text ALWAYS center
  // All other steps (including final-save-prompt) position over the measured button
  const alwaysCenterSteps = isCollectionsStep || isReviewButtonStep || isChooseTranslationStep || centeredModalSteps;
  
  const tooltipLeft = alwaysCenterSteps
    ? (SCREEN_WIDTH - TOOLTIP_WIDTH) / 2  // Always center for collections, etc.
    : targetLayout
      ? Math.max(
          TOOLTIP_PADDING,
          Math.min(
            layout.x + layout.width / 2 - TOOLTIP_WIDTH / 2,
            SCREEN_WIDTH - TOOLTIP_WIDTH - TOOLTIP_PADDING
          )
        )
      : (SCREEN_WIDTH - TOOLTIP_WIDTH) / 2; // Fallback center if no layout

  // For collections, choose-translation, congratulations, go-home-prompt, final-congratulations: ALWAYS center
  // For all other buttons (including final-save-prompt): position above or below the measured button
  let tooltipTop: number;
  if (alwaysCenterSteps) {
    // Always use centered position for collections, choose-translation, modal steps
    if (isChooseTranslationStep) {
      // Position tooltip in the middle-lower portion of screen, above where buttons typically are
      tooltipTop = SCREEN_HEIGHT * 0.4; // About 40% down from top
    } else if (centeredModalSteps) {
      // Center congratulations, go-home-prompt, final-congratulations message on screen
      tooltipTop = (SCREEN_HEIGHT - TOOLTIP_HEIGHT) / 2;
    } else {
      // Center vertically on screen for collections
      tooltipTop = (SCREEN_HEIGHT - TOOLTIP_HEIGHT) / 2;
    }
  } else if (targetLayout) {
    // Try to position above button first, but fall back to below if not enough space
    const spaceAbove = layout.y;
    const spaceBelow = SCREEN_HEIGHT - (layout.y + layout.height);
    const positionAbove = spaceAbove >= TOOLTIP_HEIGHT + TOOLTIP_SPACING || spaceAbove > spaceBelow;

    tooltipTop = positionAbove
      ? Math.max(TOOLTIP_PADDING, layout.y - TOOLTIP_HEIGHT - TOOLTIP_SPACING)
      : layout.y + layout.height + TOOLTIP_SPACING;
  } else {
    // Fallback: center vertically (shouldn't reach here due to earlier checks, but TypeScript needs this)
    tooltipTop = (SCREEN_HEIGHT - TOOLTIP_HEIGHT) / 2;
  }

  const isLastStep = currentStepIndex === totalSteps - 1;
  const isFirstStep = currentStepIndex === 0;
  const isEffectivelyLastStep = !treatAsNonFinal && isLastStep;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      statusBarTranslucent={true}
    >
      <View style={[styles.container, { zIndex }]}>
        {/* Dimmed overlay background - when allowTouchThrough, do not render block so parent can hide overlay instead */}
        <Animated.View 
          style={[
            styles.dimmedBackground, 
            { opacity: combinedOpacity }
          ]} 
          pointerEvents={allowTouchThrough ? 'none' : 'auto'}
        >
          <Pressable 
            style={StyleSheet.absoluteFill} 
            onPress={() => {}} 
            pointerEvents={allowTouchThrough ? 'none' : 'auto'}
          />
        </Animated.View>

        {/* When hideTooltip, only show Skip in top-right; otherwise show full tooltip */}
        {hideTooltip ? (
          <Animated.View style={[styles.skipButtonStandaloneWrap, { opacity: combinedOpacity }]}>
            <TouchableOpacity
              style={styles.skipButtonStandalone}
              onPress={onSkip}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.skipButtonText}>{t('common.skip')}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View
            style={[
              styles.tooltipContainer,
              isCardInteractionStep && styles.tooltipContainerCardStep,
              {
                left: tooltipLeft,
                top: tooltipTop,
                width: TOOLTIP_WIDTH,
                opacity: combinedOpacity,
                transform: centeredModalSteps ? [{ translateY: floatTranslateY }] : [],
              },
            ]}
          >
            {/* Skip button on the left */}
            <TouchableOpacity
              style={styles.skipButton}
              onPress={onSkip}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.skipButtonText}>{t('common.skip')}</Text>
            </TouchableOpacity>

            {/* Tooltip content */}
            <View style={styles.tooltipContent}>
              <Text style={styles.tooltipTitle}>{currentStep.title}</Text>
              <Text style={styles.tooltipDescription}>{currentStep.description}</Text>

              {/* Action buttons - hidden when hideNextButton (user must complete action to advance) */}
              {!hideNextButton && (
                <View style={styles.actionButtons}>
                  {/* Back button - hidden on congratulations, go-home-prompt, and final-congratulations steps */}
                  {!centeredModalSteps && (
                    <TouchableOpacity
                      style={[styles.backButton, isFirstStep && styles.backButtonDisabled]}
                      onPress={onPrevious}
                      disabled={isFirstStep}
                    >
                      <Ionicons name="chevron-back" size={16} color={isFirstStep ? COLORS.darkGray : COLORS.primary} />
                      <Text style={[styles.backButtonText, isFirstStep && styles.backButtonTextDisabled]}>{t('common.back')}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Next/Done button */}
                  {isEffectivelyLastStep ? (
                    <TouchableOpacity style={styles.doneButton} onPress={onDone}>
                      <View style={styles.ctaButtonContent}>
                        <Text style={styles.doneButtonText} numberOfLines={1} adjustsFontSizeToFit>
                          {customNextLabel || t('common.done')}
                        </Text>
                        <Ionicons name="chevron-forward" size={22} color="#000" style={styles.ctaButtonArrow} />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.nextButton} onPress={onNext}>
                      <View style={styles.ctaButtonContent}>
                        <Text style={styles.nextButtonText} numberOfLines={1} adjustsFontSizeToFit>
                          {customNextLabel || t('common.continue')}
                        </Text>
                        <Ionicons name="chevron-forward" size={22} color="#000" style={styles.ctaButtonArrow} />
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dimmedBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  tooltipContainer: {
    position: 'absolute',
    backgroundColor: COLORS.darkSurface,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  // Stronger shadow + border so flip/image/swipe modals stand out from the card
  tooltipContainerCardStep: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  skipButton: {
    position: 'absolute',
    top: -35,
    left: 0,
    zIndex: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipButtonStandaloneWrap: {
    position: 'absolute',
    top: 56,
    right: 16,
    zIndex: 10,
  },
  skipButtonStandalone: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipButtonText: {
    fontFamily: FONTS.sansMedium,
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  tooltipContent: {
    flex: 1,
  },
  tooltipTitle: {
    fontFamily: FONTS.sansBold,
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  tooltipDescription: {
    fontFamily: FONTS.sans,
    fontSize: 20,
    color: COLORS.textSecondary,
    lineHeight: 30,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 65,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 4,
  },
  backButtonDisabled: {
    opacity: 0.5,
    borderColor: COLORS.darkGray,
  },
  backButtonText: {
    fontFamily: FONTS.sansSemiBold,
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: '600',
  },
  backButtonTextDisabled: {
    color: COLORS.darkGray,
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    height: 65,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minWidth: 0,
  },
  ctaButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '100%',
  },
  ctaButtonArrow: {
    marginLeft: 8,
  },
  nextButtonText: {
    fontFamily: FONTS.sansSemiBold,
    color: '#000',
    fontSize: 20,
    fontWeight: '600',
    flexShrink: 1,
  },
  doneButton: {
    backgroundColor: COLORS.primary,
    height: 65,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minWidth: 0,
  },
  doneButtonText: {
    fontFamily: FONTS.sansSemiBold,
    color: '#000',
    fontSize: 20,
    fontWeight: '600',
    flexShrink: 1,
  },
});
