import { createLogger } from '@shared/Logger';

const log = createLogger('OverlayManager');

/** Position stored per-domain in chrome.storage.local */
export interface PillPosition {
  x: number;
  y: number;
}

type OverlayState = 'collapsed' | 'expanded';

const STORAGE_KEY_PREFIX = 'recome_pill_pos_';
const DEFAULT_POSITION: PillPosition = { x: -60, y: -80 }; // offset from bottom-right

/**
 * OverlayManager — manages overlay lifecycle, positioning, and drag behavior.
 *
 * Coordinates between the pill (collapsed) and panel (expanded) states.
 * Persists pill position per-domain.
 */
export class OverlayManager {
  private state: OverlayState = 'collapsed';
  private position: PillPosition = { ...DEFAULT_POSITION };
  private readonly domain: string;
  private pillElement: HTMLElement | null = null;
  private panelElement: HTMLElement | null = null;
  private dragState: DragState | null = null;
  private onStateChange: ((state: OverlayState) => void) | null = null;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private videoObserver: MutationObserver | null = null;
  private isVideoPlaying = false;

  constructor() {
    this.domain = location.hostname.replace(/^www\./, '');
  }

  /** Initialize: load persisted position, set up keyboard shortcut */
  async init(
    pillEl: HTMLElement,
    panelEl: HTMLElement,
    onStateChange: (state: OverlayState) => void,
  ): Promise<void> {
    this.pillElement = pillEl;
    this.panelElement = panelEl;
    this.onStateChange = onStateChange;

    await this.loadPosition();
    this.applyPillPosition();
    this.setupDrag();
    this.setupKeyboardShortcut();
    this.setupVideoDetection();
    this.updateVisibility();

    log.info(`Overlay initialized for ${this.domain}`);
  }

  destroy(): void {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
    if (this.videoObserver) {
      this.videoObserver.disconnect();
      this.videoObserver = null;
    }
    this.pillElement = null;
    this.panelElement = null;
    this.onStateChange = null;
  }

  getState(): OverlayState {
    return this.state;
  }

  toggle(): void {
    if (this.state === 'collapsed') {
      this.expand();
    } else {
      this.collapse();
    }
  }

  expand(): void {
    // Position panel BEFORE hiding pill, so getBoundingClientRect() returns correct values
    this.positionPanel();
    this.state = 'expanded';
    this.updateVisibility();
    this.onStateChange?.('expanded');
  }

  collapse(): void {
    this.state = 'collapsed';
    this.updateVisibility();
    this.onStateChange?.('collapsed');
  }

  // ── Position Management ──────────────────────────────────────────

