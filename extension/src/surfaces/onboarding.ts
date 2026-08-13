/**
 * Onboarding walkthrough state (R2 exit metric: sign-in → first capture →
 * first insight within 10 minutes).
 *
 * Honest-design note: a brand-new user CANNOT receive a real Recall — it
 * requires ≥14-day-old signals. The truthful "first insight" is a Synthesist
 * on-demand run fired right after the first capture lands: it emits a real,
 * cited "New this week: <their topic>" built from their own just-captured
 * data. No fabricated content, ever (product principle 7).
 */
import { STORAGE_KEYS } from '@shared/constants';

export interface OnboardingState {
  /** First signal captured on this profile. */
  capture: boolean;
  /** First agent emission surfaced (starter Synthesist run succeeded). */
  insight: boolean;
  /** Walkthrough completed and celebrated — never render again. */
  dismissed: boolean;
}

export interface OnboardingStep {
  label: string;
  done: boolean;
  hint?: string;
}

export const EMPTY_ONBOARDING: OnboardingState = {
  capture: false,
  insight: false,
  dismissed: false,
};

/**
 * Render model for the "Getting started" panel. Returns null when there is
 * nothing to show (walkthrough dismissed). `complete` flips when every step
 * is done — the panel celebrates once, then persists dismissed.
 */
export function onboardingSteps(
  state: OnboardingState,
  signedIn: boolean,
): { steps: OnboardingStep[]; complete: boolean } | null {
  if (state.dismissed) return null;
  const steps: OnboardingStep[] = [
    {
      label: 'Sign in',
      done: signedIn,
      ...(signedIn ? {} : { hint: 'One click connects your web session.' }),
    },
    {
      label: 'Capture your first page',
      done: state.capture,
      ...(state.capture ? {} : { hint: 'Stay ~10 seconds on any product, video, or thread.' }),
    },
    {
      label: 'Meet your first insight',
      done: state.insight,
      ...(state.insight
        ? {}
        : { hint: 'Arrives seconds after your first capture — watch bottom-left.' }),
    },
  ];
  return { steps, complete: steps.every((s) => s.done) };
}

export async function loadOnboarding(): Promise<OnboardingState> {
  try {
    const r = await chrome.storage.local.get(STORAGE_KEYS.onboarding);
    return { ...EMPTY_ONBOARDING, ...(r[STORAGE_KEYS.onboarding] as Partial<OnboardingState>) };
  } catch {
    return { ...EMPTY_ONBOARDING };
  }
}

export async function saveOnboarding(state: OnboardingState): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.onboarding]: state });
  } catch {
    // Storage failure — the walkthrough may reappear; harmless.
  }
}
