import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Animated,
  LayoutAnimation,
  LayoutChangeEvent,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
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
  const insets = useSafeAreaInsets();
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const [measuredTooltipHeight, setMeasuredTooltipHeight] = useState(0);
  const onTooltipLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      setMeasuredTooltipHeight(prev => {
        if (prev > 0 && Math.abs(prev - h) > 2) {
          LayoutAnimation.configureNext({
            duration: 150,
            update: { type: LayoutAnimation.Types.easeInEaseOut },
          });
        }
        return h;
      });
    }
  }, []);
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
      // Only reset layoutReadyAnim when waiting for measurement. If layout is already
      // available (e.g. pre-measured buttons), keep it at 1 to avoid double flash
      // (both layoutReadyAnim and fadeAnim going 0→1 caused full blackout then reappear).
      if (!isLayoutReady) {
        layoutReadyAnim.setValue(0);
      }
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
  // When layout is already ready (e.g. pre-measured translate/wordscope/edit buttons),
  // skip the fade to avoid flash: going 0→1 causes visible "disappear then reappear"
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isClosing) return; // Don't animate steps when closing

    if (isLayoutReady) {
      // Layout ready: keep at 1 to avoid flash; content updates in place
      fadeAnim.setValue(1);
    } else {
      // Waiting for measurement: fade out then in
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [currentStepIndex, isClosing, isLayoutReady]);

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

  const shouldShow = visible && shouldRender && !!currentStep && (!!targetLayout || canUseFallback);

  if (!shouldShow) {
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
  const TOOLTIP_WIDTH = Math.min(SCREEN_WIDTH - 32, 300);
  const TOOLTIP_HEIGHT_ESTIMATE = 240; // Conservative fallback; real value comes from onLayout
  const tooltipH = measuredTooltipHeight > 0 ? measuredTooltipHeight : TOOLTIP_HEIGHT_ESTIMATE;
  // Skip button sits 35px above the tooltip container; account for it as extra overhead
  const SKIP_OVERHEAD = 35;
  const safeTop = insets.top + TOOLTIP_PADDING + SKIP_OVERHEAD;
  const safeBottom = SCREEN_HEIGHT - insets.bottom - TOOLTIP_PADDING;

  // Center all tooltips on screen
  const tooltipLeft = (SCREEN_WIDTH - TOOLTIP_WIDTH) / 2;
  let tooltipTop: number;
  if (isChooseTranslationStep) {
    tooltipTop = SCREEN_HEIGHT * 0.4;
  } else {
    tooltipTop = (SCREEN_HEIGHT - tooltipH) / 2;
  }
  // Clamp to stay fully within safe bounds
  const maxTop = safeBottom - tooltipH;
  const clampedTooltipTop = Math.max(safeTop, Math.min(tooltipTop, maxTop));

  const isLastStep = currentStepIndex === totalSteps - 1;
  const isFirstStep = currentStepIndex === 0;
  const isEffectivelyLastStep = !treatAsNonFinal && isLastStep;

  return (
      <View style={[styles.container, { zIndex }]} pointerEvents="box-none">
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
            onLayout={onTooltipLayout}
            style={[
              styles.tooltipContainer,
              isCardInteractionStep && styles.tooltipContainerCardStep,
              {
                left: tooltipLeft,
                top: clampedTooltipTop,
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
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
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
