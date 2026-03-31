import { createRoot, type Root } from 'react-dom/client';
import { StrictMode } from 'react';
import { OverlayChat } from './OverlayChat';
import { OverlayManager } from './OverlayManager';
import { getOverlayStyles } from './OverlayStyles';
import { createLogger } from '@shared/Logger';

const log = createLogger('FloatingOverlay');

/**
 * FloatingOverlay — injects a Shadow DOM–isolated overlay into the page.
 *
 * Contains:
 *  - A draggable pill icon (collapsed state)
 *  - An expandable chat panel (expanded state)
 *  - React mounted inside the shadow root
 */
export class FloatingOverlay {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private root: Root | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private manager: OverlayManager;
  private theme: 'light' | 'dark' = 'dark';
  private pillEl: HTMLElement | null = null;
  private panelEl: HTMLElement | null = null;
  private insightCount = 0;
  private destroyed = false;

  private getCandidates: (() => unknown[]) | undefined;

  constructor(private readonly platform: string) {
    this.manager = new OverlayManager();
  }

  /** Set a callback that extracts product candidates from the current page DOM */
  setGetCandidates(fn: () => unknown[]): void {
    this.getCandidates = fn;
  }

  async inject(): Promise<void> {
    if (this.destroyed) return;

    // Load theme preference
    try {
      const r = await chrome.storage.local.get('recome_theme');
      const saved = r['recome_theme'] as string | undefined;
      if (saved === 'light' || saved === 'dark') this.theme = saved;
    } catch (e) {
      log.debug('Could not load theme preference', e);
    }

    // Check if overlay is enabled in settings
    try {
      const r = await chrome.storage.sync.get('recome_settings');
      const settings = r['recome_settings'] as { overlay_enabled?: boolean } | undefined;
      if (settings?.overlay_enabled === false) {
        log.info('Overlay disabled in settings');
        return;
      }
    } catch (e) {
      log.debug('Could not read overlay settings — defaulting to enabled', e);
    }

    // Create host element
    this.host = document.createElement('div');
    this.host.id = 'recome-overlay-host';
    this.host.style.cssText =
      'all: initial; position: fixed; z-index: 2147483646; pointer-events: none;';
    document.body.appendChild(this.host);

    // Attach shadow DOM
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    // Inject styles
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = getOverlayStyles(this.theme);
    this.shadow.appendChild(this.styleEl);

    // Create pill element
    this.pillEl = document.createElement('div');
    this.pillEl.className = 'recome-pill';
    this.pillEl.setAttribute('role', 'button');
    this.pillEl.setAttribute('aria-label', 'Open RecoMe overlay');
    this.pillEl.setAttribute('tabindex', '0');
    this.pillEl.style.pointerEvents = 'auto';
    this.pillEl.innerHTML = `
      <img class="recome-pill-icon" src="${chrome.runtime.getURL('icons/recome_logo_48.png')}" alt="RecoMe" />
    `;
    this.shadow.appendChild(this.pillEl);

    // Create panel element
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'recome-panel';
    this.panelEl.style.pointerEvents = 'auto';
    this.panelEl.style.display = 'none';
    this.shadow.appendChild(this.panelEl);

    // Mount React into panel
    const reactContainer = document.createElement('div');
    reactContainer.style.cssText = 'display:flex;flex-direction:column;height:100%;';
    this.panelEl.appendChild(reactContainer);

    this.root = createRoot(reactContainer);
    this.renderChat();

    // Initialize the overlay manager
    await this.manager.init(this.pillEl, this.panelEl, () => this.renderChat());

    // Wire panel drag after React renders the header
    requestAnimationFrame(() => {
      const headerEl = this.panelEl?.querySelector('.recome-panel-header') as HTMLElement | null;
      if (headerEl) {
        this.manager.setupPanelDrag(headerEl);
      }
    });

    // Listen for insight notifications
    this.setupInsightListener();

    // Listen for theme changes from popup or other contexts
    this.setupThemeListener();

    log.info('Floating overlay injected');
  }

  destroy(): void {
    this.destroyed = true;
    this.manager.destroy();
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.styleEl = null;
    this.pillEl = null;
    this.panelEl = null;
  }

  /** Programmatically toggle (for keyboard shortcut from content script) */
  toggle(): void {
    this.manager.toggle();
  }

  /**
   * Called on SPA navigation — re-renders with fresh page context (URL, title)
   * and optionally rebinds the adapter's candidate extractor.
   */
  onNavigate(getCandidates?: () => unknown[]): void {
    if (this.destroyed) return;
    if (getCandidates) this.getCandidates = getCandidates;
    this.renderChat();
  }

  /** Update the insight badge count */
  setInsightCount(count: number): void {
    this.insightCount = count;
    this.updateBadge();
  }

  private toggleTheme = (): void => {
    const next: 'light' | 'dark' = this.theme === 'light' ? 'dark' : 'light';
    this.applyTheme(next);
    chrome.storage.local.set({ recome_theme: next }).catch(() => undefined);
  };

  private applyTheme(newTheme: 'light' | 'dark'): void {
    if (newTheme === this.theme) return;
    this.theme = newTheme;
    // Re-inject styles with new theme
    if (this.styleEl) {
      this.styleEl.textContent = getOverlayStyles(this.theme);
    }
    this.renderChat();
  }

  private renderChat(): void {
    if (!this.root || this.destroyed) return;

    const pageContext = {
      url: location.href,
      platform: this.platform,
      title: document.title,
    };

    this.root.render(
      <StrictMode>
        <OverlayChat
          onClose={() => this.manager.collapse()}
          pageContext={pageContext}
          getCandidates={this.getCandidates}
          theme={this.theme}
          onToggleTheme={this.toggleTheme}
        />
      </StrictMode>,
    );
  }

  private updateBadge(): void {
    if (!this.pillEl) return;

    // Remove existing badge
    const existing = this.pillEl.querySelector('.recome-pill-badge');
    if (existing) existing.remove();

    if (this.insightCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'recome-pill-badge';
      badge.textContent = String(this.insightCount);
      this.pillEl.appendChild(badge);
      this.pillEl.classList.add('recome-pill-glow');
    } else {
      this.pillEl.classList.remove('recome-pill-glow');
    }
  }

  private setupInsightListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: { type: string; payload?: { count?: number } }) => {
        if (message.type === 'INSIGHT_AVAILABLE' && message.payload?.count) {
          this.setInsightCount(message.payload.count);
        }
      },
    );
  }

  private setupThemeListener(): void {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes['recome_theme']) {
          const newTheme = changes['recome_theme'].newValue as string | undefined;
          if (newTheme === 'light' || newTheme === 'dark') {
            this.applyTheme(newTheme);
          }
        }
      });
    } catch (e) {
      log.debug('Could not set up theme change listener', e);
    }
  }
}
