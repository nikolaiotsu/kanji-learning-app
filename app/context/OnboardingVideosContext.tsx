import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';

const guyflyingSource = require('../../assets/guyflying.mp4');
const guytypingSource = require('../../assets/guytyping1.mp4');
const guygettingburiedSource = require('../../assets/guygettingburied.mp4');

export type OnboardingVideoKey = 'guyflying' | 'guytyping' | 'guygettingburied';

type OnboardingVideosContextValue = {
  guyflying: VideoPlayer | null;
  guytyping: VideoPlayer | null;
  guygettingburied: VideoPlayer | null;
};

const OnboardingVideosContext = createContext<OnboardingVideosContextValue>({
  guyflying: null,
  guytyping: null,
  guygettingburied: null,
});

/**
 * Creates and preloads all onboarding videos when the provider mounts.
 * Players are configured (loop, muted) but not played so they buffer in the background.
 * Onboarding screens consume these players for instant playback.
 */
function OnboardingVideosPlayerSource({
  setPlayers,
}: {
  setPlayers: (p: { guyflying: VideoPlayer; guytyping: VideoPlayer; guygettingburied: VideoPlayer }) => void;
}) {
  const guyflying = useVideoPlayer(guyflyingSource, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const guytyping = useVideoPlayer(guytypingSource, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const guygettingburied = useVideoPlayer(guygettingburiedSource, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    setPlayers({ guyflying, guytyping, guygettingburied });
  }, [guyflying, guytyping, guygettingburied, setPlayers]);

  return null;
}

export function OnboardingVideosProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<OnboardingVideosContextValue>({
    guyflying: null,
    guytyping: null,
    guygettingburied: null,
  });

  const setPlayersStable = React.useCallback(
    (p: { guyflying: VideoPlayer; guytyping: VideoPlayer; guygettingburied: VideoPlayer }) => {
      setPlayers({ guyflying: p.guyflying, guytyping: p.guytyping, guygettingburied: p.guygettingburied });
    },
    []
  );

  return (
    <OnboardingVideosContext.Provider value={players}>
      <OnboardingVideosPlayerSource setPlayers={setPlayersStable} />
      {children}
    </OnboardingVideosContext.Provider>
  );
}

export function useOnboardingVideo(key: OnboardingVideoKey): VideoPlayer | null {
  return useContext(OnboardingVideosContext)[key];
}
