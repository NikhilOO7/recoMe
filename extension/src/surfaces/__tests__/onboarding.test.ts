import { onboardingSteps, EMPTY_ONBOARDING } from '../onboarding';

describe('onboardingSteps', () => {
  test('dismissed state renders nothing', () => {
    expect(onboardingSteps({ capture: true, insight: true, dismissed: true }, true)).toBeNull();
  });

  test('fresh signed-out user: all steps open, hints present', () => {
    const model = onboardingSteps({ ...EMPTY_ONBOARDING }, false);
    expect(model).not.toBeNull();
    expect(model!.complete).toBe(false);
    expect(model!.steps.map((s) => s.done)).toEqual([false, false, false]);
    for (const step of model!.steps) {
      expect(step.hint).toBeTruthy();
    }
  });

  test('signed-in marks only the first step; hints drop off done steps', () => {
    const model = onboardingSteps({ ...EMPTY_ONBOARDING }, true)!;
    expect(model.steps.map((s) => s.done)).toEqual([true, false, false]);
    expect(model.steps[0]!.hint).toBeUndefined();
    expect(model.steps[1]!.hint).toBeTruthy();
  });

  test('capture without insight: two of three done', () => {
    const model = onboardingSteps({ capture: true, insight: false, dismissed: false }, true)!;
    expect(model.steps.map((s) => s.done)).toEqual([true, true, false]);
    expect(model.complete).toBe(false);
  });

  test('all steps done flips complete (but does not dismiss — caller owns that)', () => {
    const model = onboardingSteps({ capture: true, insight: true, dismissed: false }, true)!;
    expect(model.complete).toBe(true);
    expect(model.steps.every((s) => s.done)).toBe(true);
  });

  test('sign-out after capture reopens only the sign-in step', () => {
    const model = onboardingSteps({ capture: true, insight: false, dismissed: false }, false)!;
    expect(model.steps.map((s) => s.done)).toEqual([false, true, false]);
  });
});
