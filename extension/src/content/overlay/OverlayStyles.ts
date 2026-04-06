/**
 * OverlayStyles — CSS-in-JS injected into shadow DOM.
 * Keeps all overlay styles isolated from the host page.
 */

export function getOverlayStyles(theme: 'light' | 'dark'): string {
  const t = theme === 'dark' ? darkTokens : lightTokens;

  return `
    /* ── Reset inside shadow DOM ──────────────────────────────── */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: ${t.text};
      -webkit-font-smoothing: antialiased;
    }

    /* ── Pill (collapsed state) ───────────────────────────────── */
    .recome-pill {
      position: fixed;
      right: 60px;
      bottom: 80px;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: ${t.pillBg};
      border: 1.5px solid ${t.pillBorder};
      box-shadow: ${t.pillShadow};
      cursor: grab;
      transition: transform 180ms ease, box-shadow 180ms ease;
      user-select: none;
      -webkit-user-select: none;
    }

    .recome-pill:hover {
      transform: scale(1.08);
      box-shadow: ${t.pillShadowHover};
    }

    .recome-pill:active {
      cursor: grabbing;
    }

    .recome-pill-icon {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      pointer-events: none;
    }

    .recome-pill-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      min-width: 16px;
      height: 16px;
      border-radius: 8px;
      background: #ef4444;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      pointer-events: none;
    }

    .recome-pill-glow {
      animation: recome-glow 2s ease-in-out infinite;
    }

    @keyframes recome-glow {
      0%, 100% { box-shadow: ${t.pillShadow}; }
      50% { box-shadow: ${t.pillShadow}, 0 0 12px ${t.accentGlow}; }
    }

    /* ── Panel (expanded state) ───────────────────────────────── */
    .recome-panel {
      position: fixed;
      z-index: 2147483646;
      width: 380px;
      height: 520px;
      max-height: calc(100vh - 40px);
      border-radius: 16px;
      background: ${t.panelBg};
      border: 1px solid ${t.panelBorder};
      box-shadow: ${t.panelShadow};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: recome-panel-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes recome-panel-in {
      from { opacity: 0; transform: scale(0.92) translateY(8px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* ── Panel Header ────────────────────────────────────────── */
    .recome-panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid ${t.divider};
      cursor: grab;
      flex-shrink: 0;
    }

    .recome-panel-header:active {
      cursor: grabbing;
    }

    .recome-panel-logo {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .recome-panel-title {
      font-size: 13px;
      font-weight: 700;
      color: ${t.text};
      flex: 1;
    }

    .recome-panel-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      background: ${t.badgeBg};
      color: ${t.badgeText};
    }

    .recome-panel-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: ${t.textMuted};
      cursor: pointer;
      font-size: 16px;
      transition: background 120ms ease, color 120ms ease;
    }

    .recome-panel-btn:hover {
      background: ${t.btnHoverBg};
      color: ${t.text};
    }

    .recome-theme-toggle {
      font-size: 14px;
      line-height: 1;
    }

    /* ── Tab Navigation ──────────────────────────────────────── */
    .recome-tab-nav {
      display: flex;
      border-bottom: 1px solid ${t.divider};
      flex-shrink: 0;
    }

    .recome-tab-btn {
      flex: 1;
      padding: 8px 0;
      border: none;
      background: transparent;
      color: ${t.textMuted};
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: color 120ms ease, border-color 120ms ease;
      border-bottom: 2px solid transparent;
    }

    .recome-tab-btn:hover {
      color: ${t.text};
    }

    .recome-tab-btn.active {
      color: ${t.accent};
      border-bottom-color: ${t.accent};
    }

    .recome-tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
    }

    .recome-tab-content::-webkit-scrollbar {
      width: 4px;
    }
    .recome-tab-content::-webkit-scrollbar-thumb {
      background: ${t.scrollThumb};
      border-radius: 2px;
    }

    /* ── Responsive ───────────────────────────────────────────── */
    @media (max-width: 500px) {
      .recome-panel {
        width: calc(100vw - 20px);
        height: calc(100vh - 80px);
        border-radius: 12px;
      }
    }

    /* ── Reduced Motion ───────────────────────────────────────── */
    @media (prefers-reduced-motion: reduce) {
      .recome-panel,
      .recome-pill,
      .recome-pill-glow {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* ── Focus Visible ────────────────────────────────────────── */
    .recome-pill:focus-visible,
    .recome-panel-btn:focus-visible,
    .recome-tab-btn:focus-visible {
      outline: 2px solid ${t.accent};
      outline-offset: 2px;
    }

    /* ── Popup content wrapper ──────────────────────────────── */
    .recome-overlay-popup-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }

    .recome-overlay-popup-content::-webkit-scrollbar {
      width: 4px;
    }
    .recome-overlay-popup-content::-webkit-scrollbar-thumb {
      background: ${t.scrollThumb};
      border-radius: 2px;
    }

    .recome-overlay-popup-agent {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    ${getPopupComponentStyles(theme)}
  `;
}

// ── Design Tokens ─────────────────────────────────────────────────

interface Tokens {
  text: string;
  textMuted: string;
  accent: string;
  accentGlow: string;
  pillBg: string;
  pillBorder: string;
  pillShadow: string;
  pillShadowHover: string;
  panelBg: string;
  panelBorder: string;
  panelShadow: string;
  divider: string;
  badgeBg: string;
  badgeText: string;
  btnHoverBg: string;
  quickBtnBg: string;
  quickBtnBorder: string;
  quickBtnHoverBg: string;
  scrollThumb: string;
  userBubbleBg: string;
  userBubbleText: string;
  agentBubbleBg: string;
  agentBubbleText: string;
  codeBg: string;
  inputBg: string;
  inputBorder: string;
}

