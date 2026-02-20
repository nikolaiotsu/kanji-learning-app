import React, { type ReactNode } from 'react';

/**
 * LoadingVideoContext is no longer needed after migrating from expo-video to expo-av.
 * expo-av Video components manage their own playback internally, so there's no need
 * to preload a shared player at the app root.
 *
 * This file is kept as a thin passthrough so existing imports don't break.
 */
export function LoadingVideoProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useLoadingVideoPlayer() {
  return null;
}
