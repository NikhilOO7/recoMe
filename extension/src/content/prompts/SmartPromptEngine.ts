import { createLogger } from '@shared/Logger';
import { PromptFatigueManager } from './PromptFatigueManager';
import { renderPrompt, type PromptAction, type SmartPromptData } from './PromptRenderer';
import type { ContentMetadata, Platform } from '@shared/types';

const log = createLogger('SmartPromptEngine');

// ── Trigger Types ────────────────────────────────────────────────────────────

export type TriggerType =
  | 'extended_dwell'
  | 'scroll_back'
  | 'tab_revisit'
  | 'comparison'
  | 'cart_hover'
  | 'exit_without_action';

export interface PromptTrigger {
  type: TriggerType;
  element: Element;
  metadata: ContentMetadata | null;
  /** Extra context depending on trigger type */
  context?: {
    dwellSeconds?: number;
    revisitCount?: number;
    comparisonCount?: number;
    categoryName?: string;
  };
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * SmartPromptEngine — evaluates triggers and shows contextual micro-prompts.
 *
 * Coordinates with PromptFatigueManager to respect frequency limits
 * and adapts behavior based on user response patterns.
 */
export class SmartPromptEngine {
  private readonly fatigue: PromptFatigueManager;
  private readonly platform: Platform;
  private promptCounter = 0;
  /** Track prompts already shown for specific content to avoid duplicates */
  private shownForContent = new Set<string>();

  constructor(platform: Platform) {
    this.platform = platform;
    this.fatigue = new PromptFatigueManager();
  }

  /**
   * Evaluate a trigger and potentially show a prompt.
   * Returns true if a prompt was shown.
   */
  evaluate(trigger: PromptTrigger): boolean {
    // Check fatigue first
    if (!this.fatigue.canShowPrompt()) {
      return false;
    }

    // Dedup: don't show same prompt for same content
    const contentKey = this.getContentKey(trigger);
    if (contentKey && this.shownForContent.has(contentKey)) {
      return false;
    }

    // Build prompt based on trigger type
    const promptData = this.buildPrompt(trigger);
    if (!promptData) return false;

    // Record and render
    this.fatigue.recordShown();
    if (contentKey) this.shownForContent.add(contentKey);

    renderPrompt(promptData, (promptId, action) => {
      this.handleResponse(promptId, action, trigger);
    });

    log.info(`Showed ${trigger.type} prompt for: ${promptData.subject}`);
    return true;
  }

  // ── Prompt Builders ──────────────────────────────────────────────

  private buildPrompt(trigger: PromptTrigger): SmartPromptData | null {
    const id = `prompt_${++this.promptCounter}_${Date.now()}`;

    switch (trigger.type) {
      case 'extended_dwell':
        return this.buildDwellPrompt(id, trigger);
      case 'scroll_back':
        return this.buildScrollBackPrompt(id, trigger);
      case 'tab_revisit':
        return this.buildRevisitPrompt(id, trigger);
      case 'comparison':
        return this.buildComparisonPrompt(id, trigger);
      case 'cart_hover':
        return this.buildCartHoverPrompt(id, trigger);
      case 'exit_without_action':
        return this.buildExitPrompt(id, trigger);
      default:
        return null;
    }
  }

  private buildDwellPrompt(id: string, trigger: PromptTrigger): SmartPromptData | null {
    const subject = this.getSubject(trigger);
    if (!subject) return null;

    const seconds = trigger.context?.dwellSeconds ?? 15;
    return {
      id,
      message:
        seconds > 30
          ? `Really into <strong>${subject}</strong>?`
          : `Enjoying <strong>${subject}</strong>?`,
      subject,
      style: 'toast',
      actions: [
        { label: 'Yes, more!', icon: '\uD83D\uDC4D', variant: 'positive', value: 'like' },
        { label: 'Not really', icon: '\uD83D\uDC4E', variant: 'negative', value: 'dislike' },
      ],
    };
  }

  private buildScrollBackPrompt(id: string, trigger: PromptTrigger): SmartPromptData | null {
    const subject = this.getSubject(trigger);
    if (!subject) return null;

    return {
      id,
      message: `Came back to <strong>${subject}</strong> — interested?`,
      subject,
      style: 'inline',
      anchorElement: trigger.element,
      actions: [
        { label: 'Save it', icon: '\uD83D\uDCCC', variant: 'positive', value: 'save' },
        { label: 'Just browsing', variant: 'neutral', value: 'dismiss' },
      ],
    };
  }

  private buildRevisitPrompt(id: string, trigger: PromptTrigger): SmartPromptData | null {
    const subject = this.getSubject(trigger);
    if (!subject) return null;

    const count = trigger.context?.revisitCount ?? 2;
    return {
      id,
      message: `You've visited <strong>${subject}</strong> ${count} times — save it?`,
      subject,
      style: 'toast',
      actions: [
        {
          label: 'Add to watchlist',
          icon: '\uD83D\uDCCC',
          variant: 'positive',
          value: 'watchlist',
        },
        { label: 'Not interested', variant: 'negative', value: 'dislike' },
      ],
    };
  }

  private buildComparisonPrompt(id: string, trigger: PromptTrigger): SmartPromptData | null {
    const category = trigger.context?.categoryName ?? 'these';
    const count = trigger.context?.comparisonCount ?? 3;

    return {
      id,
      message: `Comparing <strong>${category}</strong>? You've looked at ${count} similar items.`,
      subject: category,
      style: 'toast',
      actions: [
        { label: 'Help me compare', icon: '\uD83D\uDD0D', variant: 'positive', value: 'compare' },
        { label: 'No thanks', variant: 'neutral', value: 'dismiss' },
      ],
    };
  }