const darkTokens: Tokens = {
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  accent: '#6366f1',
  accentGlow: 'rgba(99,102,241,0.5)',
  pillBg: 'rgba(10,14,26,0.92)',
  pillBorder: 'rgba(99,102,241,0.45)',
  pillShadow: '0 4px 16px rgba(0,0,0,0.4)',
  pillShadowHover: '0 6px 24px rgba(0,0,0,0.5)',
  panelBg: 'rgba(8,11,22,0.97)',
  panelBorder: 'rgba(99,102,241,0.25)',
  panelShadow: '0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
  divider: 'rgba(99,102,241,0.12)',
  badgeBg: 'rgba(99,102,241,0.15)',
  badgeText: '#a5b4fc',
  btnHoverBg: 'rgba(99,102,241,0.12)',
  quickBtnBg: 'rgba(99,102,241,0.06)',
  quickBtnBorder: 'rgba(99,102,241,0.2)',
  quickBtnHoverBg: 'rgba(99,102,241,0.12)',
  scrollThumb: 'rgba(99,102,241,0.2)',
  userBubbleBg: 'rgba(99,102,241,0.2)',
  userBubbleText: '#e2e8f0',
  agentBubbleBg: 'rgba(30,41,59,0.8)',
  agentBubbleText: '#e2e8f0',
  codeBg: 'rgba(0,0,0,0.3)',
  inputBg: 'rgba(15,23,42,0.8)',
  inputBorder: 'rgba(99,102,241,0.2)',
};

/**
 * Returns the popup component CSS adapted for shadow DOM.
 * Maps popup.css variables and classes so popup components render correctly inside the overlay.
 */
