import { createLogger } from '@shared/Logger';
import type { PriceChangeResult } from './PriceTracker';

const log = createLogger('PriceAlertEngine');

const ALERT_RULES_KEY = 'recome_price_alert_rules';
const ALERT_HISTORY_KEY = 'recome_price_alert_history';
const MAX_ALERT_HISTORY = 100;

// ── Types ────────────────────────────────────────────────────────────────────

export type AlertRuleType = 'below_threshold' | 'percent_drop' | 'all_time_low' | 'price_increase';

export interface AlertRule {
  id: string;
  productId: string;
  type: AlertRuleType;
  /** Threshold price for 'below_threshold' */
  thresholdPrice?: number;
  /** Percentage for 'percent_drop' (e.g. 10 = 10% drop) */
  percentDrop?: number;
  enabled: boolean;
  createdAt: number;
}

export interface PriceAlert {
  id: string;
  productId: string;
  ruleId: string;
  ruleType: AlertRuleType;
  title: string;
  message: string;
  previousPrice: number;
  currentPrice: number;
  currency: string;
  url: string;
  timestamp: number;
  dismissed: boolean;
}

// ── PriceAlertEngine ─────────────────────────────────────────────────────────

export class PriceAlertEngine {
  /**
   * Evaluate a price change against all rules for the product.
   * Returns alerts that should be shown.
   */
  async evaluatePriceChange(change: PriceChangeResult): Promise<PriceAlert[]> {
    const rules = await this.getRulesForProduct(change.productId);
    const alerts: PriceAlert[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const alert = this.checkRule(rule, change);
      if (alert) {
        alerts.push(alert);
        await this.recordAlert(alert);
      }
    }

    // Also check implicit rules (all-time low doesn't need explicit rule)
    if (change.isAllTimeLow && change.changePercent < 0) {
      const existingATL = alerts.find((a) => a.ruleType === 'all_time_low');
      if (!existingATL) {
        const alert: PriceAlert = {
          id: `alert_${Date.now()}_atl`,
          productId: change.productId,
          ruleId: 'implicit_atl',
          ruleType: 'all_time_low',
          title: 'All-time low price!',
          message: `${change.title} is at its lowest price: ${change.currency}${change.currentPrice.toFixed(2)} (was ${change.currency}${change.previousPrice.toFixed(2)})`,
          previousPrice: change.previousPrice,
          currentPrice: change.currentPrice,
          currency: change.currency,
          url: change.url,
          timestamp: Date.now(),
          dismissed: false,
        };
        alerts.push(alert);
        await this.recordAlert(alert);
      }
    }

    return alerts;
  }

  /** Add an alert rule */
  async addRule(rule: Omit<AlertRule, 'id' | 'createdAt'>): Promise<AlertRule> {
    const rules = await this.getAllRules();
    const newRule: AlertRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    rules.push(newRule);
    await chrome.storage.local.set({ [ALERT_RULES_KEY]: rules });
    return newRule;
  }

  /** Remove an alert rule */
  async removeRule(ruleId: string): Promise<void> {
    const rules = await this.getAllRules();
    const filtered = rules.filter((r) => r.id !== ruleId);
    await chrome.storage.local.set({ [ALERT_RULES_KEY]: filtered });
  }

  /** Get all rules */
  async getAllRules(): Promise<AlertRule[]> {
    try {
      const stored = await chrome.storage.local.get(ALERT_RULES_KEY);
      return (stored[ALERT_RULES_KEY] as AlertRule[] | undefined) ?? [];
    } catch {
      return [];
    }
  }

  /** Get rules for a specific product */
  async getRulesForProduct(productId: string): Promise<AlertRule[]> {
    const rules = await this.getAllRules();
    return rules.filter((r) => r.productId === productId);
  }

  /** Get alert history */
  async getAlertHistory(): Promise<PriceAlert[]> {
    try {
      const stored = await chrome.storage.local.get(ALERT_HISTORY_KEY);
      return (stored[ALERT_HISTORY_KEY] as PriceAlert[] | undefined) ?? [];
    } catch {
      return [];
    }
  }

  /** Dismiss an alert */
  async dismissAlert(alertId: string): Promise<void> {
    const history = await this.getAlertHistory();
    const alert = history.find((a) => a.id === alertId);
    if (alert) {
      alert.dismissed = true;
      await chrome.storage.local.set({ [ALERT_HISTORY_KEY]: history });
    }
  }

  /** Send a Chrome notification for a price alert */
  async sendNotification(alert: PriceAlert): Promise<void> {
    try {
      await chrome.notifications.create(alert.id, {
        type: 'basic',
        iconUrl: '/icons/icon128.png',
        title: `RecoMe: ${alert.title}`,
        message: alert.message,
        priority: 2,
        buttons: [{ title: 'View product' }],
      });
      log.info(`Notification sent: ${alert.title}`);
    } catch (err) {
      log.warn('Failed to send notification', err);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private checkRule(rule: AlertRule, change: PriceChangeResult): PriceAlert | null {
    switch (rule.type) {
      case 'below_threshold':
        if (rule.thresholdPrice && change.currentPrice <= rule.thresholdPrice) {
          return this.createAlert(
            rule,
            change,
            `Price dropped below ${change.currency}${rule.thresholdPrice.toFixed(2)}!`,
            `${change.title} is now ${change.currency}${change.currentPrice.toFixed(2)} — below your target of ${change.currency}${rule.thresholdPrice.toFixed(2)}.`,
          );
        }
        break;

      case 'percent_drop':
        if (rule.percentDrop && change.changePercent <= -rule.percentDrop) {
          return this.createAlert(
            rule,
            change,
            `${Math.abs(change.changePercent).toFixed(0)}% price drop!`,
            `${change.title} dropped ${Math.abs(change.changePercent).toFixed(1)}% from ${change.currency}${change.previousPrice.toFixed(2)} to ${change.currency}${change.currentPrice.toFixed(2)}.`,
          );
        }
        break;

      case 'all_time_low':
        if (change.isAllTimeLow) {
          return this.createAlert(
            rule,
            change,
            'All-time low price!',
            `${change.title} is at its lowest tracked price: ${change.currency}${change.currentPrice.toFixed(2)}.`,
          );
        }
        break;

      case 'price_increase':
        if (change.changePercent > 0) {
          return this.createAlert(
            rule,
            change,
            'Price increased!',
            `${change.title} went up ${change.changePercent.toFixed(1)}% to ${change.currency}${change.currentPrice.toFixed(2)}. Buy soon if interested.`,
          );
        }
        break;
    }

    return null;
  }

  private createAlert(
    rule: AlertRule,
    change: PriceChangeResult,
    title: string,
    message: string,
  ): PriceAlert {
    return {
      id: `alert_${Date.now()}_${rule.id.slice(-4)}`,
      productId: change.productId,
      ruleId: rule.id,
      ruleType: rule.type,
      title,
      message,
      previousPrice: change.previousPrice,
      currentPrice: change.currentPrice,
      currency: change.currency,
      url: change.url,
      timestamp: Date.now(),
      dismissed: false,
    };
  }

  private async recordAlert(alert: PriceAlert): Promise<void> {
    const history = await this.getAlertHistory();
    history.unshift(alert);
    if (history.length > MAX_ALERT_HISTORY) {
      history.length = MAX_ALERT_HISTORY;
    }
    await chrome.storage.local.set({ [ALERT_HISTORY_KEY]: history });
  }
}
