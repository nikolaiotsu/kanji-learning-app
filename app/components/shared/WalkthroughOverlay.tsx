import React, { useRef, useEffect } from 'react';
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
import { COLORS } from '../../constants/colors';
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
}: WalkthroughOverlayProps) {
  // Animated opacity for cross-fade transitions between steps
  const fadeAnim = useRef(new Animated.Value(1)).current;
  // Separate animated value to track if layout is ready (prevents flicker on initial render)
  const layoutReadyAnim = useRef(new Animated.Value(0)).current;
  const isFirstRender = useRef(true);
  const previousStepIdRef = useRef<string | null>(null);
  
  // #region agent log - Track visibility changes
  useEffect(() => {
    console.log('[DEBUG WalkthroughOverlay] VISIBILITY CHANGED:', { visible, stepId: currentStep?.id, stepTitle: currentStep?.title });
  }, [visible, currentStep?.id]);
  // #endregion

  // #region agent log - Track ALL render attempts for debugging flash issue
  console.log('[DEBUG WalkthroughOverlay] RENDER ATTEMPT:', { 
    visible, 
    stepId: currentStep?.id, 
    stepTitle: currentStep?.title, 
    currentStepIndex,
    willRender: visible && !!currentStep
  });
  // #endregion

  // Check if layout is ready for current step
  const targetLayout = currentStep?.targetLayout;
  const isReviewCardsStep = currentStep?.id === 'review-cards';
  const isCollectionsStep = currentStep?.id === 'collections';
  const canUseFallback = isReviewCardsStep || isCollectionsStep;
  const isLayoutReady = targetLayout || canUseFallback;

  // Handle layout ready state - fade in when layout becomes available
  useEffect(() => {
    if (!visible || !currentStep) {
      layoutReadyAnim.setValue(0);
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
  }, [visible, currentStep?.id, isLayoutReady, layoutReadyAnim]);

  // Trigger fade animation on step change (for cross-fade between steps)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Fade out, then fade in
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [currentStepIndex]);

  if (!visible || !currentStep) {
    return null;
  }

  // Debug log when overlay is about to render
  console.log('[DEBUG WalkthroughOverlay] WILL RENDER:', { visible, stepId: currentStep.id, stepTitle: currentStep.title, currentStepIndex });
  
  if (!targetLayout && !canUseFallback) {
    // Wait for layout measurement before showing overlay on steps where we expect a measured layout
    return null;
  }
  
  if (!targetLayout) {
    console.warn(`[WalkthroughOverlay] No layout for step ${currentStep.id}, using fallback positioning`);
  }

  // Combine both animations: layoutReadyAnim prevents flicker, fadeAnim handles step transitions
  const combinedOpacity = Animated.multiply(layoutReadyAnim, fadeAnim);

  // Calculate position for the tooltip box - position it above the button
  const TOOLTIP_PADDING = 16;
  const TOOLTIP_SPACING = 20; // Space between button and tooltip
  const TOOLTIP_WIDTH = Math.min(SCREEN_WIDTH - 32, 300);
  const TOOLTIP_HEIGHT = 160; // Approximate height

  // Use fallback layout if not measured yet (only for review-cards/collections)
  const layout = targetLayout || { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2, width: 100, height: 50 };

  // Center tooltip horizontally
  // For review-cards and collections, center on screen. For buttons, center over button
  const tooltipLeft = (isReviewCardsStep || isCollectionsStep)
    ? (SCREEN_WIDTH - TOOLTIP_WIDTH) / 2  // Center on screen
    : Math.max(
        TOOLTIP_PADDING,
        Math.min(
          layout.x + layout.width / 2 - TOOLTIP_WIDTH / 2,
          SCREEN_WIDTH - TOOLTIP_WIDTH - TOOLTIP_PADDING
        )
      );

  // For review cards and collections, center on screen (same position)
  // For buttons, position above or below
  let tooltipTop: number;
  if (isReviewCardsStep || isCollectionsStep) {
    // Use the same centered position for both review-cards and collections
    // Center vertically on screen
    tooltipTop = (SCREEN_HEIGHT - TOOLTIP_HEIGHT) / 2;
  } else {
    // Try to position above button first, but fall back to below if not enough space
    const spaceAbove = layout.y;
    const spaceBelow = SCREEN_HEIGHT - (layout.y + layout.height);
    const positionAbove = spaceAbove >= TOOLTIP_HEIGHT + TOOLTIP_SPACING || spaceAbove > spaceBelow;

    tooltipTop = positionAbove
      ? Math.max(TOOLTIP_PADDING, layout.y - TOOLTIP_HEIGHT - TOOLTIP_SPACING)
      : layout.y + layout.height + TOOLTIP_SPACING;
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
        {/* Dimmed overlay background - animated to fade in smoothly */}
        <Animated.View 
          style={[
            styles.dimmedBackground, 
            { opacity: combinedOpacity }
          ]} 
        >
          <Pressable 
            style={StyleSheet.absoluteFill} 
            onPress={() => {}} 
          />
        </Animated.View>

        {/* Tooltip box positioned above the button */}
        <Animated.View
          style={[
            styles.tooltipContainer,
            {
              left: tooltipLeft,
              top: tooltipTop,
              width: TOOLTIP_WIDTH,
              opacity: combinedOpacity,
            },
          ]}
        >
          {/* Skip button on the left */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onSkip}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>

          {/* Tooltip content */}
          <View style={styles.tooltipContent}>
            <Text style={styles.tooltipTitle}>{currentStep.title}</Text>
            <Text style={styles.tooltipDescription}>{currentStep.description}</Text>

            {/* Action buttons */}
            <View style={styles.actionButtons}>
              {/* Back button */}
              <TouchableOpacity
                style={[styles.backButton, isFirstStep && styles.backButtonDisabled]}
                onPress={onPrevious}
                disabled={isFirstStep}
              >
                <Ionicons name="chevron-back" size={16} color={isFirstStep ? COLORS.darkGray : COLORS.primary} />
                <Text style={[styles.backButtonText, isFirstStep && styles.backButtonTextDisabled]}>Back</Text>
              </TouchableOpacity>

              {/* Next/Done button */}
              {isEffectivelyLastStep ? (
                <TouchableOpacity style={styles.doneButton} onPress={onDone}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.nextButton} onPress={onNext}>
                  <Text style={styles.nextButtonText}>{customNextLabel || 'Next'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
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
  skipButton: {
    position: 'absolute',
    top: -35,
    left: 0,
    zIndex: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  tooltipContent: {
    flex: 1,
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  tooltipDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  backButtonTextDisabled: {
    color: COLORS.darkGray,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  nextButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
