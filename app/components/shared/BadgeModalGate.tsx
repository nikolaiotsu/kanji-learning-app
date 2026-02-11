/**
 * BadgeModalGate - Renders BadgeCelebrationModal only when user is on home screen.
 * This ensures the celebration modal shows when the user navigates back to home
 * after earning a badge, not while they're still on other screens.
 * Sign-in prompt is shown only after the user presses Continue on the final
 * "You're all set" walkthrough step, not after dismissing the badge modal.
 */
import { usePathname } from 'expo-router';
import BadgeCelebrationModal from './BadgeCelebrationModal';
import { useBadge } from '../../context/BadgeContext';

export default function BadgeModalGate() {
  const pathname = usePathname();
  const { pendingBadge, clearPendingBadge } = useBadge();

  // Show modal only when user is on home screen with a pending badge
  const isOnHomeScreen =
    pathname === '/' ||
    pathname === '' ||
    pathname === '/index' ||
    pathname === '/(screens)' ||
    pathname === '/(screens)/' ||
    pathname === '/(screens)/index';
  const shouldShowModal = !!pendingBadge && isOnHomeScreen;

  const handleDismiss = () => {
    clearPendingBadge();
  };

  return (
    <BadgeCelebrationModal
      visible={shouldShowModal}
      badge={pendingBadge}
      onDismiss={handleDismiss}
    />
  );
}
