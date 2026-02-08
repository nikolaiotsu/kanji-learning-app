/**
 * BadgeModalGate - Renders BadgeCelebrationModal only when user is on home screen.
 * This ensures the celebration modal shows when the user navigates back to home
 * after earning a badge, not while they're still on other screens.
 * When the user dismisses the badge modal, the Create account (SignInPrompt) modal
 * is triggered if they are a guest and haven't dismissed it before.
 */
import { usePathname } from 'expo-router';
import BadgeCelebrationModal from './BadgeCelebrationModal';
import { useBadge } from '../../context/BadgeContext';
import { useSignInPromptTrigger } from '../../context/SignInPromptTriggerContext';

export default function BadgeModalGate() {
  const pathname = usePathname();
  const { pendingBadge, clearPendingBadge } = useBadge();
  const { requestShowSignInPrompt } = useSignInPromptTrigger();

  // Show modal only when user is on home screen with a pending badge
  const isOnHomeScreen =
    pathname === '/' ||
    pathname === '' ||
    pathname === '/index' ||
    pathname === '/(screens)' ||
    pathname === '/(screens)/' ||
    pathname === '/(screens)/index';
  const shouldShowModal = !!pendingBadge && isOnHomeScreen;

  const handleDismiss = async () => {
    await requestShowSignInPrompt();
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