function getPopupComponentStyles(theme: 'light' | 'dark'): string {
  const isLight = theme === 'light';

  // CSS custom properties that popup components rely on
  const vars = isLight
    ? `
      --bg: #f8f9fc;
      --surface: #ffffff;
      --surface2: #f0f2f8;
      --border: #e2e5ef;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --accent-active: #4338ca;
      --accent2: #8b5cf6;
      --accent3: #0891b2;
      --accent4: #059669;
      --accent6: #dc2626;
      --gradient-primary: linear-gradient(135deg, #6366f1, #8b5cf6);
      --shadow-glow: 0 0 20px rgba(99, 102, 241, 0.12);
      --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.06);
      --text: #1e293b;
      --text-dim: #475569;
      --text-muted: #94a3b8;
      --chip-red: #dc2626;
      --chip-red-bg: rgba(239, 68, 68, 0.12);
      --chip-red-border: rgba(239, 68, 68, 0.3);
      --chip-red-hover: #b91c1c;
      --chip-green-bg: rgba(5, 150, 105, 0.12);
      --chip-green-border: rgba(5, 150, 105, 0.3);
    `
    : `
      --bg: #0f1320;
      --surface: #1a2035;
      --surface2: #232b42;
      --border: rgba(99, 102, 241, 0.15);
      --accent: #818cf8;
      --accent-hover: #6366f1;
      --accent-active: #4f46e5;
      --accent2: #a78bfa;
      --accent3: #22d3ee;
      --accent4: #34d399;
      --accent6: #f87171;
      --gradient-primary: linear-gradient(135deg, #6366f1, #8b5cf6);
      --shadow-glow: 0 0 20px rgba(99, 102, 241, 0.25);
      --shadow-card: 0 1px 4px rgba(0, 0, 0, 0.3);
      --text: #f1f5f9;
      --text-dim: #94a3b8;
      --text-muted: #64748b;
      --chip-red: #fca5a5;
      --chip-red-bg: rgba(239, 68, 68, 0.15);
      --chip-red-border: rgba(239, 68, 68, 0.35);
      --chip-red-hover: #fff;
      --chip-green-bg: rgba(52, 211, 153, 0.15);
      --chip-green-border: rgba(52, 211, 153, 0.35);
    `;

  return `
    /* ── Popup CSS variables (for popup components in shadow DOM) ─── */
    :host {
      ${vars}
    }

    /* ── Stats Grid ──────────────────────────────────────────── */
    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 16px;
    }
    .stats-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      text-align: center;
      box-shadow: var(--shadow-card);
    }
    .stats-icon { font-size: 20px; margin-bottom: 4px; }
    .stats-value { font-size: 22px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
    .stats-label { font-size: 11px; color: var(--text-muted); }

    /* ── Section ─────────────────────────────────────────────── */
    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    /* ── Tab Status Bar ──────────────────────────────────────── */
    .tab-status-bar {
      display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: 10px;
      background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
      font-size: 11px; color: var(--text-dim);
    }
    .tab-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .tab-status-dot.active { background: var(--accent4); }
    .tab-status-dot.inactive { background: var(--text-muted); }
    .tab-status-platform { font-weight: 600; text-transform: capitalize; }
    .tab-status-cards { color: var(--text-muted); margin-left: auto; }
    .tab-status-reason { color: var(--text-muted); font-style: italic; margin-left: auto; }

    /* ── Dashboard ───────────────────────────────────────────── */
    .dashboard { }
    .dashboard-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 40px 0;
      color: var(--text-muted);
      font-size: 13px;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Getting started */
    .getting-started-card {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08));
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 12px;
      text-align: center;
    }
    .getting-started-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .getting-started-prefs { font-size: 11px; color: var(--accent); font-weight: 500; margin-bottom: 10px; }
    .getting-started-steps { display: flex; justify-content: center; gap: 8px; margin: 10px 0; }
    .getting-started-step { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); }
    .getting-started-step.done { color: var(--accent4); }
    .getting-started-step.done .step-icon { background: var(--accent4); color: #fff; }
    .getting-started-step.current { color: var(--accent); font-weight: 600; }
    .getting-started-step.current .step-icon { background: var(--accent); color: #fff; }
    .step-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%;
      font-size: 10px; font-weight: 700;
      background: var(--surface2); color: var(--text-muted);
    }
    .step-label { font-size: 11px; }
    .getting-started-hint { font-size: 11px; color: var(--text-muted); line-height: 1.4; margin: 8px 0; }
    .getting-started-btn {
      background: var(--gradient-primary); color: #fff; border: none; border-radius: 8px;
      padding: 8px 18px; font-size: 12px; font-weight: 600; cursor: pointer;
      font-family: inherit; transition: opacity 0.15s; margin-top: 4px;
    }
    .getting-started-btn:hover { opacity: 0.9; }

    /* Topic list */
    .blocked-topics { margin-bottom: 16px; }
    .topic-list { list-style: none; }
    .topic-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px;
    }
    .topic-item:last-child { border-bottom: none; }
    .topic-name { color: var(--text-dim); }
    .topic-count { color: var(--accent6); font-size: 11px; font-weight: 600; }

    /* Quick block / like */
    .quick-actions { margin-bottom: 8px; }
    .quick-block { display: flex; gap: 8px; }
    .block-input {
      flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
      padding: 8px 12px; font-size: 13px; color: var(--text); outline: none;
      transition: border-color 0.15s; font-family: inherit;
    }
    .block-input:focus { border-color: var(--accent); }
    .block-input::placeholder { color: var(--text-muted); }
    .block-btn {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
      padding: 8px 12px; font-size: 12px; color: var(--text); cursor: pointer;
      white-space: nowrap; transition: all 0.15s; font-family: inherit;
    }
    .block-btn:hover:not(:disabled) { border-color: var(--accent6); color: var(--accent6); }
    .block-btn:disabled { opacity: 0.4; cursor: default; }
    .like-btn:hover:not(:disabled) { border-color: var(--accent4); color: var(--accent4); }
    .like-input:focus { border-color: var(--accent4); }

    /* Current Focus */
    .focus-active {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px;
    }
    .focus-topic { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .focus-icon { font-size: 14px; flex-shrink: 0; }
    .focus-label { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .focus-age { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }

    /* Achievements */
    .achievements { margin-bottom: 12px; }
    .achievement-count { font-size: 10px; color: var(--text-muted); font-weight: 400; margin-left: 6px; }
    .achievement-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; }
    .achievement-badge {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      padding: 8px 4px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--surface); cursor: default; transition: transform 150ms ease;
    }
    .achievement-badge.unlocked { border-color: rgba(99, 102, 241, 0.4); background: rgba(99, 102, 241, 0.08); }
    .achievement-badge.unlocked:hover { transform: scale(1.04); }
    .achievement-badge.locked .achievement-icon { filter: grayscale(1); opacity: 0.45; }
    .achievement-badge.locked .achievement-label { opacity: 0.5; }
    .achievement-icon { font-size: 18px; line-height: 1; }
    .achievement-label { font-size: 9px; color: var(--text-dim); text-align: center; line-height: 1.2; }

    /* ── Settings Panel ──────────────────────────────────────── */
    .settings { display: flex; flex-direction: column; gap: 16px; }
    .settings-loading { padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px; }
    .setting-group {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 14px;
    }
    .setting-title {
      font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--text-muted); margin-bottom: 10px;
    }
    .setting-badge {
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--accent); color: #fff; font-size: 9px; font-weight: 700;
      min-width: 16px; height: 16px; border-radius: 8px; padding: 0 4px;
      vertical-align: middle; margin-left: 6px;
    }
    .setting-saving { font-size: 10px; color: var(--text-muted); font-weight: 400; margin-left: 8px; font-style: italic; }
    .setting-text { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
    .setting-btn {
      width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 14px; font-size: 13px; color: var(--text-dim); cursor: pointer;
      text-align: left; margin-bottom: 8px; transition: all 0.15s; font-family: inherit;
    }
    .setting-btn:last-child { margin-bottom: 0; }
    .setting-btn:hover { border-color: var(--accent); color: var(--text); }
    .setting-btn-danger:hover { border-color: var(--accent6); color: var(--accent6); }
    .setting-actions { display: flex; gap: 8px; align-items: stretch; }
    .setting-actions .setting-btn {
      flex: 1; width: auto; text-align: center; margin-bottom: 0; padding: 10px 12px;
      display: flex; align-items: center; justify-content: center;
    }

    /* Blocked / liked chips */
    .blocked-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .blocked-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: var(--chip-red-bg); border: 1px solid var(--chip-red-border); border-radius: 12px;
      padding: 3px 8px 3px 10px; font-size: 11px; color: var(--chip-red);
    }
    .blocked-chip-label { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .blocked-chip-remove {
      background: none; border: none; color: var(--chip-red); cursor: pointer;
      font-size: 14px; line-height: 1; padding: 0; display: flex; align-items: center; transition: color 0.15s;
    }
    .blocked-chip-remove:hover { color: var(--chip-red-hover); }
    .liked-chip { background: var(--chip-green-bg); border-color: var(--chip-green-border); color: var(--accent4); }
    .liked-chip .blocked-chip-remove { color: var(--accent4); }
    .liked-chip .blocked-chip-remove:hover { color: var(--accent-hover); }

    /* Topic search + collapse */
    .topic-search-input {
      width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px;
      background: var(--surface); color: var(--text); font-size: 11px; font-family: inherit;
      outline: none; margin-top: 6px; transition: border-color 0.15s;
    }
    .topic-search-input:focus { border-color: var(--accent); }
    .topic-search-input::placeholder { color: var(--text-muted); }
    .topic-show-more {
      display: block; width: 100%; padding: 5px 0; margin-top: 4px; background: none; border: none;
      color: var(--accent); font-size: 11px; font-weight: 500; cursor: pointer;
      font-family: inherit; text-align: center; transition: opacity 0.15s;
    }
    .topic-show-more:hover { opacity: 0.8; }

    /* Platform toggles */
    .platform-toggles { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
    .platform-toggle {
      display: flex; align-items: center; gap: 8px; padding: 6px 10px;
      background: var(--surface2); border: 1px solid var(--border); border-radius: 6px;
      cursor: pointer; transition: all 0.15s; width: 100%; text-align: left;
      font-family: inherit; font-size: 12px; color: var(--text);
    }
    .platform-toggle.off { opacity: 0.45; }
    .platform-toggle:hover { border-color: var(--accent); background: rgba(99, 102, 241, 0.08); opacity: 1; }
    .platform-toggle-icon { width: 18px; text-align: center; font-size: 13px; }
    .platform-toggle-name { flex: 1; text-transform: capitalize; }
    .platform-toggle-dot { width: 8px; height: 8px; border-radius: 50%; transition: background 0.15s; }
    .platform-toggle-dot.on { background: var(--accent4); }
    .platform-toggle-dot.off { background: var(--text-muted); }

    /* Aggressiveness slider */
    .slider-wrap { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
    .slider-label { font-size: 10px; color: var(--text-muted); width: 32px; flex-shrink: 0; }
    .slider-label:last-child { text-align: right; }
    .agr-slider {
      flex: 1; -webkit-appearance: none; height: 4px; border-radius: 2px;
      background: linear-gradient(to right, var(--accent4) 0%, var(--accent) 50%, var(--accent6) 100%);
      outline: none; cursor: pointer;
    }
    .agr-slider::-webkit-slider-thumb {
      -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
      background: #fff; border: 2px solid var(--accent); cursor: pointer;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
    }

    /* Train algo toggle */
    .train-algo-row { display: flex; align-items: flex-start; gap: 12px; justify-content: space-between; }
    .toggle-switch { position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; margin-top: 2px; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-slider {
      position: absolute; cursor: pointer; inset: 0; background: var(--border);
      border-radius: 11px; transition: background 200ms ease;
    }
    .toggle-slider::before {
      content: ''; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px;
      background: #fff; border-radius: 50%; transition: transform 200ms ease;
    }
    .toggle-switch input:checked + .toggle-slider { background: var(--accent); }
    .toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); }

    /* Context pills */
    .context-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .context-pill {
      padding: 4px 10px; border-radius: 12px; background: var(--surface2);
      border: 1px solid var(--border); color: var(--text-dim); font-size: 11px;
      cursor: pointer; transition: all 0.15s; font-family: inherit;
    }
    .context-pill:hover { border-color: var(--accent); color: var(--text); }
    .context-pill.active { background: rgba(99, 102, 241, 0.15); border-color: var(--accent); color: var(--accent); font-weight: 600; }

    /* LLM providers */
    .llm-providers { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .llm-provider-btn {
      display: flex; align-items: center; gap: 5px; padding: 8px 14px;
      background: var(--surface2); border: 1px solid var(--border); border-radius: 20px;
      color: var(--text-dim); font-size: 12px; font-weight: 500; cursor: pointer;
      transition: all 0.15s; font-family: inherit;
    }
    .llm-provider-btn:hover { border-color: var(--accent); color: var(--text); }
    .llm-provider-btn.active { background: rgba(99, 102, 241, 0.15); border-color: var(--accent); color: var(--accent); font-weight: 600; }
    .llm-provider-dot { width: 6px; height: 6px; background: var(--accent4); border-radius: 50%; flex-shrink: 0; }
    .api-key-model { font-size: 10px; color: var(--text-muted); margin-bottom: 4px; font-weight: 500; }
    .api-key-wrap { display: flex; gap: 8px; margin-top: 8px; }
    .api-key-input {
      flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px;
      padding: 6px 10px; font-size: 12px; color: var(--text);
      font-family: 'SF Mono', 'Fira Code', monospace; outline: none; transition: border-color 0.15s;
    }
    .api-key-input:focus { border-color: var(--accent); }
    .api-key-input::placeholder { color: var(--text-muted); font-family: inherit; }
    .api-key-status { font-size: 11px; color: var(--accent4); margin-top: 5px; font-weight: 500; }

    /* ── Onboarding ──────────────────────────────────────────── */
    .onboarding {
      display: flex; flex-direction: column; align-items: center;
      padding: 20px 20px 24px; min-height: 440px;
    }
    .onboarding-dots { display: flex; gap: 6px; margin-bottom: 24px; }
    .onboarding-dot {
      width: 6px; height: 6px; border-radius: 50%; background: var(--border);
      transition: background 200ms, width 200ms;
    }
    .onboarding-dot.active { background: var(--accent); width: 18px; border-radius: 3px; }
    .onboarding-dot.done { background: var(--accent4); }
    .onboarding-step {
      display: flex; flex-direction: column; align-items: center;
      width: 100%; gap: 12px; flex: 1;
    }
    .onboarding-hero { font-size: 48px; line-height: 1; margin-bottom: 4px; }
    .onboarding-hero-img { width: 72px; height: 72px; border-radius: 16px; margin-bottom: 4px; }
    .inline-logo { width: 14px; height: 14px; border-radius: 3px; vertical-align: -2px; }
    .onboarding-title { font-size: 18px; font-weight: 700; color: var(--text); text-align: center; }
    .onboarding-body { font-size: 13px; color: var(--text-dim); text-align: center; line-height: 1.5; }
    .onboarding-hint {
      font-size: 12px; color: var(--text-muted); text-align: center;
      background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 12px; width: 100%;
    }
    .onboarding-options { display: flex; flex-direction: column; gap: 6px; width: 100%; }
    .onboarding-option {
      display: flex; align-items: center; gap: 10px; padding: 12px 12px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--surface); color: var(--text-dim);
      font-size: 13px; min-height: 44px; cursor: pointer; text-align: left;
      transition: border-color 150ms, background 150ms; font-family: inherit;
    }
    .onboarding-option:hover { border-color: var(--accent); background: var(--surface2); }
    .onboarding-option.selected { border-color: var(--accent); background: rgba(99, 102, 241, 0.12); color: var(--text); }
    .onboarding-option.like-option.selected { border-color: var(--accent4); background: rgba(16, 185, 129, 0.12); }
    .onboarding-option-emoji { font-size: 16px; flex-shrink: 0; }
    .onboarding-option-label { flex: 1; }
    .onboarding-option-check { color: var(--accent4); font-weight: 700; }
    .onboarding-selected-hint { font-size: 11px; color: var(--accent4); align-self: flex-start; }
    .onboarding-selected-hint-green { color: var(--accent4); }
    .onboarding-custom { display: flex; gap: 6px; width: 100%; }
    .onboarding-custom-input {
      flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
      color: var(--text); font-size: 12px; padding: 7px 10px; outline: none; font-family: inherit;
    }
    .onboarding-custom-input:focus { border-color: var(--accent); }
    .onboarding-custom-add {
      background: var(--accent); color: #fff; border: none; border-radius: 6px;
      padding: 10px 14px; font-size: 12px; cursor: pointer; min-height: 44px; font-family: inherit;
    }
    .onboarding-nav {
      display: flex; justify-content: space-between; width: 100%;
      margin-top: auto; padding-top: 8px; gap: 8px;
    }
    .onboarding-btn {
      border-radius: 8px; font-size: 13px; font-weight: 600; padding: 10px 20px;
      cursor: pointer; border: none; transition: opacity 150ms, transform 100ms; font-family: inherit;
    }
    .onboarding-btn:active { transform: scale(0.97); }
    .onboarding-btn.primary { background: var(--accent); color: #fff; }
    .onboarding-nav .onboarding-btn.primary { flex: 1; }
    .onboarding-btn.primary:hover { opacity: 0.9; }
    .onboarding-btn.ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
    .onboarding-btn.ghost:hover { color: var(--text-dim); }

    /* Onboarding demo */
    .onboarding-demo { width: 100%; display: flex; flex-direction: column; gap: 12px; }
    .onboarding-demo-card {
      display: flex; align-items: center; gap: 10px; background: var(--surface);
      border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px;
    }
    .onboarding-demo-thumb { font-size: 24px; flex-shrink: 0; }
    .onboarding-demo-info { flex: 1; }
    .onboarding-demo-title { font-size: 12px; color: var(--text); }
    .onboarding-demo-creator { font-size: 10px; color: var(--text-muted); }
    .onboarding-demo-trigger {
      font-size: 11px; background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3); color: var(--accent);
      border-radius: 12px; padding: 4px 8px; white-space: nowrap;
    }
    .onboarding-how-list { list-style: none; display: flex; flex-direction: column; gap: 6px; padding: 0 2px; }
    .onboarding-how-list li { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-dim); }
    .onboarding-how-list li span { font-size: 15px; }

    /* Onboarding features */
    .onboarding-features { display: flex; flex-direction: column; gap: 10px; margin: 12px 0 8px; }
    .onboarding-feature {
      display: flex; gap: 10px; align-items: flex-start;
      background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px;
    }
    .onboarding-feature-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
    .onboarding-feature strong { display: block; font-size: 12px; color: var(--text); margin-bottom: 2px; }
    .onboarding-feature p { font-size: 11px; color: var(--text-dim); margin: 0; line-height: 1.4; }

    /* ── Agent Chat ──────────────────────────────────────────── */
    .agent-chat { display: flex; flex-direction: column; height: 100%; }
    .agent-messages {
      flex: 1; overflow-y: auto; padding: 12px 16px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .agent-messages::-webkit-scrollbar { width: 4px; }
    .agent-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
    .agent-welcome {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 24px 0 12px; text-align: center;
    }
    .agent-welcome-title { font-size: 15px; font-weight: 700; color: var(--text); }
    .agent-welcome-hint { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
    .agent-setup-card {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
      padding: 10px 12px; margin: 8px 0; text-align: left; width: 100%;
    }
    .agent-setup-title { font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
    .agent-setup-body { font-size: 11px; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px; }
    .agent-setup-providers { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .agent-provider-link {
      font-size: 10px; color: var(--accent); text-decoration: none;
      background: rgba(99, 102, 241, 0.08); padding: 3px 8px; border-radius: 10px;
      transition: background 0.15s;
    }
    .agent-provider-link:hover { background: rgba(99, 102, 241, 0.16); }
    .agent-setup-btn {
      background: var(--gradient-primary); color: #fff; border: none; border-radius: 8px;
      padding: 6px 14px; font-size: 11px; font-weight: 600; cursor: pointer;
      font-family: inherit; transition: opacity 0.15s; width: 100%;
    }
    .agent-setup-btn:hover { opacity: 0.9; }
    .agent-suggestions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 4px; }
    .agent-suggestion {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 14px;
      padding: 4px 10px; font-size: 11px; color: var(--text-dim); cursor: pointer;
      font-family: inherit; transition: all 0.15s;
    }
    .agent-suggestion:hover { border-color: var(--accent); color: var(--accent); }
    .agent-msg { max-width: 85%; animation: agent-msg-in 200ms ease; }
    @keyframes agent-msg-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .agent-msg-user { align-self: flex-end; }
    .agent-msg-agent { align-self: flex-start; }
    .agent-msg-user .agent-msg-content {
      background: var(--accent); color: #fff; border-radius: 12px 12px 2px 12px;
      padding: 8px 12px; font-size: 12px; line-height: 1.4;
    }
    .agent-msg-agent .agent-msg-content {
      background: var(--surface2); color: var(--text); border: 1px solid var(--border);
      border-radius: 12px 12px 12px 2px; padding: 8px 12px; font-size: 12px; line-height: 1.4;
    }
    .agent-msg-content p { margin: 0; }
    .agent-msg-content p + p { margin-top: 4px; }
    .agent-msg-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .agent-action-btn {
      background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 10px; padding: 3px 8px; font-size: 10px; color: var(--accent);
      cursor: pointer; font-family: inherit; transition: all 0.15s;
    }
    .agent-action-btn:hover { background: rgba(99, 102, 241, 0.2); color: var(--accent-hover); }
    .agent-typing {
      display: flex; gap: 4px; align-items: center; padding: 10px 14px !important;
    }
    .agent-thinking-text { font-size: 11px; color: var(--text-muted); margin-right: 6px; }
    .agent-typing-dots { display: inline-flex; gap: 3px; }
    .agent-typing-dots span {
      width: 5px; height: 5px; background: var(--text-muted); border-radius: 50%;
      animation: agent-dots 1.4s infinite ease-in-out;
    }
    .agent-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .agent-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes agent-dots {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }
    .agent-mode-badge { padding: 6px 12px; text-align: center; border-bottom: 1px solid var(--border); }
    .agent-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.3px; }
    .agent-badge-ai { background: linear-gradient(135deg, var(--accent), #8b5cf6); color: #fff; }
    .agent-badge-quick { background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); }
    .agent-followups { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 12px 10px; }
    .agent-followup-btn {
      background: var(--surface2); color: var(--accent); border: 1px solid var(--accent);
      border-radius: 14px; padding: 4px 12px; font-size: 11px; cursor: pointer;
      font-family: inherit; transition: all 0.15s; opacity: 0.85;
    }
    .agent-followup-btn:hover { background: var(--accent); color: #fff; opacity: 1; }
    .agent-msg-content code { background: var(--surface2); padding: 1px 4px; border-radius: 3px; font-size: 11px; }
    .agent-input-bar {
      display: flex; gap: 6px; padding: 8px 12px;
      border-top: 1px solid var(--border); background: var(--surface);
    }
    .agent-input {
      flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
      padding: 8px 10px; font-size: 12px; color: var(--text); outline: none;
      font-family: inherit; transition: border-color 0.15s;
    }
    .agent-input:focus { border-color: var(--accent); }
    .agent-input::placeholder { color: var(--text-muted); }
    .agent-send-btn {
      background: var(--accent); color: #fff; border: none; border-radius: 8px;
      padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
      font-family: inherit; transition: opacity 0.15s;
    }
    .agent-send-btn:hover { opacity: 0.9; }
    .agent-send-btn:disabled { opacity: 0.4; cursor: default; }

    /* ── Graph Summary ──────────────────────────────────────── */
    .graph-summary {
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      padding: 12px 14px; margin-bottom: 12px;
    }
    .graph-summary-header { display: flex; justify-content: space-between; align-items: center; user-select: none; }
    .graph-summary-toggle { font-size: 10px; color: var(--text-muted); }
    .graph-mini-stats { display: flex; gap: 16px; margin-top: 8px; }
    .graph-mini-stat { display: flex; flex-direction: column; align-items: center; }
    .graph-mini-value { font-size: 18px; font-weight: 700; color: var(--accent); line-height: 1.2; }
    .graph-mini-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .graph-expanded { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
    .graph-section { margin-bottom: 10px; }
    .graph-section-title { font-size: 11px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .graph-type-grid { display: flex; flex-wrap: wrap; gap: 4px; }
    .graph-type-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; background: var(--surface2); font-size: 11px; }
    .graph-type-icon {
      font-size: 9px; font-weight: 700; color: var(--accent); background: var(--bg); border-radius: 50%;
      width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center;
    }
    .graph-type-icon.small { width: 14px; height: 14px; font-size: 8px; }
    .graph-type-name { color: var(--text-dim); }
    .graph-type-count { color: var(--text-muted); font-weight: 600; }
    .graph-entity-list { list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .graph-entity-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .graph-entity-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
    .graph-entity-bar-wrap { width: 60px; height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; flex-shrink: 0; }
    .graph-entity-bar { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
    .graph-entity-bar.interest { background: var(--accent4); }
    .graph-entity-bar.block { background: var(--accent6); }
    .graph-entity-weight { font-size: 10px; color: var(--text-muted); width: 24px; text-align: right; flex-shrink: 0; }
    .graph-recent-list { display: flex; flex-direction: column; gap: 3px; }
    .graph-recent-item { display: flex; align-items: center; gap: 6px; font-size: 11px; }
    .graph-recent-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
    .graph-recent-time { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }

    /* ── Action History ──────────────────────────────────────── */
    .action-history {
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      padding: 12px 14px; margin-bottom: 12px;
    }
    .action-empty { font-size: 12px; color: var(--text-muted); padding: 8px 0; }
    .action-timeline { display: flex; flex-direction: column; gap: 2px; max-height: 280px; overflow-y: auto; }
    .action-item { padding: 6px 8px; border-radius: 6px; cursor: pointer; transition: background 0.15s; }
    .action-item:hover { background: var(--surface2); }
    .action-item.expanded { background: var(--surface2); }
    .action-item-header { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .action-icon { font-size: 12px; flex-shrink: 0; width: 16px; text-align: center; }
    .action-platform { font-size: 10px; flex-shrink: 0; width: 16px; text-align: center; color: var(--text-muted); }
    .action-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
    .action-time { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
    .action-details { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); font-size: 11px; }
    .action-detail-row { display: flex; gap: 8px; margin-bottom: 3px; }
    .action-detail-label { color: var(--text-muted); font-weight: 600; flex-shrink: 0; }
    .action-detail-value { color: var(--text); }
    .action-factors { margin-top: 4px; }
    .action-factor-list { list-style: none; margin-top: 3px; display: flex; flex-direction: column; gap: 2px; }
    .action-factor-item { display: flex; justify-content: space-between; align-items: center; padding: 2px 6px; background: var(--bg); border-radius: 4px; font-size: 10px; }
    .action-factor-name { color: var(--text-dim); }
    .action-factor-score { font-weight: 600; font-size: 10px; }

    /* ── Learning Progress ───────────────────────────────────── */
    .learning-progress {
      background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--accent);
      border-radius: 10px; padding: 12px 14px; margin-bottom: 12px;
    }
    .learning-bar-wrap { position: relative; height: 20px; background: var(--surface2); border-radius: 10px; overflow: hidden; margin: 8px 0; }
    .learning-bar-fill { height: 100%; background: var(--gradient-primary); border-radius: 10px; transition: width 0.5s ease; }
    .learning-bar-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 10px; font-weight: 600; color: var(--text); text-shadow: 0 0 4px var(--surface); }
    .learning-milestones { display: flex; flex-direction: column; gap: 3px; }
    .learning-milestone { display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 2px 0; }
    .learning-milestone.done { color: var(--accent4); }
    .learning-milestone.pending { color: var(--text-muted); }
    .learning-milestone-check { font-size: 12px; width: 16px; text-align: center; flex-shrink: 0; }
    .learning-milestone-label { flex: 1; }

    /* ── Agent Insights ──────────────────────────────────────── */
    .agent-insights { margin-bottom: 16px; }
    .agent-insights-count { font-size: 11px; font-weight: 400; color: var(--text-muted); margin-left: 8px; }
    .agent-insights-subtitle { font-size: 11px; color: var(--text-muted); margin: 4px 0 10px; }
    .agent-module-grid { display: flex; flex-direction: column; gap: 6px; }
    .agent-module-card {
      background: var(--surface2); border: 1px solid var(--border); border-left: 3px solid var(--accent);
      border-radius: 8px; overflow: hidden; transition: box-shadow 0.15s ease; color: var(--text);
    }
    .agent-module-card:hover { box-shadow: var(--shadow-card); }
    .agent-module-header {
      display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px;
      background: transparent; border: none; cursor: pointer; color: var(--text);
      font-size: 12px; font-family: inherit; text-align: left;
      -webkit-appearance: none; appearance: none;
    }
    .agent-module-icon { font-size: 16px; flex-shrink: 0; }
    .agent-module-info { flex: 1; display: flex; flex-direction: column; gap: 1px; }
    .agent-module-name { font-weight: 600; font-size: 12px; }
    .agent-module-stat { font-size: 10px; color: var(--text-muted); }
    .agent-module-chevron { font-size: 10px; color: var(--text-muted); transition: transform 0.15s ease; }
    .agent-module-chevron.open { transform: rotate(180deg); }
    .agent-module-body { padding: 0 10px 10px; border-top: 1px solid var(--border); }
    .agent-module-desc { font-size: 11px; color: var(--text-dim); margin-top: 8px; line-height: 1.4; }
    .agent-module-metrics { display: flex; gap: 16px; margin-top: 8px; }
    .agent-metric { display: flex; flex-direction: column; gap: 2px; }
    .agent-metric-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .agent-metric-value { font-size: 14px; font-weight: 600; color: var(--accent); }
    .agent-module-empty { font-size: 11px; color: var(--text-muted); margin-top: 8px; font-style: italic; }
    .agent-module-insights { margin-top: 8px; }
    .agent-insight-heading { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .agent-insight-item { display: flex; flex-direction: column; gap: 1px; margin-top: 4px; padding: 4px 6px; background: var(--surface); border-radius: 4px; }
    .agent-insight-title { font-size: 11px; font-weight: 500; color: var(--text); }
    .agent-insight-explanation { font-size: 10px; color: var(--text-muted); }

    /* ── Agent Chat Attribution ──────────────────────────────── */
    .agent-attribution { margin-bottom: 4px; }
    .agent-attribution-badge {
      display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 8px;
      background: rgba(99, 102, 241, 0.15); color: var(--accent); text-transform: uppercase; letter-spacing: 0.3px;
    }
    .factor-breakdown { margin-top: 6px; font-size: 11px; }
    .factor-breakdown summary { cursor: pointer; color: var(--text-muted); font-size: 10px; }
    .factor-breakdown summary:hover { color: var(--text-dim); }
    .factor-list { list-style: none; margin-top: 4px; display: flex; flex-direction: column; gap: 2px; }
    .factor-item { display: flex; justify-content: space-between; align-items: center; padding: 2px 6px; background: var(--surface2); border-radius: 4px; }
    .factor-name { color: var(--text-dim); font-size: 10px; }
    .factor-score { color: var(--accent); font-weight: 600; font-size: 10px; }
    .factor-explanation { font-size: 9px; color: var(--text-muted); }

    /* ── Cloud Sync ──────────────────────────────────────────── */
    .cloud-auth-form { display: flex; flex-direction: column; gap: 0; }
    .cloud-tabs { display: flex; gap: 0; margin-bottom: 10px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
    .cloud-tab { flex: 1; padding: 6px 0; background: transparent; border: none; color: var(--text-dim); font-size: 12px; cursor: pointer; font-family: inherit; transition: background 0.15s, color 0.15s; }
    .cloud-tab.active { background: var(--accent); color: #fff; }
    .cloud-input { display: block; width: 100%; padding: 7px 10px; margin-bottom: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface2); color: var(--text); font-size: 12px; box-sizing: border-box; font-family: inherit; }
    .cloud-input::placeholder { color: var(--text-muted); }
    .cloud-input:focus { outline: none; border-color: var(--accent); }
    .cloud-auth-form .setting-btn { margin-top: 4px; }
    .cloud-error { color: #ef4444; font-size: 11px; margin: 0 0 8px; }
    .cloud-account-connected .setting-text { margin-bottom: 8px; }
    .setting-badge-green { background: var(--accent4); }

    /* ── Taste Twin ──────────────────────────────────────────── */
    .twin-list, .twin-recs { margin-top: 10px; }
    .twin-list-heading { display: block; font-size: 11px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .twin-card { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; margin-bottom: 4px; background: var(--surface2); border-radius: 6px; border: 1px solid var(--border); }
    .twin-card-info { display: flex; flex-direction: column; gap: 2px; }
    .twin-card-score { font-size: 12px; font-weight: 600; color: var(--accent); }
    .twin-card-buckets { font-size: 10px; color: var(--text-muted); }
    .twin-card-actions { display: flex; gap: 4px; }
    .twin-card-actions .setting-btn { padding: 3px 8px; font-size: 10px; }
    .twin-rec-card { display: flex; align-items: flex-start; justify-content: space-between; padding: 8px 10px; margin-bottom: 4px; background: var(--surface2); border-radius: 6px; border: 1px solid var(--border); }
    .twin-rec-content { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .twin-rec-title { font-size: 12px; font-weight: 600; color: var(--text); }
    .twin-rec-body { font-size: 11px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .twin-rec-platform { font-size: 10px; color: var(--text-muted); }
    .twin-rec-dismiss { background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 0 4px; line-height: 1; flex-shrink: 0; }
    .twin-rec-dismiss:hover { color: var(--text); }

    /* ── Generic focus visible ──────────────────────────────── */
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `;
}

