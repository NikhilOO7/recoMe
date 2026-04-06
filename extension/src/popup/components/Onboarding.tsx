import { useState } from 'react';

interface OnboardingProps {
  onComplete: (
    quickBlocks: string[],
    quickLikes: string[],
    seedPreferences?: SeedPreferences,
  ) => void;
  /** When true, shows a condensed replay (skip welcome) */
  isReplay?: boolean;
}

export interface SeedPreferences {
  contentTypes: string[];
  intensity: 'casual' | 'moderate' | 'power';
}

const QUICK_BLOCK_OPTIONS = [
  { id: 'crypto', emoji: '💰', label: 'Cryptocurrency / NFTs' },
  { id: 'gambling', emoji: '🎰', label: 'Gambling / Betting' },
  { id: 'clickbait', emoji: '😱', label: 'Clickbait / Drama' },
  { id: 'gaming', emoji: '🎮', label: 'Gaming content' },
  { id: 'politics', emoji: '🗳️', label: 'Politics' },
  { id: 'ads', emoji: '📢', label: 'Sponsored / Ads' },
];

const QUICK_LIKE_OPTIONS = [
  { id: 'technology', emoji: '💻', label: 'Technology & Science' },
  { id: 'travel', emoji: '✈️', label: 'Travel & Outdoors' },
  { id: 'food', emoji: '🍳', label: 'Food & Cooking' },
  { id: 'fitness', emoji: '💪', label: 'Fitness & Health' },
  { id: 'music', emoji: '🎵', label: 'Music & Arts' },
  { id: 'finance', emoji: '📈', label: 'Personal Finance' },
];

export function Onboarding({ onComplete, isReplay }: OnboardingProps) {
  const [step, setStep] = useState(isReplay ? 1 : 0);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [selectedLikes, setSelectedLikes] = useState<Set<string>>(new Set());

  const totalSteps = isReplay ? 2 : 3;

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function finish() {
    const seedPrefs: SeedPreferences = {
      contentTypes: ['videos', 'articles', 'products'],
      intensity: 'moderate',
    };
    onComplete([...selectedBlocks], [...selectedLikes], seedPrefs);
  }

  /** Skip everything immediately — completes onboarding with defaults */
  function skipAll() {
    onComplete([], [], { contentTypes: ['videos', 'articles', 'products'], intensity: 'moderate' });
  }

  return (
    <div className="onboarding">
      {/* Progress dots */}
      <div className="onboarding-dots">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span
            key={i}
            className={`onboarding-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
          />
        ))}
      </div>

      {/* ── Step 0: Welcome + Value Prop ─────────────────────────────── */}
      {step === 0 && !isReplay && (
        <div className="onboarding-step">
          <img
            className="onboarding-hero-img"
            src={chrome.runtime.getURL('icons/recome_logo_128.png')}
            alt="RecoMe"
          />
          <h2 className="onboarding-title">Your research, connected</h2>
          <p className="onboarding-body">
            RecoMe remembers what you research across YouTube, Reddit, and Amazon — then shows you
            why a product matches what you care about.
          </p>
          <div className="onboarding-features">
            <div className="onboarding-feature">
              <span className="onboarding-feature-icon">🔍</span>
              <div>
                <strong>Cross-platform context</strong>
                <p>
                  Watch a review on YouTube, read a thread on Reddit — RecoMe connects it to the
                  product on Amazon.
                </p>
              </div>
            </div>
            <div className="onboarding-feature">
              <span className="onboarding-feature-icon">🔒</span>
              <div>
                <strong>100% private</strong>
                <p>All data stays on your device. Nothing is sent to any server.</p>
              </div>
            </div>
          </div>
          <div className="onboarding-nav">
            <button className="onboarding-btn ghost" onClick={skipAll}>
              Skip setup
            </button>
            <button className="onboarding-btn primary" onClick={() => setStep(1)}>
              Quick setup →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Quick Preferences (blocks + likes combined) ──────── */}
      {step === 1 && (
        <div className="onboarding-step">
          <h2 className="onboarding-title">Personalize in seconds</h2>
          <p className="onboarding-body">
            Optional — tap to block or boost topics. You can always change these later in Settings.
          </p>

          <p
            className="onboarding-selected-hint"
            style={{ alignSelf: 'flex-start', marginBottom: 4 }}
          >
            Hide these topics:
          </p>
          <div className="onboarding-options" style={{ gap: 4 }}>
            {QUICK_BLOCK_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`onboarding-option ${selectedBlocks.has(opt.id) ? 'selected' : ''}`}
                onClick={() => toggle(selectedBlocks, opt.id, setSelectedBlocks)}
                style={{ minHeight: 36, padding: '6px 12px' }}
              >
                <span className="onboarding-option-emoji">{opt.emoji}</span>
                <span className="onboarding-option-label">{opt.label}</span>
                {selectedBlocks.has(opt.id) && <span className="onboarding-option-check">✓</span>}
              </button>
            ))}
          </div>

          <p
            className="onboarding-selected-hint onboarding-selected-hint-green"
            style={{ alignSelf: 'flex-start', marginTop: 10, marginBottom: 4 }}
          >
            Boost these topics:
          </p>
          <div className="onboarding-options" style={{ gap: 4 }}>
            {QUICK_LIKE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`onboarding-option like-option ${selectedLikes.has(opt.id) ? 'selected' : ''}`}
                onClick={() => toggle(selectedLikes, opt.id, setSelectedLikes)}
                style={{ minHeight: 36, padding: '6px 12px' }}
              >
                <span className="onboarding-option-emoji">{opt.emoji}</span>
                <span className="onboarding-option-label">{opt.label}</span>
                {selectedLikes.has(opt.id) && <span className="onboarding-option-check">✓</span>}
              </button>
            ))}
          </div>

          <div className="onboarding-nav">
            {!isReplay && (
              <button className="onboarding-btn ghost" onClick={() => setStep(0)}>
                ← Back
              </button>
            )}
            <button className="onboarding-btn primary" onClick={() => setStep(isReplay ? 2 : 2)}>
              {selectedBlocks.size + selectedLikes.size > 0 ? 'Done →' : 'Skip →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: All Set ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="onboarding-step">
          <div className="onboarding-hero">🎉</div>
          <h2 className="onboarding-title">
            {isReplay ? 'Preferences updated!' : "You're all set!"}
          </h2>
          <p className="onboarding-body">
            {selectedBlocks.size > 0 || selectedLikes.size > 0
              ? [
                  selectedBlocks.size > 0 &&
                    `${selectedBlocks.size} topic${selectedBlocks.size !== 1 ? 's' : ''} blocked`,
                  selectedLikes.size > 0 &&
                    `${selectedLikes.size} topic${selectedLikes.size !== 1 ? 's' : ''} boosted`,
                ]
                  .filter(Boolean)
                  .join(' · ') + '.'
              : 'RecoMe will start learning from your browsing.'}
          </p>
          <p className="onboarding-hint">
            Browse Amazon, YouTube, or Reddit — RecoMe connects your research automatically.
          </p>
          <button className="onboarding-btn primary" onClick={finish}>
            {isReplay ? 'Done' : 'Start browsing'}
          </button>
        </div>
      )}
    </div>
  );
}
