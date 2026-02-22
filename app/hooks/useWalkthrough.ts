import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const WALKTHROUGH_COMPLETED_KEY = '@walkthrough_completed';
const WALKTHROUGH_SKIPPED_KEY = '@walkthrough_skipped';
const WALKTHROUGH_STARTED_KEY = '@walkthrough_started';
const WALKTHROUGH_PHASE_KEY = '@walkthrough_phase';
const WALKTHROUGH_STEP_INDEX_KEY = '@walkthrough_step_index';
const SIGNIN_PROMPT_DISMISSED_KEY = '@signin_prompt_dismissed';

export type WalkthroughPhase = 'home' | 'flashcards';

export interface UseWalkthroughOptions {
  phase?: WalkthroughPhase;
}

// Global flag to track if walkthrough status has been checked in this app session
// This prevents re-checking every time the component remounts
let globalWalkthroughChecked = false;
let globalShouldShowWalkthrough = false;

export interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
  /** When set, renders bullet points instead of plain description */
  descriptionBullets?: string[];
  targetRef?: React.RefObject<any>;
  targetLayout?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface UseWalkthroughReturn {
  isActive: boolean;
  currentStep: WalkthroughStep | null;
  currentStepIndex: number;
  totalSteps: number;
  startWalkthrough: () => void;
  startWalkthroughAtStep: (stepIndex: number) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipWalkthrough: () => void;
  completeWalkthrough: () => void;
  shouldShowWalkthrough: boolean;
  registerStep: (step: WalkthroughStep) => void;
  updateStepLayout: (stepId: string, layout: { x: number; y: number; width: number; height: number }) => void;
  setCurrentStepIndex: (index: number) => void;
}

