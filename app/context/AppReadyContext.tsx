import React, { createContext, useContext, type ReactNode } from 'react';

type AppReadyContextValue = {
  /** True while the intro splash/loading screen is visible */
  isSplashVisible: boolean;
};

const AppReadyContext = createContext<AppReadyContextValue>({ isSplashVisible: true });

export function AppReadyProvider({
  children,
  isSplashVisible,
}: {
  children: ReactNode;
  isSplashVisible: boolean;
}) {
  return (
    <AppReadyContext.Provider value={{ isSplashVisible }}>
      {children}
    </AppReadyContext.Provider>
  );
}

export function useAppReady(): AppReadyContextValue {
  return useContext(AppReadyContext);
}
