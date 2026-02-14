import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ONBOARDING_PROGRESS_BAR_RESERVED_TOP,
} from '../components/shared/OnboardingProgressBar';

/**
 * Returns layout values for onboarding screens to prevent content (e.g. loading
 * animation) from overlapping the progress bar on small screens like iPhone SE.
 *
 * - paddingHorizontal: responsive horizontal padding (~8% width, 32–56px)
 * - contentPaddingTop: space to reserve below the progress bar so content
 *   (loading animation) stays just below it, avoiding overlap on compact devices
 */
export function useOnboardingLayout(): {
  paddingHorizontal: number;
  contentPaddingTop: number;
} {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const paddingHorizontal = Math.max(32, Math.min(56, Math.round(width * 0.08)));
  const contentPaddingTop =
    insets.top + ONBOARDING_PROGRESS_BAR_RESERVED_TOP;
  return { paddingHorizontal, contentPaddingTop };
}