export function useWalkthrough(steps: WalkthroughStep[], options?: UseWalkthroughOptions): UseWalkthroughReturn {
  const phase = options?.phase;
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  // Initialize with cached value if available, otherwise false
  const [shouldShowWalkthrough, setShouldShowWalkthrough] = useState(
    globalWalkthroughChecked ? globalShouldShowWalkthrough : false
  );
  const [registeredSteps, setRegisteredSteps] = useState<Map<string, WalkthroughStep>>(new Map());
  const initializedRef = useRef(false);

  // Load completion status on mount; if walkthrough was in progress (app killed or backgrounded then killed), treat as skipped
  useEffect(() => {
    if (globalWalkthroughChecked) {
      initializedRef.current = true;
      return;
    }

    const checkWalkthroughStatus = async () => {
      try {
        const [completed, skipped, started, storedPhase, storedStepIndex] = await Promise.all([
          AsyncStorage.getItem(WALKTHROUGH_COMPLETED_KEY),
          AsyncStorage.getItem(WALKTHROUGH_SKIPPED_KEY),
          AsyncStorage.getItem(WALKTHROUGH_STARTED_KEY),
          AsyncStorage.getItem(WALKTHROUGH_PHASE_KEY),
          AsyncStorage.getItem(WALKTHROUGH_STEP_INDEX_KEY),
        ]);

        const inProgress = started === 'true' && !completed && !skipped;

        // App was backgrounded then killed, or force-killed during walkthrough: do not restore; treat as skipped so user is not stuck
        if (inProgress) {
          logger.log('Walkthrough was in progress when app closed; treating as skipped (no persist across kill)');
          await AsyncStorage.setItem(WALKTHROUGH_SKIPPED_KEY, 'true');
          await AsyncStorage.removeItem(WALKTHROUGH_STARTED_KEY);
          await AsyncStorage.removeItem(WALKTHROUGH_PHASE_KEY);
          await AsyncStorage.removeItem(WALKTHROUGH_STEP_INDEX_KEY);
        }
        const skippedNow = inProgress ? true : skipped;

        if (!globalWalkthroughChecked) {
          // If user hasn't completed or skipped, show walkthrough on first launch
          const shouldShow = !completed && !skippedNow;
          globalWalkthroughChecked = true;
          globalShouldShowWalkthrough = shouldShow;
          setShouldShowWalkthrough(shouldShow);
        }
        initializedRef.current = true;
      } catch (error) {
        logger.error('Error checking walkthrough status:', error);
        globalWalkthroughChecked = true;
        globalShouldShowWalkthrough = false;
        initializedRef.current = true;
      }
    };

    checkWalkthroughStatus();
  }, []);

  // Register a step with its ref
  const registerStep = useCallback((step: WalkthroughStep) => {
    setRegisteredSteps(prev => {
      const newMap = new Map(prev);
      newMap.set(step.id, step);
      return newMap;
    });
  }, []);

  // Update step layout
  const updateStepLayout = useCallback((stepId: string, layout: { x: number; y: number; width: number; height: number }) => {
    setRegisteredSteps(prev => {
      const newMap = new Map(prev);
      const step = newMap.get(stepId);
      if (step) {
        newMap.set(stepId, { ...step, targetLayout: layout });
      }
      return newMap;
    });
  }, []);

  // Current step: always use latest step def for title/description (so e.g. language name updates),
  // and merge in targetRef/targetLayout from registered step when present
  const stepDef = steps[currentStepIndex];
  const registered = stepDef ? registeredSteps.get(stepDef.id) : undefined;
  const currentStep = stepDef
    ? {
        ...stepDef,
        title: stepDef.title,
        description: stepDef.description,
        ...(registered && {
          targetRef: registered.targetRef ?? stepDef.targetRef,
          targetLayout: registered.targetLayout ?? stepDef.targetLayout,
        }),
      }
    : null;

  // Start the walkthrough from step 0
  const startWalkthrough = useCallback(async () => {
    setIsActive(true);
    setCurrentStepIndex(0);
    setShouldShowWalkthrough(false);
    try {
      await AsyncStorage.setItem(WALKTHROUGH_STARTED_KEY, 'true');
    } catch (error) {
      logger.error('Error persisting walkthrough started:', error);
    }
  }, []);

  // Start the walkthrough at a specific step (for cross-screen continuation, e.g. from flashcards to home)
  const startWalkthroughAtStep = useCallback((stepIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
    setIsActive(true);
    setCurrentStepIndex(clampedIndex);
    setShouldShowWalkthrough(false);
  }, [steps.length]);

  // Set current step index directly (e.g. when user completes an action-based step)
  const setCurrentStepIndexFn = useCallback((index: number) => {
    setCurrentStepIndex(Math.max(0, Math.min(index, steps.length - 1)));
  }, [steps.length]);

  // Complete walkthrough
  const completeWalkthrough = useCallback(async () => {
    // IMPORTANT: Set state FIRST before async operations to prevent timing issues
    // This ensures the overlay is hidden immediately before any navigation happens
    setIsActive(false);
    setShouldShowWalkthrough(false);
    
    // Update global flags to prevent walkthrough from showing again
    globalShouldShowWalkthrough = false;
    
    logger.log('Walkthrough completed');
    
    // Persist to storage (non-blocking)
    try {
      await AsyncStorage.setItem(WALKTHROUGH_COMPLETED_KEY, 'true');
      await AsyncStorage.removeItem(WALKTHROUGH_STARTED_KEY);
      await AsyncStorage.removeItem(WALKTHROUGH_PHASE_KEY);
      await AsyncStorage.removeItem(WALKTHROUGH_STEP_INDEX_KEY);
    } catch (error) {
      logger.error('Error persisting walkthrough completion:', error);
    }
  }, []);

  // Move to next step
  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      completeWalkthrough();
    }
  }, [currentStepIndex, steps.length, completeWalkthrough]);

  // Move to previous step
  const previousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  // Skip walkthrough
  const skipWalkthrough = useCallback(async () => {
    // IMPORTANT: Set state FIRST before async operations to prevent timing issues
    // This ensures the overlay is hidden immediately before any navigation happens
    setIsActive(false);
    setShouldShowWalkthrough(false);

    // Update global flags to prevent walkthrough from showing again
    globalShouldShowWalkthrough = false;

    logger.log('Walkthrough skipped');
    
    // Persist to storage (non-blocking)
    try {
      await AsyncStorage.setItem(WALKTHROUGH_SKIPPED_KEY, 'true');
      await AsyncStorage.removeItem(WALKTHROUGH_STARTED_KEY);
      await AsyncStorage.removeItem(WALKTHROUGH_PHASE_KEY);
      await AsyncStorage.removeItem(WALKTHROUGH_STEP_INDEX_KEY);
    } catch (error) {
      logger.error('Error persisting walkthrough skip:', error);
    }
  }, []);

  // When app goes to background while walkthrough is active: persist phase + step so we can restore (do not cancel)
  const isActiveRef = useRef(isActive);
  const currentStepIndexRef = useRef(currentStepIndex);
  isActiveRef.current = isActive;
  currentStepIndexRef.current = currentStepIndex;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' && isActiveRef.current && phase) {
        const stepIndex = currentStepIndexRef.current;
        logger.log('App backgrounded during walkthrough; persisting for restore', { phase, stepIndex });
        AsyncStorage.setItem(WALKTHROUGH_PHASE_KEY, phase).catch((err) =>
          logger.error('Error persisting walkthrough phase on background:', err)
        );
        AsyncStorage.setItem(WALKTHROUGH_STEP_INDEX_KEY, String(stepIndex)).catch((err) =>
          logger.error('Error persisting walkthrough step index on background:', err)
        );
      }
    });
    return () => subscription.remove();
  }, [phase]);

  return {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps: steps.length,
    startWalkthrough,
    startWalkthroughAtStep,
    nextStep,
    previousStep,
    skipWalkthrough,
    completeWalkthrough,
    shouldShowWalkthrough,
    registerStep,
    updateStepLayout,
    setCurrentStepIndex: setCurrentStepIndexFn,
  };
}