const lightTokens: Tokens = {
  text: '#1e293b',
  textMuted: '#64748b',
  accent: '#6366f1',
  accentGlow: 'rgba(99,102,241,0.4)',
  pillBg: 'rgba(255,255,255,0.95)',
  pillBorder: 'rgba(99,102,241,0.35)',
  pillShadow: '0 4px 16px rgba(0,0,0,0.12)',
  pillShadowHover: '0 6px 24px rgba(0,0,0,0.18)',
  panelBg: 'rgba(255,255,255,0.98)',
  panelBorder: 'rgba(99,102,241,0.2)',
  panelShadow: '0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
  divider: 'rgba(99,102,241,0.1)',
  badgeBg: 'rgba(99,102,241,0.1)',
  badgeText: '#6366f1',
  btnHoverBg: 'rgba(99,102,241,0.08)',
  quickBtnBg: 'rgba(99,102,241,0.04)',
  quickBtnBorder: 'rgba(99,102,241,0.15)',
  quickBtnHoverBg: 'rgba(99,102,241,0.08)',
  scrollThumb: 'rgba(99,102,241,0.15)',
  userBubbleBg: 'rgba(99,102,241,0.12)',
  userBubbleText: '#1e293b',
  agentBubbleBg: 'rgba(241,245,249,0.9)',
  agentBubbleText: '#1e293b',
  codeBg: 'rgba(0,0,0,0.06)',
  inputBg: 'rgba(241,245,249,0.8)',
  inputBorder: 'rgba(99,102,241,0.2)',
};
