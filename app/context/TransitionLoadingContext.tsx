import React, { createContext, useContext, useState, type ReactNode } from 'react';

type TransitionLoadingContextValue = {
  showTransitionLoading: boolean;
  setShowTransitionLoading: (show: boolean) => void;
};

const TransitionLoadingContext = createContext<TransitionLoadingContextValue | null>(null);

export function TransitionLoadingProvider({ children }: { children: ReactNode }) {
  const [showTransitionLoading, setShowTransitionLoading] = useState(false);
  return (
    <TransitionLoadingContext.Provider value={{ showTransitionLoading, setShowTransitionLoading }}>
      {children}
    </TransitionLoadingContext.Provider>
  );
}

export function useTransitionLoading(): TransitionLoadingContextValue {
  const ctx = useContext(TransitionLoadingContext);
  if (!ctx) {
    return {
      showTransitionLoading: false,
      setShowTransitionLoading: () => {},
    };
  }
  return ctx;
}
