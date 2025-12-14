import { View } from 'react-native';
import { logger } from './logger';

/**
 * Measurement target for walkthrough steps
 */
export type MeasureTarget = { 
  ref: React.RefObject<View>; 
  stepId: string;
};

/**
 * Options for ensureMeasuredThenAdvance
 */
export interface EnsureMeasureOptions {
  targets: MeasureTarget[];
  updateLayout: (stepId: string, layout: { x: number; y: number; width: number; height: number }) => void;
  advance: () => void;
  retries?: number;
  retryDelayMs?: number;
  settleDelayMs?: number;
  cancelFlag: { cancelled: boolean };
}

/**
 * Utility function to delay execution
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ensures all target elements are measured before advancing to the next walkthrough step.
 * This prevents flickering/jumpy overlays by retrying measurements until they succeed.
 * 
 * @param options Configuration options for measurement and advancement
 * @returns Promise that resolves when all targets are measured and advancement occurs
 */
export async function ensureMeasuredThenAdvance({
  targets,
  updateLayout,
  advance,
  retries = 4,
  retryDelayMs = 100,
  settleDelayMs = 50,
  cancelFlag,
}: EnsureMeasureOptions): Promise<void> {
  const measureTarget = (target: MeasureTarget) =>
    new Promise<boolean>(resolve => {
      const { ref, stepId } = target;
      if (!ref.current) {
        resolve(false);
        return;
      }

      ref.current.measureInWindow((x, y, width, height) => {
        if (cancelFlag.cancelled) {
          resolve(false);
          return;
        }
        if (width !== 0 && height !== 0) {
          updateLayout(stepId, { x, y, width, height });
          logger.log(`[ensureMeasuredThenAdvance] Successfully measured ${stepId}: x=${x}, y=${y}, width=${width}, height=${height}`);
          resolve(true);
        } else {
          logger.warn(`[ensureMeasuredThenAdvance] Failed to measure ${stepId} - got zero dimensions`);
          resolve(false);
        }
      });
    });

  let attempt = 0;
  let allMeasured = false;

  while (attempt < retries && !allMeasured && !cancelFlag.cancelled) {
    attempt++;
    logger.log(`[ensureMeasuredThenAdvance] Attempt ${attempt}/${retries} to measure ${targets.length} targets`);

    const results = await Promise.all(targets.map(measureTarget));
    allMeasured = results.every(r => r);

    if (!allMeasured && attempt < retries) {
      await delay(retryDelayMs);
    }
  }

  if (cancelFlag.cancelled) {
    logger.log('[ensureMeasuredThenAdvance] Cancelled before advancing');
    return;
  }

  if (!allMeasured) {
    logger.warn(`[ensureMeasuredThenAdvance] Could not measure all targets after ${retries} retries, advancing anyway`);
  }

  // Small settle delay to ensure layout is stable
  await delay(settleDelayMs);

  if (!cancelFlag.cancelled) {
    logger.log('[ensureMeasuredThenAdvance] All targets measured, advancing step');
    advance();
  }
}

/**
 * Measures a single button and updates its layout.
 * Used for initial button measurement when walkthrough starts.
 * 
 * @param ref React ref to the button element
 * @param stepId Step identifier for the button
 * @param updateLayout Function to update the layout for the step
 */
export function measureButton(
  ref: React.RefObject<View>, 
  stepId: string,
  updateLayout: (stepId: string, layout: { x: number; y: number; width: number; height: number }) => void
) {
  if (ref.current) {
    ref.current.measureInWindow((x, y, width, height) => {
      if (x !== 0 || y !== 0 || width !== 0 || height !== 0) {
        updateLayout(stepId, { x, y, width, height });
        logger.log(`[measureButton] Measured ${stepId}: x=${x}, y=${y}, width=${width}, height=${height}`);
      } else {
        logger.warn(`[measureButton] Failed to measure ${stepId} - got zero dimensions`);
      }
    });
  } else {
    logger.warn(`[measureButton] Ref is null for ${stepId}`);
  }
}
