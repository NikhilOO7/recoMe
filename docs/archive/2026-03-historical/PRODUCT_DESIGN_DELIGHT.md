# RecoMe Product Design & Delight Guide

> Creating moments of delight while giving users control over their feeds.

---

## Design Philosophy

### Core Principles

| Principle                    | Description                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| **Invisible Until Needed**   | RecoMe works silently. The best interaction is no interaction. |
| **Instant Gratification**    | Actions result in immediate, satisfying feedback.              |
| **Transparent Intelligence** | Users always know WHY something was hidden or shown.           |
| **Respectful of Attention**  | Minimal UI footprint. Never interrupt. Never nag.              |
| **Delightfully Human**       | Warm copy, playful animations, small surprises.                |

### Emotional Design Goals

| Moment            | Desired Emotion      | Design Response                         |
| ----------------- | -------------------- | --------------------------------------- |
| First install     | Curiosity, hope      | Welcoming animation, clean feed promise |
| First hide        | Satisfaction, power  | "Poof" animation, celebratory copy      |
| Seeing clean feed | Calm, control        | Subtle work-done indicator              |
| Opening popup     | Informed, proud      | Progress visualization                  |
| Pattern discovery | Surprised, impressed | "RecoMe learned!" celebration           |
| Milestone reached | Accomplished         | Confetti, badge unlock                  |

---

## Brand Identity

### Voice & Tone

**Personality**: Friendly, smart, playful, confident—but never cheesy, condescending, childish, or arrogant.

**Copy Examples**:

| ✅ Good                       | ❌ Bad                      |
| ----------------------------- | --------------------------- |
| "Gone forever ✨"             | "Content blocked"           |
| "RecoMe learned something!"   | "Pattern detected"          |
| "Your feed, your rules"       | "Recommendation filtered"   |
| "Taking out the trash"        | "Removing unwanted content" |
| "That's 47 annoyances dodged" | "47 items hidden"           |

### Logo Concept

```
PRIMARY MARK:          ICON:
╭──────╮               ┌───┐
│ Reco │               │✓✗ │  Checkmark crossing out X
│  Me  │               └───┘  Choose what you want
╰──────╯
```

---

## Visual Design System

### Color Palette

```css
/* Primary */
--primary-500: #6366F1;     /* Indigo - brand */
--primary-400: #818CF8;     /* Hover */
--primary-600: #4F46E5;     /* Active */

/* Semantic */
--success: #10B981;         /* Green - positive */
--warning: #F59E0B;         /* Amber - caution */
--danger: #EF4444;          /* Red - destructive */
--info: #3B82F6;            /* Blue - info */

/* Neutrals */
--gray-50 to --gray-900     /* Full grayscale */

/* Special */
--gradient-primary: linear-gradient(135deg, #6366F1, #8B5CF6);
--shadow-glow: 0 0 20px rgba(99, 102, 241, 0.3);
```

### Typography

```css
--font-sans: 'Inter', system-ui, sans-serif;
--text-xs: 0.75rem; /* 12px */
--text-sm: 0.875rem; /* 14px */
--text-base: 1rem; /* 16px */
--text-xl: 1.25rem; /* 20px */
--text-2xl: 1.5rem; /* 24px */
```

### Spacing

```css
--space-1: 0.25rem; /* 4px */
--space-2: 0.5rem; /* 8px */
--space-4: 1rem; /* 16px */
--space-6: 1.5rem; /* 24px */
--radius-lg: 0.5rem; /* 8px */
--popup-width: 380px;
```

---

## Interaction Patterns

### Feedback Buttons (Injected UI)

```
VIDEO THUMBNAIL
┌─────────────────┐  ┌─────────────┐
│                 │  │ 👍 👎 ⏱️  │ ← Appears on hover
│   [Thumbnail]   │  │             │   Semi-transparent
│                 │  │             │   48px wide
└─────────────────┘  └─────────────┘
Video Title
Creator • Views

Button States:
  Normal  → Gray icon, subtle bg
  Hover   → Color change, scale 1.05x
  Active  → Filled icon, depression
  Selected → Filled with color
```

### Hide Animation Sequence

```
0ms:   Click 👎 → Button fills red
100ms: Scale 0.95, opacity 0.7
200ms: Scale 0.9, opacity 0.4
300ms: Height collapsing, opacity 0.1
400ms: Gone + Toast: "Gone forever ✨ [Undo]"
```

### Intent Clarification (on hover hold)

```
┌─────────────────────────────────┐
│ What's the issue?               │
│                                 │
│ 🚫 Never show this topic        │
│ 👤 Not this creator             │
│ ⏱️ Just not right now           │
└─────────────────────────────────┘
```

---

## Animations

### CSS Keyframes

```css
/* Fade In Up - toasts */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Scale Pop - buttons */
@keyframes scalePop {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}

/* Collapse Height - hide items */
@keyframes collapseHeight {
  from {
    max-height: var(--item-height);
    opacity: 0.3;
  }
  to {
    max-height: 0;
    opacity: 0;
    padding: 0;
  }
}

/* Confetti - milestones */
@keyframes confettiBurst {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(-200px) rotate(720deg);
    opacity: 0;
  }
}
```