  private async loadPosition(): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${this.domain}`;
      const result = await chrome.storage.local.get(key);
      const saved = result[key] as PillPosition | undefined;
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        this.position = saved;
      }
    } catch {
      // Use default position
    }
  }

  private async savePosition(): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${this.domain}`;
      await chrome.storage.local.set({ [key]: this.position });
    } catch {
      // Non-critical
    }
  }

  private applyPillPosition(): void {
    if (!this.pillElement) return;

    // Convert negative offsets (from bottom-right) to CSS
    const pill = this.pillElement;
    if (this.position.x < 0) {
      pill.style.right = `${Math.abs(this.position.x)}px`;
      pill.style.left = 'auto';
    } else {
      pill.style.left = `${this.position.x}px`;
      pill.style.right = 'auto';
    }
    if (this.position.y < 0) {
      pill.style.bottom = `${Math.abs(this.position.y)}px`;
      pill.style.top = 'auto';
    } else {
      pill.style.top = `${this.position.y}px`;
      pill.style.bottom = 'auto';
    }
  }

  private positionPanel(): void {
    if (!this.panelElement || !this.pillElement) return;

    const pill = this.pillElement.getBoundingClientRect();
    const panelW = 380;
    const panelH = 520;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Default: anchor panel above-left of pill
    let left = pill.right - panelW;
    let top = pill.top - panelH - margin;

    // If too far left, anchor to right of pill
    if (left < margin) {
      left = pill.left;
    }
    // If too far right, clamp
    if (left + panelW > vw - margin) {
      left = vw - panelW - margin;
    }
    // If too far up, position below pill
    if (top < margin) {
      top = pill.bottom + margin;
    }
    // If too far down, clamp
    if (top + panelH > vh - margin) {
      top = vh - panelH - margin;
    }

    this.panelElement.style.left = `${left}px`;
    this.panelElement.style.top = `${top}px`;
  }

  private updateVisibility(): void {
    if (this.pillElement) {
      this.pillElement.style.display =
        this.state === 'collapsed' && !this.isVideoPlaying ? '' : 'none';
    }
    if (this.panelElement) {
      this.panelElement.style.display =
        this.state === 'expanded' && !this.isVideoPlaying ? '' : 'none';
    }
  }

  // ── Drag & Drop ──────────────────────────────────────────────────

  private setupDrag(): void {
    if (!this.pillElement) return;

    this.pillElement.addEventListener('mousedown', this.onDragStart);
    this.pillElement.addEventListener('click', this.onPillClick);
  }

  /** Attach panel drag handler to the panel header element */
  setupPanelDrag(headerEl: HTMLElement): void {
    headerEl.addEventListener('mousedown', this.onPanelDragStart);
  }

  private panelDragState: {
    startX: number;
    startY: number;
    panelStartX: number;
    panelStartY: number;
  } | null = null;

  private onPanelDragStart = (e: MouseEvent): void => {
    if (e.button !== 0 || !this.panelElement) return;
    const rect = this.panelElement.getBoundingClientRect();
    this.panelDragState = {
      startX: e.clientX,
      startY: e.clientY,
      panelStartX: rect.left,
      panelStartY: rect.top,
    };
    document.addEventListener('mousemove', this.onPanelDragMove);
    document.addEventListener('mouseup', this.onPanelDragEnd);
    e.preventDefault();
  };

  private onPanelDragMove = (e: MouseEvent): void => {
    if (!this.panelDragState || !this.panelElement) return;
    const dx = e.clientX - this.panelDragState.startX;
    const dy = e.clientY - this.panelDragState.startY;

    const newX = this.panelDragState.panelStartX + dx;
    const newY = this.panelDragState.panelStartY + dy;
    const maxX = window.innerWidth - 380;
    const maxY = window.innerHeight - 100;
    this.panelElement.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
    this.panelElement.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
    this.panelElement.style.right = 'auto';
    this.panelElement.style.bottom = 'auto';
  };

  private onPanelDragEnd = (): void => {
    document.removeEventListener('mousemove', this.onPanelDragMove);
    document.removeEventListener('mouseup', this.onPanelDragEnd);
    this.panelDragState = null;
  };

  private onDragStart = (e: MouseEvent): void => {
    if (e.button !== 0 || !this.pillElement) return;

    const rect = this.pillElement.getBoundingClientRect();
    this.dragState = {
      startX: e.clientX,
      startY: e.clientY,
      pillStartX: rect.left,
      pillStartY: rect.top,
      moved: false,
    };

    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragEnd);
    e.preventDefault();
  };

  private onDragMove = (e: MouseEvent): void => {
    if (!this.dragState || !this.pillElement) return;

    const dx = e.clientX - this.dragState.startX;
    const dy = e.clientY - this.dragState.startY;

    if (!this.dragState.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    this.dragState.moved = true;

    const newX = this.dragState.pillStartX + dx;
    const newY = this.dragState.pillStartY + dy;

    // Clamp to viewport
    const maxX = window.innerWidth - 44;
    const maxY = window.innerHeight - 44;
    const clampedX = Math.max(0, Math.min(newX, maxX));
    const clampedY = Math.max(0, Math.min(newY, maxY));

    this.pillElement.style.left = `${clampedX}px`;
    this.pillElement.style.top = `${clampedY}px`;
    this.pillElement.style.right = 'auto';
    this.pillElement.style.bottom = 'auto';
  };

  private onDragEnd = (e: MouseEvent): void => {
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);

    if (!this.dragState || !this.pillElement) {
      this.dragState = null;
      return;
    }

    if (this.dragState.moved) {
      // Snap to nearest edge
      const rect = this.pillElement.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const centerX = rect.left + 22;
      const centerY = rect.top + 22;

      // Determine nearest horizontal edge
      if (centerX < vw / 2) {
        this.position.x = Math.max(12, rect.left);
      } else {
        this.position.x = -(vw - rect.right);
        if (this.position.x > -12) this.position.x = -12;
      }

      // Determine nearest vertical edge
      if (centerY < vh / 2) {
        this.position.y = Math.max(12, rect.top);
      } else {
        this.position.y = -(vh - rect.bottom);
        if (this.position.y > -12) this.position.y = -12;
      }

      this.applyPillPosition();
      this.savePosition();

      // Prevent the click handler from firing after drag
      e.preventDefault();
      e.stopPropagation();
    }

    this.dragState = null;
  };

  private onPillClick = (_e: MouseEvent): void => {
    // Don't toggle if we just finished dragging
    if (this.dragState?.moved) return;
    this.toggle();
  };

  // ── Keyboard Shortcut ────────────────────────────────────────────

  private setupKeyboardShortcut(): void {
    this.keyboardHandler = (e: KeyboardEvent) => {
      // Alt+R to toggle overlay
      if (e.altKey && e.key === 'r') {
        e.preventDefault();
        this.toggle();
      }
      // Escape to collapse when expanded
      if (e.key === 'Escape' && this.state === 'expanded') {
        this.collapse();
      }
    };
    document.addEventListener('keydown', this.keyboardHandler);
  }

  // ── Video Detection ──────────────────────────────────────────────

  private setupVideoDetection(): void {
    const checkVideo = () => {
      const videos = document.querySelectorAll('video');
      let playing = false;
      for (const v of videos) {
        if (!v.paused && isFullscreenLike(v)) {
          playing = true;
          break;
        }
      }
      if (playing !== this.isVideoPlaying) {
        this.isVideoPlaying = playing;
        this.updateVisibility();
        log.debug(`Video playing state: ${playing}`);
      }
    };

    // Check periodically and on fullscreen change
    document.addEventListener('fullscreenchange', checkVideo);
    document.addEventListener('webkitfullscreenchange', checkVideo);

    // Also watch for new video elements
    this.videoObserver = new MutationObserver(() => checkVideo());
    this.videoObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function isFullscreenLike(video: HTMLVideoElement): boolean {
  // Check actual fullscreen API
  if (document.fullscreenElement === video || document.fullscreenElement?.contains(video)) {
    return true;
  }
  // Check if video covers most of the viewport (theater mode)
  const rect = video.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return rect.width > vw * 0.85 && rect.height > vh * 0.7;
}

interface DragState {
  startX: number;
  startY: number;
  pillStartX: number;
  pillStartY: number;
  moved: boolean;
}
