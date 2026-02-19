import React, { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { usePathname } from 'expo-router';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { useOnboarding } from './OnboardingContext';
const guyflyingSource = require('../../assets/guyflying.mp4');
const guytypingSource = require('../../assets/guytyping1.mp4');
const guygettingburiedSource = require('../../assets/guygettingburied.mp4');
const heroshotSource = require('../../assets/heroshot.mp4');

/** Max time to wait for videos to be ready before allowing app to proceed (ms) */
export const MAX_ONBOARDING_VIDEO_PRELOAD_MS = 6000;

export type OnboardingVideoKey = 'guyflying' | 'guytyping' | 'guygettingburied' | 'heroshot';

type OnboardingVideosContextValue = {
  guyflying: VideoPlayer | null;
  guytyping: VideoPlayer | null;
  guygettingburied: VideoPlayer | null;
  heroshot: VideoPlayer | null;
};

const OnboardingVideosContext = createContext<OnboardingVideosContextValue>({
  guyflying: null,
  guytyping: null,
  guygettingburied: null,
  heroshot: null,
});

/**
 * Tracks when all onboarding video players are ready to play and notifies via callback.
 * Uses addListener so we can subscribe to multiple players without violating hooks rules.
 */
function OnboardingVideosReadyTracker({
  players,
  onReady,
}: {
  players: OnboardingVideosContextValue;
  onReady: () => void;
}) {
  const hasNotifiedRef = useRef(false);
  const onReadyStable = useCallback(onReady, []);

  useEffect(() => {
    const allPlayers = [players.heroshot, players.guyflying, players.guytyping, players.guygettingburied].filter(
      (p): p is VideoPlayer => p != null
    );
    if (allPlayers.length === 0 || hasNotifiedRef.current) return;

    const checkAllReady = () => {
      if (hasNotifiedRef.current) return;
      const ready = allPlayers.every((p) => p.status === 'readyToPlay');
      if (ready) {
        hasNotifiedRef.current = true;
        onReadyStable();
      }
    };

    const maxTimeout = setTimeout(() => {
      if (!hasNotifiedRef.current) {
        hasNotifiedRef.current = true;
        onReadyStable();
      }
    }, MAX_ONBOARDING_VIDEO_PRELOAD_MS);

    const unsubscribes = allPlayers.map((player) =>
      player.addListener('statusChange', () => checkAllReady())
    );

    checkAllReady();

    return () => {
      clearTimeout(maxTimeout);
      unsubscribes.forEach((unsub) => unsub.remove());
    };
  }, [players.heroshot, players.guyflying, players.guytyping, players.guygettingburied, onReadyStable]);

  return null;
}

/**
 * Creates and preloads onboarding videos only when the provider is mounted.
 * Mounted only while the user is on an onboarding route (see OnboardingVideosProviderWrapper).
 * Players are configured (loop, muted); playback is started by each screen and paused on unmount.
 */
function OnboardingVideosPlayerSource({
  setPlayers,
}: {
  setPlayers: (p: { guyflying: VideoPlayer; guytyping: VideoPlayer; guygettingburied: VideoPlayer; heroshot: VideoPlayer }) => void;
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
  const heroshot = useVideoPlayer(heroshotSource, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    setPlayers({ guyflying, guytyping, guygettingburied, heroshot });
  }, [guyflying, guytyping, guygettingburied, heroshot, setPlayers]);

  return null;
}

function OnboardingVideosProviderInner({
  children,
  onVideosReady,
}: {
  children: ReactNode;
  onVideosReady?: () => void;
}) {
  const [players, setPlayers] = useState<OnboardingVideosContextValue>({
    guyflying: null,
    guytyping: null,
    guygettingburied: null,
    heroshot: null,
  });

  const setPlayersStable = React.useCallback(
    (p: { guyflying: VideoPlayer; guytyping: VideoPlayer; guygettingburied: VideoPlayer; heroshot: VideoPlayer }) => {
      setPlayers({ guyflying: p.guyflying, guytyping: p.guytyping, guygettingburied: p.guygettingburied, heroshot: p.heroshot });
    },
    []
  );

  return (
    <OnboardingVideosContext.Provider value={players}>
      <OnboardingVideosPlayerSource setPlayers={setPlayersStable} />
      {onVideosReady && <OnboardingVideosReadyTracker players={players} onReady={onVideosReady} />}
      {children}
    </OnboardingVideosContext.Provider>
  );
}

/**
 * Mounts when the user is on an onboarding route OR when they're a first-time user
 * (hasCompletedOnboarding === false). For first-time users, this allows videos to preload
 * during the initial loading overlay so they appear instantly on the first onboarding screen.
 */
export function OnboardingVideosProvider({
  children,
  onVideosReady,
}: {
  children: ReactNode;
  onVideosReady?: () => void;
}) {
  const pathname = usePathname();
  const { hasCompletedOnboarding } = useOnboarding();
  const isOnboardingRoute =
    typeof pathname === 'string' && pathname.includes('onboarding');
  const isFirstTimeUser = hasCompletedOnboarding === false;

  if (!isOnboardingRoute && !isFirstTimeUser) {
    return <>{children}</>;
  }
  return <OnboardingVideosProviderInner onVideosReady={onVideosReady}>{children}</OnboardingVideosProviderInner>;
}

export function useOnboardingVideo(key: OnboardingVideoKey): VideoPlayer | null {
  return useContext(OnboardingVideosContext)[key];
}