/** Returns current persisted walkthrough state (for redirect when app reopens on wrong screen). */
export async function getWalkthroughRestoreState(): Promise<{
  inProgress: boolean;
  phase: WalkthroughPhase | null;
  stepIndex: number;
}> {
  try {
    const [completed, skipped, started, phase, stepIndexStr] = await Promise.all([
      AsyncStorage.getItem(WALKTHROUGH_COMPLETED_KEY),
      AsyncStorage.getItem(WALKTHROUGH_SKIPPED_KEY),
      AsyncStorage.getItem(WALKTHROUGH_STARTED_KEY),
      AsyncStorage.getItem(WALKTHROUGH_PHASE_KEY),
      AsyncStorage.getItem(WALKTHROUGH_STEP_INDEX_KEY),
    ]);
    const inProgress = started === 'true' && !completed && !skipped;
    const phaseVal = (phase === 'home' || phase === 'flashcards' ? phase : null) as WalkthroughPhase | null;
    const stepIndex = stepIndexStr != null ? Math.max(0, parseInt(stepIndexStr, 10)) : 0;
    return { inProgress, phase: phaseVal, stepIndex };
  } catch {
    return { inProgress: false, phase: null, stepIndex: 0 };
  }
}

// Helper function to reset walkthrough (for settings)
export async function resetWalkthrough(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(WALKTHROUGH_COMPLETED_KEY),
      AsyncStorage.removeItem(WALKTHROUGH_SKIPPED_KEY),
      AsyncStorage.removeItem(WALKTHROUGH_STARTED_KEY),
      AsyncStorage.removeItem(WALKTHROUGH_PHASE_KEY),
      AsyncStorage.removeItem(WALKTHROUGH_STEP_INDEX_KEY),
      // Also reset sign-in prompt dismissed state so it shows after walkthrough completes
      AsyncStorage.removeItem(SIGNIN_PROMPT_DISMISSED_KEY),
    ]);
    
    // Reset global flags so walkthrough will show on next mount
    globalWalkthroughChecked = false;
    globalShouldShowWalkthrough = false;
    
    logger.log('Walkthrough reset (including sign-in prompt dismissed state)');
  } catch (error) {
    logger.error('Error resetting walkthrough:', error);
  }
}

