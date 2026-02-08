import React, { createContext, useCallback, useContext, useRef } from 'react';

type TriggerFn = (() => void) | (() => Promise<void>) | null;

interface SignInPromptTriggerContextType {
  registerTrigger: (fn: TriggerFn) => void;
  requestShowSignInPrompt: () => Promise<void>;
}

const SignInPromptTriggerContext = createContext<SignInPromptTriggerContextType | undefined>(undefined);

export function SignInPromptTriggerProvider({ children }: { children: React.ReactNode }) {
  const triggerRef = useRef<TriggerFn>(null);

  const registerTrigger = useCallback((fn: TriggerFn) => {
    triggerRef.current = fn;
  }, []);

  const requestShowSignInPrompt = useCallback(async () => {
    const fn = triggerRef.current;
    if (fn) {
      const result = fn();
      if (result instanceof Promise) await result;
    }
  }, []);

  return (
    <SignInPromptTriggerContext.Provider value={{ registerTrigger, requestShowSignInPrompt }}>
      {children}
    </SignInPromptTriggerContext.Provider>
  );
}

export function useSignInPromptTrigger(): SignInPromptTriggerContextType {
  const context = useContext(SignInPromptTriggerContext);
  if (!context) {
    return {
      registerTrigger: () => {},
      requestShowSignInPrompt: async () => {},
    };
  }
  return context;
}
