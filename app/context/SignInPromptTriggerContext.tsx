import React, { createContext, useCallback, useContext, useRef } from 'react';

type TriggerFn = (() => void) | (() => Promise<void>) | null;

interface SignInPromptTriggerContextType {
  registerTrigger: (fn: TriggerFn) => void;
  requestShowSignInPrompt: () => Promise<void>;
  /** When true, requestShowSignInPrompt is a no-op. Set by KanjiScanner during walkthrough
   * so the sign-in prompt appears only after the final congrats modal, not after the badge modal. */
  setInWalkthroughFlow: (value: boolean) => void;
}

const SignInPromptTriggerContext = createContext<SignInPromptTriggerContextType | undefined>(undefined);

export function SignInPromptTriggerProvider({ children }: { children: React.ReactNode }) {
  const triggerRef = useRef<TriggerFn>(null);
  const inWalkthroughFlowRef = useRef(false);

  const registerTrigger = useCallback((fn: TriggerFn) => {
    triggerRef.current = fn;
  }, []);

  const setInWalkthroughFlow = useCallback((value: boolean) => {
    inWalkthroughFlowRef.current = value;
  }, []);

  const requestShowSignInPrompt = useCallback(async () => {
    if (inWalkthroughFlowRef.current) return;
    const fn = triggerRef.current;
    if (fn) {
      const result = fn();
      if (result instanceof Promise) await result;
    }
  }, []);

  return (
    <SignInPromptTriggerContext.Provider value={{ registerTrigger, requestShowSignInPrompt, setInWalkthroughFlow }}>
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
      setInWalkthroughFlow: () => {},
    };
  }
  return context;
}
