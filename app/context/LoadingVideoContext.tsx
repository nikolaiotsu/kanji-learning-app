import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';

const loadingVideoSource = require('../../assets/loading.mp4');

type LoadingVideoContextValue = {
  player: VideoPlayer | null;
};

const LoadingVideoContext = createContext<LoadingVideoContextValue>({ player: null });

/**
 * Inner component that creates the video player and stores it in context.
 * Mounts when the provider mounts (app ready) so the player buffers before API loading.
 */
function LoadingVideoPlayerSource({ setPlayer }: { setPlayer: (p: VideoPlayer) => void }) {
  const player = useVideoPlayer(loadingVideoSource, (p) => {
    p.loop = true;
    p.muted = true;
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