  private buildCartHoverPrompt(id: string, trigger: PromptTrigger): SmartPromptData | null {
    const subject = this.getSubject(trigger);
    if (!subject) return null;

    return {
      id,
      message: `Want me to track the price of <strong>${subject}</strong>?`,
      subject,
      style: 'inline',
      anchorElement: trigger.element,
      actions: [
        { label: 'Track price', icon: '\uD83D\uDCB0', variant: 'positive', value: 'track_price' },
        { label: 'No thanks', variant: 'neutral', value: 'dismiss' },
      ],
    };
  }

  private buildExitPrompt(id: string, trigger: PromptTrigger): SmartPromptData | null {
    const category = trigger.context?.categoryName ?? 'this category';
    return {
      id,
      message: `Done browsing <strong>${category}</strong>? Found what you needed?`,
      subject: category,
      style: 'toast',
      actions: [
        { label: 'Yes, got it', icon: '\u2705', variant: 'positive', value: 'found' },
        {
          label: 'Still looking',
          icon: '\uD83D\uDD0D',
          variant: 'neutral',
          value: 'still_looking',
        },
        { label: 'Nothing good', icon: '\uD83D\uDC4E', variant: 'negative', value: 'nothing_good' },
      ],
    };
  }

  // ── Response Handling ────────────────────────────────────────────

  private handleResponse(_promptId: string, action: PromptAction, trigger: PromptTrigger): void {
    if (action.variant === 'snooze') {
      this.fatigue.snooze(action.value as '1h' | '1d' | 'forever');
      return;
    }

    if (action.variant === 'positive') {
      this.fatigue.recordPositiveResponse();
      this.sendPositiveSignal(action.value, trigger);
    } else if (action.variant === 'negative') {
      this.fatigue.recordDismissal();
      this.sendNegativeSignal(action.value, trigger);
    } else {
      // neutral — just record as dismissal (gentle)
      this.fatigue.recordDismissal();
    }
  }

  private sendPositiveSignal(value: string, trigger: PromptTrigger): void {
    const meta = trigger.metadata;
    const topic = meta?.topics[0] ?? meta?.creator ?? null;

    switch (value) {
      case 'like':
        if (topic) {
          chrome.runtime
            .sendMessage({ type: 'LIKE_TOPIC', payload: { topic } })
            .catch(() => undefined);
        }
        break;
      case 'save':
      case 'watchlist':
        if (meta) {
          chrome.runtime
            .sendMessage({
              type: 'AGENT_WATCHLIST_ADD',
              payload: {
                entityType: 'product',
                entityId: meta.id,
                title: meta.title,
                url: meta.url,
              },
            })
            .catch(() => undefined);
        }
        break;
      case 'track_price':
        if (meta) {
          chrome.runtime
            .sendMessage({
              type: 'AGENT_WATCHLIST_ADD',
              payload: {
                entityType: 'product',
                entityId: meta.id,
                title: meta.title,
                url: meta.url,
                trackPrice: true,
              },
            })
            .catch(() => undefined);
        }
        break;
      case 'compare':
        // Open overlay with comparison request
        chrome.runtime
          .sendMessage({
            type: 'SMART_PROMPT_RESPONSE',
            payload: {
              action: 'compare',
              platform: this.platform,
            },
          })
          .catch(() => undefined);
        break;
      case 'found':
        // Positive exit signal — user found what they wanted
        if (topic) {
          chrome.runtime
            .sendMessage({
              type: 'IMPLICIT_SIGNAL',
              payload: {
                topics: meta?.topics ?? [],
                entities: meta?.entities ?? [],
                platform: this.platform,
                signalType: 'positive_exit',
                contentId: meta?.id ?? '',
                contentTitle: meta?.title ?? '',
              },
            })
            .catch(() => undefined);
        }
        break;
    }
  }

  private sendNegativeSignal(value: string, trigger: PromptTrigger): void {
    const meta = trigger.metadata;
    if (!meta) return;

    switch (value) {
      case 'dislike':
        chrome.runtime
          .sendMessage({
            type: 'LEARN_FEEDBACK',
            payload: { content: meta, feedback: 'not_interested' },
          })
          .catch(() => undefined);
        break;
      case 'nothing_good':
        // Record as weak negative for the category
        chrome.runtime
          .sendMessage({
            type: 'IMPLICIT_SIGNAL',
            payload: {
              topics: meta.topics,
              entities: [],
              platform: this.platform,
              signalType: 'negative_exit',
              contentId: meta.id,
              contentTitle: meta.title,
            },
          })
          .catch(() => undefined);
        break;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private getSubject(trigger: PromptTrigger): string | null {
    const meta = trigger.metadata;
    if (!meta) return null;

    const topic = meta.topics[0] ?? meta.creator ?? meta.title;
    if (!topic) return null;

    // Sanitize for HTML display
    return topic.replace(/</g, '&lt;').replace(/>/g, '&gt;').substring(0, 60);
  }

  private getContentKey(trigger: PromptTrigger): string | null {
    const meta = trigger.metadata;
    if (!meta) return null;
    return `${trigger.type}:${meta.id}`;
  }
}
