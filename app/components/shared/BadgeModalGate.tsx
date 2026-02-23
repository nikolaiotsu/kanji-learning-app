/**
 * BadgeModalGate - Renders BadgeCelebrationModal only when user is on home screen.
 * This ensures the celebration modal shows when the user navigates back to home
 * after earning a badge, not while they're still on other screens.
 * When user skips the walkthrough, the sign-in prompt is shown after they dismiss
 * the badge modal (right after their first flashcard).
 * When user is in walkthrough mode, the sign-in prompt is suppressed here and will
 * be shown after the final congrats modal instead (via handleWalkthroughComplete).
 */
import { usePathname } from 'expo-router';
import BadgeCelebrationModal from './BadgeCelebrationModal';
import { useBadge } from '../../context/BadgeContext';
import { useAuth } from '../../context/AuthContext';
import { useSignInPromptTrigger } from '../../context/SignInPromptTriggerContext';
import { getSignInPromptDismissed } from '../auth/SignInPrompt';

export default function BadgeModalGate() {
  const pathname = usePathname();
  const { pendingBadge, clearPendingBadge } = useBadge();
  const { user, isLoading: isAuthLoading } = useAuth();
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
    clearPendingBadge();
    // Show sign-in prompt after badge modal for users who skipped walkthrough
    // (e.g. made first flashcard without completing onboarding flow)
    // Include guests - they're the ones we want to prompt to sign up.
    // Skip when auth is still loading - user may be signed in but not yet hydrated (preview build race).
    if (!user && !isAuthLoading) {
      try {
        const dismissed = await getSignInPromptDismissed();
        if (!dismissed) {
          await requestShowSignInPrompt();
        }
      } catch {
        await requestShowSignInPrompt();
      }
    }
  };

  return (
    <BadgeCelebrationModal
      visible={shouldShowModal}
      badge={pendingBadge}
      onDismiss={handleDismiss}
    />
  );
}
