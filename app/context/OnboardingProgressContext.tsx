import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const TOTAL_STEPS = 34;
// Onboarding: 0-5 (6 steps)
// Home walkthrough: 6-18 (13 steps)
// Flashcard walkthrough: 19-27 (9 steps)
// Card interaction walkthrough: 28-33 (6 steps)

const ONBOARDING_STEP_MAP: Record<string, number> = {
  onboarding: 0,
  'onboarding-language': 1,
  'onboarding-why': 2,
  'onboarding-faster': 3,
  'onboarding-relevant': 4,
  'onboarding-educational': 5,
};

type WalkthroughPhase = 'home' | 'flashcards' | 'cardInteraction';

type OnboardingProgressContextValue = {
  currentStep: number;
  totalSteps: number;
  progress: number;
  isProgressBarVisible: boolean;
  setOnboardingStep: (screenName: string) => void;
  setWalkthroughPhase: (phase: WalkthroughPhase, stepIndex: number) => void;
  setProgressBarVisible: (visible: boolean) => void;
  hideProgressBar: () => void;
};

const OnboardingProgressContext = createContext<OnboardingProgressContextValue | null>(null);

export function OnboardingProgressProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isProgressBarVisible, setIsProgressBarVisible] = useState(false);

  const progress = useMemo(() => {
    if (TOTAL_STEPS <= 0) return 0;
    return Math.min(1, currentStep / (TOTAL_STEPS - 1));
  }, [currentStep]);

  const setOnboardingStep = useCallback((screenName: string) => {
    const step = ONBOARDING_STEP_MAP[screenName];
    if (typeof step === 'number') {
      setCurrentStep(step);
      setIsProgressBarVisible(true);
    }
  }, []);

  const setWalkthroughPhase = useCallback((phase: WalkthroughPhase, stepIndex: number) => {
    const baseStep = phase === 'home' ? 6 : phase === 'flashcards' ? 19 : 28;
    const absoluteStep = baseStep + stepIndex;
    setCurrentStep(Math.min(absoluteStep, TOTAL_STEPS - 1));
    setIsProgressBarVisible(true);
  }, []);

  const setProgressBarVisible = useCallback((visible: boolean) => {
    setIsProgressBarVisible(visible);
  }, []);

  const hideProgressBar = useCallback(() => {
    setIsProgressBarVisible(false);
  }, []);

  const value: OnboardingProgressContextValue = useMemo(
    () => ({
      currentStep,
      totalSteps: TOTAL_STEPS,
      progress,
      isProgressBarVisible,
      setOnboardingStep,
      setWalkthroughPhase,
      setProgressBarVisible,
      hideProgressBar,
    }),
    [
      currentStep,
      progress,
      isProgressBarVisible,
      setOnboardingStep,
      setWalkthroughPhase,
      setProgressBarVisible,
      hideProgressBar,
    ]
  );

  return (
    <OnboardingProgressContext.Provider value={value}>
      {children}
    </OnboardingProgressContext.Provider>
  );
}

export function useOnboardingProgress(): OnboardingProgressContextValue {
  const ctx = useContext(OnboardingProgressContext);
  if (!ctx) {
    throw new Error('useOnboardingProgress must be used within OnboardingProgressProvider');
  }
  return ctx;
}
