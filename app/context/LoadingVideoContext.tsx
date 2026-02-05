import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';

const loadingVideoSource = require('../../assets/loading.mp4');

type LoadingVideoContextValue = {
  player: VideoPlayer | null;
};

const LoadingVideoContext = createContext<LoadingVideoContextValue>({ player: null });

/**
 * Inner component that creates the video player and stores it in context.
 * Mounts at app root so the video preloads and is ready as soon as the loading screen is shown.
 */
function LoadingVideoPlayerSource({ setPlayer }: { setPlayer: (p: VideoPlayer) => void }) {
  const player = useVideoPlayer(loadingVideoSource, (p) => {
    p.loop = true;
    p.muted = true;
    // Start loading/playing immediately so the video is ready when the loading screen appears
    p.play();
  });
  useEffect(() => {
    setPlayer(player);
  }, [player, setPlayer]);
  return null;
}

export function LoadingVideoProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<VideoPlayer | null>(null);

  return (
    <LoadingVideoContext.Provider value={{ player }}>
      <LoadingVideoPlayerSource setPlayer={setPlayer} />
      {children}
    </LoadingVideoContext.Provider>
  );
}

export function useLoadingVideoPlayer(): VideoPlayer | null {
  return useContext(LoadingVideoContext).player;
}
