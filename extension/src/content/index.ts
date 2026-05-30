/**
 * Content-script entry — Phases 1 + 2 + 3.
 *
 * Phase 1: capture pipeline (DwellSignal + SearchSignal) feeds the queue.
 * Phase 2: in-page surfaces (Sidebar, ScoreBatcher, AgentEventRouter +
 *          InsightCard) render cloud-driven scoring + agent events.
 * Phase 3: WorkflowOrchestrator auto-fires per-platform agents
 *          (Concierge on commerce PDP, Recall on YouTube/Reddit content)
 *          and exposes manual ones in the sidebar "Ask the agents" panel.
 */

import '../styles/content.css';
import { createLogger } from '@shared/Logger';
import { sendMessage } from '@shared/messages';
import { checkPageEligibility } from './PageEligibility';
import { createCapture, detectPlatform, DwellSignal, SearchSignal } from '../capture';
import { createSurface } from '../surfaces';
import { ScoreBatcher } from '../surfaces/ScoreBatcher';
import { Sidebar } from '../surfaces/Sidebar';
import { AgentEventRouter } from '../surfaces/AgentEventRouter';
import { WorkflowOrchestrator } from '../surfaces/workflows';
import { maybeShowWelcome } from '../surfaces/WelcomeCard';

const log = createLogger('Content');

interface Settings {
  enabled: boolean;
  platforms: Partial<Record<string, boolean>>;
}

const CHAT_ONLY = new Set([
  'web.whatsapp.com',
  'web.telegram.org',
  'discord.com',
  'slack.com',
  'app.slack.com',
  'teams.microsoft.com',
  'meet.google.com',
  'zoom.us',
  'app.zoom.us',
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'messenger.com',
  'chat.google.com',
]);

const PAGE_SETTLE_MS = 2500;

function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function isChatOnly(): boolean {
  const host = location.hostname.replace(/^www\./, '');
  return CHAT_ONLY.has(host) || [...CHAT_ONLY].some((d) => host.endsWith('.' + d));
}

function isIncognito(): boolean {
  try {
    return chrome.extension?.inIncognitoContext === true;
  } catch {
    return false;
  }
}

// Per-tab state
let dwell: DwellSignal | null = null;
let search: SearchSignal | null = null;
let batcher: ScoreBatcher | null = null;
let sidebar: Sidebar | null = null;
let router: AgentEventRouter | null = null;
const orchestrator = new WorkflowOrchestrator();
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let lastPath = location.pathname + location.search;
let overlayVisible = true;

async function getSettings(): Promise<Settings> {
  const res = await sendMessage<undefined, Settings>('GET_SETTINGS');
  if (!res.success) return { enabled: false, platforms: {} };
  return res.data!;
}

function teardownPerPage(): void {
  dwell?.cancel();
  dwell = null;
  batcher?.stop();
  batcher = null;
  if (settleTimer !== null) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
}

async function bootstrap(): Promise<void> {
  if (!isContextValid()) return;
  if (isChatOnly()) {
    log.info(`chat-only site (${location.hostname}); skipping`);
    return;
  }
  if (isIncognito()) {
    log.info('incognito; skipping');
    return;
  }

  const eligibility = checkPageEligibility();
  if (!eligibility.eligible) {
    log.info(`ineligible: ${eligibility.reason}`);
    return;
  }

  const settings = await getSettings();
  if (!settings.enabled) {
    log.info('disabled in settings');
    return;
  }

  const platform = detectPlatform();
  if (platform !== 'generic' && settings.platforms[platform] === false) {
    log.info(`platform ${platform} disabled`);
    return;
  }

  // Sidebar + AgentEventRouter live for the whole tab.
  sidebar = new Sidebar();
  sidebar.mount();
  router = new AgentEventRouter(sidebar);
  await router.start();

  startPerPage(platform);
  installSpaWatcher();

  // Toggle from background keyboard command + popup.
  chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (msg?.type === 'TOGGLE_OVERLAY') toggleOverlay();
  });

  // First-install onboarding card (idempotent, self-suppresses after first show).
  void maybeShowWelcome();

  log.info(`active surfaces on ${platform}`);
}

function startPerPage(platform: string): void {
  teardownPerPage();

  const capture = createCapture(platform as Parameters<typeof createCapture>[0]);
  dwell = new DwellSignal(capture);
  dwell.start();
  if (!search) {
    search = new SearchSignal(platform as Parameters<typeof createCapture>[0]);
    search.start();
  }

  // Per-card scoring overlay (Phase 2).
  const surface = createSurface(platform as Parameters<typeof createSurface>[0]);
  if (surface) {
    batcher = new ScoreBatcher(surface);
    batcher.start();
  }

  // Manual workflow actions in sidebar (Phase 3).
  if (sidebar) {
    sidebar.setManualFlows(
      orchestrator.manualFlows(platform as Parameters<typeof createSurface>[0]),
    );
  }

  // Auto workflows fire once the page has settled enough for the capture's
  // pageKind detection to be reliable (DOM ready for YouTube/Amazon SPAs).
  settleTimer = setTimeout(() => {
    settleTimer = null;
    const ex = capture.extract();
    if (!ex) return;
    void orchestrator.fireAuto(platform as Parameters<typeof createSurface>[0], {
      pageUrl: ex.pageUrl,
      pageTitle: ex.pageTitle,
      pageKind: ex.pageKind ?? capture.pageKind(),
    });
  }, PAGE_SETTLE_MS);
}

function installSpaWatcher(): void {
  const restart = (): void => {
    const path = location.pathname + location.search;
    if (path === lastPath) return;
    lastPath = path;

    const elig = checkPageEligibility();
    if (!elig.eligible) {
      teardownPerPage();
      return;
    }
    const platform = detectPlatform();
    startPerPage(platform);
  };

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    origPush(...args);
    setTimeout(restart, 400);
  };
  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    origReplace(...args);
    setTimeout(restart, 400);
  };
  window.addEventListener('popstate', () => setTimeout(restart, 400));
}

function toggleOverlay(): void {
  overlayVisible = !overlayVisible;
  if (sidebar) {
    if (overlayVisible) sidebar.mount();
    else sidebar.unmount();
  }
  const host = document.getElementById('recome-insight-host');
  if (host) host.style.display = overlayVisible ? 'flex' : 'none';
}

bootstrap().catch((e) => {
  if (/context invalidated/i.test(String(e))) return;
  log.error('content bootstrap failed', e);
});
