import React from 'react';
import { View, StyleSheet, ViewStyle, PointerEvents } from 'react-native';

interface WalkthroughTargetProps {
  targetRef: React.RefObject<View>;
  stepId: string;
  currentStepId?: string | null;
  activeIds?: string[]; // optional additional step ids treated as active
  isWalkthroughActive: boolean;
  style?: ViewStyle | ViewStyle[];
  highlightStyle?: ViewStyle | ViewStyle[];
  dimStyle?: ViewStyle | ViewStyle[];
  pointerEventsWhenInactive?: 'auto' | 'none' | 'box-none' | 'box-only'; // default 'none' to block touches while walkthrough active on other steps
  children: React.ReactNode;
}

/**
 * WalkthroughTarget centralizes ref attachment, pointer-event gating, and highlight/dim styling
 * so new walkthrough steps only need to wrap their target once.
 */
export default function WalkthroughTarget({
  targetRef,
  stepId,
  currentStepId,
  activeIds,
  isWalkthroughActive,
  style,
  highlightStyle,
  dimStyle,
  pointerEventsWhenInactive = 'none',
  children,
}: WalkthroughTargetProps) {
  const isActiveStep = isWalkthroughActive && (currentStepId === stepId || (activeIds && activeIds.includes(currentStepId || '')));
  const isInactiveDuringWalkthrough = isWalkthroughActive && !isActiveStep;

  return (
    <View
      ref={targetRef}
      collapsable={false} // keep in native tree so measurements work during walkthrough
      pointerEvents={isInactiveDuringWalkthrough ? pointerEventsWhenInactive : 'auto'}
      style={StyleSheet.flatten([
        style,
        isActiveStep ? highlightStyle : undefined,
        isInactiveDuringWalkthrough ? dimStyle : undefined,
      ])}
    >
      {children}
    </View>
  );
}

