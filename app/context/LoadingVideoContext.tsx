import React, { createContext, useContext, type ReactNode } from 'react';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';

const loadingVideoSource = require('../../assets/loading.mp4');

type LoadingVideoContextValue = {
  player: VideoPlayer | null;
};

const LoadingVideoContext = createContext<LoadingVideoContextValue>({ player: null });

/**
 * Creates the loading video player at app root so it preloads. The player is created in the
 * provider (not in a child with useEffect) so it's available on the first render. That way
 * LoadingVideoScreen always gets the preloaded player and doesn't create a second, cold-start
 * player — which was why the first onboarding/loading video failed often while later videos didn't.
 * Playback is started only when LoadingVideoScreen mounts (and paused when it unmounts).
 */
export function LoadingVideoProvider({ children }: { children: ReactNode }) {
  const player = useVideoPlayer(loadingVideoSource, (p) => {
    p.loop = true;
    p.muted = true;
    // Do NOT call p.play() here — LoadingVideoScreen will play on mount and pause on unmount
  });

  return (
    <LoadingVideoContext.Provider value={{ player }}>
      {children}
    </LoadingVideoContext.Provider>
  );
}

export function useLoadingVideoPlayer(): VideoPlayer | null {
  return useContext(LoadingVideoContext).player;
}
