import { useState } from 'react';

interface OnboardingProps {
  onComplete: (
    quickBlocks: string[],
    quickLikes: string[],
    seedPreferences?: SeedPreferences,
  ) => void;
  /** When true, shows a condensed replay (skip welcome/agent steps) */
  isReplay?: boolean;
}

export interface SeedPreferences {
  /** Preferred content types (video, article, product, etc.) */
  contentTypes: string[];
  /** Browsing intensity: casual, moderate, power */
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

const CONTENT_TYPE_OPTIONS = [
  { id: 'videos', emoji: '🎬', label: 'Videos & Reels' },
  { id: 'articles', emoji: '📰', label: 'Articles & Posts' },
  { id: 'products', emoji: '🛒', label: 'Products & Deals' },
  { id: 'images', emoji: '🖼️', label: 'Photos & Images' },
  { id: 'news', emoji: '📡', label: 'News & Updates' },
  { id: 'tutorials', emoji: '📚', label: 'Tutorials & How-tos' },
];

const INTENSITY_OPTIONS: Array<{
  id: SeedPreferences['intensity'];
  emoji: string;
  label: string;
  desc: string;
}> = [
  { id: 'casual', emoji: '🌿', label: 'Casual', desc: 'Light filtering, mostly suggestions' },
  { id: 'moderate', emoji: '⚡', label: 'Moderate', desc: 'Balanced filtering and boosting' },
  { id: 'power', emoji: '🔥', label: 'Power', desc: 'Aggressive filtering, strong curation' },
];

export function Onboarding({ onComplete, isReplay }: OnboardingProps) {
  const [step, setStep] = useState(isReplay ? 1 : 0);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [selectedLikes, setSelectedLikes] = useState<Set<string>>(new Set());
  const [customBlock, setCustomBlock] = useState('');
  const [customLike, setCustomLike] = useState('');
  const [selectedContentTypes, setSelectedContentTypes] = useState<Set<string>>(new Set());
  const [intensity, setIntensity] = useState<SeedPreferences['intensity']>('moderate');

  // Replay mode uses fewer steps (skip welcome, agent explainer, shopping explainer)
  const totalSteps = isReplay ? 5 : 8;

  function toggleBlock(id: string) {
    setSelectedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleLike(id: string) {
    setSelectedLikes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addCustomBlock() {
    const trimmed = customBlock.trim();
    if (!trimmed) return;
    setSelectedBlocks((prev) => new Set([...prev, trimmed]));
    setCustomBlock('');
  }

  function addCustomLike() {
    const trimmed = customLike.trim();
    if (!trimmed) return;
    setSelectedLikes((prev) => new Set([...prev, trimmed]));
    setCustomLike('');
  }

  function toggleContentType(id: string) {
    setSelectedContentTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function finish() {
    const seedPrefs: SeedPreferences = {
      contentTypes: [...selectedContentTypes],
      intensity,
    };
    onComplete([...selectedBlocks], [...selectedLikes], seedPrefs);
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

      {/* Step 0: Welcome */}
      {step === 0 && (
        <div className="onboarding-step">
          <img
            className="onboarding-hero-img"
            src={chrome.runtime.getURL('icons/recome_logo_128.png')}
            alt="RecoMe"
          />
          <h2 className="onboarding-title">Welcome to RecoMe</h2>
          <p className="onboarding-body">
            Your feed, your rules. RecoMe quietly learns what you want — and filters out everything
            you don't.
          </p>
          <button className="onboarding-btn primary" onClick={() => setStep(1)}>
            Let's get started →
          </button>
        </div>
      )}

      {/* Step 1: Quick Blocks */}
      {step === 1 && (
        <div className="onboarding-step">
          <h2 className="onboarding-title">What would you rather not see?</h2>
          <p className="onboarding-body">
            Pick any topics to block right away. You can always change these later.
          </p>
          <div className="onboarding-options">
            {QUICK_BLOCK_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`onboarding-option ${selectedBlocks.has(opt.id) ? 'selected' : ''}`}
                onClick={() => toggleBlock(opt.id)}
              >
                <span className="onboarding-option-emoji">{opt.emoji}</span>
                <span className="onboarding-option-label">{opt.label}</span>
                {selectedBlocks.has(opt.id) && <span className="onboarding-option-check">✓</span>}
              </button>
            ))}
          </div>
          <div className="onboarding-custom">
            <input
              type="text"
              className="onboarding-custom-input"
              placeholder="+ Add your own..."
              value={customBlock}
              onChange={(e) => setCustomBlock(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomBlock()}
            />
            {customBlock.trim() && (
              <button className="onboarding-custom-add" onClick={addCustomBlock}>
                Add
              </button>
            )}
          </div>
          {selectedBlocks.size > 0 && (
            <p className="onboarding-selected-hint">
              {selectedBlocks.size} topic{selectedBlocks.size !== 1 ? 's' : ''} selected
            </p>
          )}
          <div className="onboarding-nav">
            <button className="onboarding-btn ghost" onClick={() => setStep(2)}>
              Skip
            </button>
            <button className="onboarding-btn primary" onClick={() => setStep(2)}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Quick Likes */}
      {step === 2 && (
        <div className="onboarding-step">
          <h2 className="onboarding-title">What do you love seeing?</h2>
          <p className="onboarding-body">
            Pick topics you want to see more of. RecoMe will boost matching content.
          </p>
          <div className="onboarding-options">
            {QUICK_LIKE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`onboarding-option like-option ${selectedLikes.has(opt.id) ? 'selected' : ''}`}
                onClick={() => toggleLike(opt.id)}
              >
                <span className="onboarding-option-emoji">{opt.emoji}</span>
                <span className="onboarding-option-label">{opt.label}</span>
                {selectedLikes.has(opt.id) && <span className="onboarding-option-check">✓</span>}
              </button>
            ))}
          </div>
          <div className="onboarding-custom">
            <input
              type="text"
              className="onboarding-custom-input"
              placeholder="+ Add your own..."
              value={customLike}
              onChange={(e) => setCustomLike(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomLike()}
            />
            {customLike.trim() && (
              <button className="onboarding-custom-add" onClick={addCustomLike}>
                Add
              </button>
            )}
          </div>
          {selectedLikes.size > 0 && (
            <p className="onboarding-selected-hint onboarding-selected-hint-green">
              {selectedLikes.size} topic{selectedLikes.size !== 1 ? 's' : ''} to boost
            </p>
          )}
          <div className="onboarding-nav">
            <button className="onboarding-btn ghost" onClick={() => setStep(3)}>
              Skip
            </button>
            <button className="onboarding-btn primary" onClick={() => setStep(3)}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Feed Controls */}
      {step === 3 && (
        <div className="onboarding-step">
          <h2 className="onboarding-title">Control your feed</h2>
          <p className="onboarding-body">
            A small button appears on posts while you browse. Tap it to tell RecoMe what you think.
          </p>
          <div className="onboarding-demo">
            <div className="onboarding-demo-card">
              <div className="onboarding-demo-thumb">🖼️</div>
              <div className="onboarding-demo-info">
                <div className="onboarding-demo-title">Some random post</div>
                <div className="onboarding-demo-creator">@someone</div>
              </div>
              <div className="onboarding-demo-trigger">
                <img
                  src={chrome.runtime.getURL('icons/recome_logo_16.png')}
                  alt=""
                  className="inline-logo"
                />{' '}
                RecoMe
              </div>
            </div>
            <ul className="onboarding-how-list">
              <li>
                <span>👍</span> More like this — boost similar content
              </li>
              <li>
                <span>👎</span> Less like this — suppress the topic
              </li>
              <li>
                <span>🚫</span> Block it forever — gone for good
              </li>
              <li>
                <span>⏰</span> Not right now — hide just this once
              </li>
            </ul>
          </div>
          <div className="onboarding-nav">
            <button className="onboarding-btn ghost" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button className="onboarding-btn primary" onClick={() => setStep(4)}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Smart Shopping */}
      {step === 4 && (
        <div className="onboarding-step">
          <h2 className="onboarding-title">Smart shopping, built in</h2>
          <p className="onboarding-body">
            On Amazon and other stores, RecoMe scores every product based on your preferences.
          </p>
          <div className="onboarding-features">
            <div className="onboarding-feature">
              <span className="onboarding-feature-icon">🟢</span>
              <div>
                <strong>Smart scores</strong>
                <p>
                  Products get "Good fit", "Caution", or "Lower priority" badges so you spot the
                  best match instantly.
                </p>
              </div>
            </div>
            <div className="onboarding-feature">
              <span className="onboarding-feature-icon">🔖</span>
              <div>
                <strong>Watchlist</strong>
                <p>Save products to compare later — right from the search results page.</p>
              </div>
            </div>
            <div className="onboarding-feature">
              <span className="onboarding-feature-icon">🧠</span>
              <div>
                <strong>Intent memory</strong>
                <p>
                  Tell RecoMe "I prefer this brand" or "avoid that seller" and it remembers across
                  sessions.
                </p>
              </div>
            </div>
          </div>
          <div className="onboarding-nav">
            <button className="onboarding-btn ghost" onClick={() => setStep(3)}>
              ← Back
            </button>
            <button className="onboarding-btn primary" onClick={() => setStep(5)}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Cold-start — Content type preferences */}
      {step === 5 && (
        <div className="onboarding-step">
          <h2 className="onboarding-title">What kind of content?</h2>
          <p className="onboarding-body">
            Tell RecoMe what types of content you browse most. This helps us prioritize from day
            one.
          </p>
          <div className="onboarding-options">
            {CONTENT_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`onboarding-option like-option ${selectedContentTypes.has(opt.id) ? 'selected' : ''}`}
                onClick={() => toggleContentType(opt.id)}
              >
                <span className="onboarding-option-emoji">{opt.emoji}</span>
                <span className="onboarding-option-label">{opt.label}</span>
                {selectedContentTypes.has(opt.id) && (
                  <span className="onboarding-option-check">✓</span>
                )}
              </button>
            ))}
          </div>
          <div className="onboarding-nav">
            <button className="onboarding-btn ghost" onClick={() => setStep(4)}>
              ← Back
            </button>
            <button className="onboarding-btn primary" onClick={() => setStep(6)}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Cold-start — Browsing intensity */}
      {step === 6 && (
        <div className="onboarding-step">
          <h2 className="onboarding-title">How should RecoMe filter?</h2>
          <p className="onboarding-body">
            Choose how aggressively RecoMe should curate your feeds.
          </p>
          <div className="onboarding-options">
            {INTENSITY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`onboarding-option ${intensity === opt.id ? 'selected' : ''}`}
                onClick={() => setIntensity(opt.id)}
              >
                <span className="onboarding-option-emoji">{opt.emoji}</span>
                <div style={{ textAlign: 'left' }}>
                  <span className="onboarding-option-label">{opt.label}</span>
                  <div style={{ fontSize: '11px', opacity: 0.7, marginTop: 2 }}>{opt.desc}</div>
                </div>
                {intensity === opt.id && <span className="onboarding-option-check">✓</span>}
              </button>
            ))}
          </div>
          <div className="onboarding-nav">
            <button className="onboarding-btn ghost" onClick={() => setStep(5)}>
              ← Back
            </button>
            <button className="onboarding-btn primary" onClick={() => setStep(7)}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 7: Agent (skipped in replay) */}
      {step === 7 && !isReplay && (
        <div className="onboarding-step">
          <h2 className="onboarding-title">Your shopping companion</h2>
          <p className="onboarding-body">
            Open the Agent tab to chat with RecoMe about products, comparisons, and your
            preferences.
          </p>
          <div className="onboarding-features">
            <div className="onboarding-feature">
              <span className="onboarding-feature-icon">💬</span>
              <div>
                <strong>Ask anything</strong>
                <p>"Which should I buy?", "Why was this recommended?", or "Show my watchlist".</p>
              </div>
            </div>
            <div className="onboarding-feature">
              <span className="onboarding-feature-icon">⚖️</span>
              <div>
                <strong>Compare products</strong>
                <p>
                  The agent ranks products side-by-side using your stated preferences and history.
                </p>
              </div>
            </div>
            <div className="onboarding-feature">
              <span className="onboarding-feature-icon">🔒</span>
              <div>
                <strong>100% local</strong>
                <p>All your data stays on your device. Nothing is ever sent to a server.</p>
              </div>
            </div>
          </div>
          <div className="onboarding-nav">
            <button className="onboarding-btn ghost" onClick={() => setStep(6)}>
              ← Back
            </button>
            <button className="onboarding-btn primary" onClick={() => setStep(8)}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Final Step: All Set (step 8 in full flow, step 7 in replay when agent step is skipped) */}
      {(step === 8 || (isReplay && step === 7)) && (
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
                  .join(' · ') + '. RecoMe will start learning from your first browse.'
              : 'RecoMe will start learning from your very first browse.'}
          </p>
          <p className="onboarding-hint">
            💡 Click the RecoMe icon to check your dashboard, chat with the agent, or tweak your
            settings.
          </p>
          <button className="onboarding-btn primary" onClick={finish}>
            {isReplay ? 'Done' : 'Start browsing 🚀'}
          </button>
        </div>
      )}
    </div>
  );
}