### Timing Guidelines

| Action       | Duration | Easing            |
| ------------ | -------- | ----------------- |
| Button hover | 150ms    | ease-out          |
| Button click | 200ms    | spring            |
| Toast appear | 300ms    | ease-out-expo     |
| Content hide | 400ms    | ease-in-out-quart |
| Confetti     | 1000ms   | ease-out          |

---

## Delight Moments

### Achievement System

**First Steps:**

- 🎯 "First Block" - Block your first topic
- ✨ "Clean Start" - Hide 10 items
- 🎓 "Quick Learner" - First pattern created

**Growing:**

- 💯 "Clean Sweep" - Hide 100 items
- 🧠 "Mind Reader" - 10 patterns created
- 🎯 "Laser Focus" - Block 5 topics

**Mastery:**

- 🏆 "Feed Master" - Hide 1,000 items
- ⚡ "Power User" - Active for 30 days

**Secret:**

- 🦄 "Unicorn" - Found an Easter egg
- 🎉 "Party Time" - Block 10 items in 1 minute

### Milestone Celebrations

```javascript
const MILESTONES = [
  { count: 10, emoji: '🎉', message: "You're on a roll!" },
  { count: 100, emoji: '💯', message: 'Triple digits! Impressive!' },
  { count: 500, emoji: '🚀', message: 'Half a thousand banished!' },
  { count: 1000, emoji: '🏆', message: 'Feed Master achieved!' },
];
```

---

## Toast Notifications

### Types

```
SUCCESS:  ┌─ ✨ Gone forever           [Undo] ─┐
INFO:     ┌─ 💡 RecoMe learned: blocks crypto ─┐
ACHIEVE:  ┌─ 🏆 Clean Sweep unlocked!   [View] ─┐
MILESTONE:┌─ 🎉 100 items hidden! On fire!     ─┐
```

### Behavior

- Position: Bottom-right, 16px from edges
- Stack: Upward if multiple
- Auto-dismiss: 4s (achievements: 6s)
- Pause on hover

---

## Onboarding Flow

### Step 1: Welcome

```
        ╭──────╮
        │RecoMe│
        ╰──────╯
   Your feed, your rules.

   [Let's get started]
        ○ ○ ○ ○
```

### Step 2: Quick Blocks

```
What would you rather not see?

☐ 💰 Cryptocurrency / NFTs
☐ 🎰 Gambling / Betting
☐ 😱 Clickbait / Drama
☐ 🎮 Gaming content

[+ Add your own...]

Skip ───────────── Next
        ● ○ ○ ○
```

### Step 3: How It Works

```
   [Thumbnail]    👍 👎 ⏱️

   👍 More like this
   👎 Never show this
   ⏱️ Not right now

Back ───────────── Next
        ○ ● ○ ○
```

### Step 4: All Set

```
          🎉
     You're all set!

💡 Click RecoMe icon to
   see stats & preferences

   [Start browsing 🚀]
        ○ ○ ○ ●
```

---

## Popup UI Design

### Dashboard

```
┌─────────────────────────────────────┐
│ ╭RecoMe╮                        ⚙️ │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │    🎯 247 items hidden        │  │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  │  │
│  │       67% cleaner feed        │  │
│  │  This week: +34 • 2 patterns  │  │
│  └───────────────────────────────┘  │
│                                     │
│  BLOCKED TOPICS               [+]   │
│  ┌───────────────────────────────┐  │
│  │ 💰 crypto                  ✕  │  │
│  │ 🎰 gambling                ✕  │  │
│  │ 😱 clickbait               ✕  │  │
│  └───────────────────────────────┘  │
│                                     │
│  RECENT PATTERNS            [View]  │
│  ┌───────────────────────────────┐  │
│  │ 🧠 "Blocks crypto"      95%   │  │
│  │ 🧠 "Likes cameras"      85%   │  │
│  └───────────────────────────────┘  │
│                                     │
│  Context: 🏠 Entertainment [Switch] │
└─────────────────────────────────────┘
```

---

## Accessibility

### Requirements (WCAG 2.1 AA)

| Requirement    | Standard               |
| -------------- | ---------------------- |
| Text contrast  | 4.5:1 minimum          |
| Large text     | 3:1 minimum            |
| UI components  | 3:1 minimum            |
| Touch targets  | 44×44px minimum        |
| Focus visible  | 2px outline            |
| Screen readers | aria-labels            |
| Motion         | prefers-reduced-motion |

### CSS

```css
:focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
  }
}
```

---

## Implementation Checklist

### Phase 1: Core UI

- [ ] Design tokens
- [ ] Button component
- [ ] Toast component
- [ ] Feedback buttons
- [ ] Hide animation

### Phase 2: Popup

- [ ] Dashboard layout
- [ ] Stats card
- [ ] Preference list
- [ ] Settings panel
- [ ] Context switcher

### Phase 3: Delight

- [ ] Achievement system
- [ ] Milestones
- [ ] Onboarding
- [ ] Easter eggs

### Phase 4: Polish

- [ ] Accessibility audit
- [ ] Dark mode
- [ ] Animation refinement
- [ ] Performance

---

**Design with delight, build with care! ✨**
