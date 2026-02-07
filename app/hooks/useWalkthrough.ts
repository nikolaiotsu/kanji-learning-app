import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const WALKTHROUGH_COMPLETED_KEY = '@walkthrough_completed';
const WALKTHROUGH_SKIPPED_KEY = '@walkthrough_skipped';
const WALKTHROUGH_STARTED_KEY = '@walkthrough_started';

// Global flag to track if walkthrough status has been checked in this app session
// This prevents re-checking every time the component remounts
let globalWalkthroughChecked = false;
let globalShouldShowWalkthrough = false;

export interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
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
  nextStep: () => void;
  previousStep: () => void;
  skipWalkthrough: () => void;
  completeWalkthrough: () => void;
  shouldShowWalkthrough: boolean;
  registerStep: (step: WalkthroughStep) => void;
  updateStepLayout: (stepId: string, layout: { x: number; y: number; width: number; height: number }) => void;
}

export function useWalkthrough(steps: WalkthroughStep[]): UseWalkthroughReturn {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  // Initialize with cached value if available, otherwise false
  const [shouldShowWalkthrough, setShouldShowWalkthrough] = useState(
    globalWalkthroughChecked ? globalShouldShowWalkthrough : false
  );
  const [registeredSteps, setRegisteredSteps] = useState<Map<string, WalkthroughStep>>(new Map());
  const initializedRef = useRef(false);

  // Load completion status on mount
  useEffect(() => {
    // If we've already checked in this app session, no need to do anything
    // (state is already initialized with the cached value)
    if (globalWalkthroughChecked) {
      initializedRef.current = true;
      return;
    }

    const checkWalkthroughStatus = async () => {
      try {
        const [completed, skipped, started] = await Promise.all([
          AsyncStorage.getItem(WALKTHROUGH_COMPLETED_KEY),
          AsyncStorage.getItem(WALKTHROUGH_SKIPPED_KEY),
          AsyncStorage.getItem(WALKTHROUGH_STARTED_KEY),
        ]);

        // If walkthrough was started in a previous session but user closed/restarted without completing or skipping,
        // treat it as implicitly skipped (don't show again)
        if (started && !completed && !skipped) {
          logger.log('Walkthrough was in progress when app closed; treating as skipped');
          await AsyncStorage.setItem(WALKTHROUGH_SKIPPED_KEY, 'true');
          await AsyncStorage.removeItem(WALKTHROUGH_STARTED_KEY);
        }

        // If user hasn't completed or skipped, show walkthrough on first launch
        const shouldShow = !completed && !skipped;
        
        // Cache the result globally for this app session
        globalWalkthroughChecked = true;
        globalShouldShowWalkthrough = shouldShow;
        
        setShouldShowWalkthrough(shouldShow);
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

  // Get current step from registered steps, fallback to step definition if not registered yet
  const stepDef = steps[currentStepIndex];
  const currentStep = stepDef 
    ? (registeredSteps.get(stepDef.id) || { ...stepDef })
    : null;

  // Start the walkthrough
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
    } catch (error) {
      logger.error('Error persisting walkthrough skip:', error);
    }
  }, []);

  // When app goes to background or is closed while walkthrough is active, persist skip
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' && isActiveRef.current) {
        logger.log('App backgrounded during walkthrough; treating as skipped');
        isActiveRef.current = false;
        setIsActive(false);
        setShouldShowWalkthrough(false);
        globalShouldShowWalkthrough = false;
        AsyncStorage.setItem(WALKTHROUGH_SKIPPED_KEY, 'true').catch((err) =>
          logger.error('Error persisting walkthrough skip on background:', err)
        );
        AsyncStorage.removeItem(WALKTHROUGH_STARTED_KEY).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, []);

  return {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps: steps.length,
    startWalkthrough,
    nextStep,
    previousStep,
    skipWalkthrough,
    completeWalkthrough,
    shouldShowWalkthrough,
    registerStep,
    updateStepLayout,
  };
}

// Helper function to reset walkthrough (for settings)
export async function resetWalkthrough(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(WALKTHROUGH_COMPLETED_KEY),
      AsyncStorage.removeItem(WALKTHROUGH_SKIPPED_KEY),
      AsyncStorage.removeItem(WALKTHROUGH_STARTED_KEY),
    ]);
    
    // Reset global flags so walkthrough will show on next mount
    globalWalkthroughChecked = false;
    globalShouldShowWalkthrough = false;
    
    logger.log('Walkthrough reset');
  } catch (error) {
    logger.error('Error resetting walkthrough:', error);
  }
}

