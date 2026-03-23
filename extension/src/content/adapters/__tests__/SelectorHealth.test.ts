/**
 * @jest-environment jsdom
 */

import { SelectorHealthMonitor, createHealthRecord } from '../SelectorHealth';

describe('SelectorHealthMonitor', () => {
  let monitor: SelectorHealthMonitor;

  beforeEach(() => {
    monitor = new SelectorHealthMonitor();
  });

  describe('createHealthRecord', () => {
    it('creates a record with correct defaults', () => {
      const record = createHealthRecord('.card', '.feed', 'home', 10);
      expect(record.cardSelector).toBe('.card');
      expect(record.feedSelector).toBe('.feed');
      expect(record.pathPattern).toBe('home');
      expect(record.baselineMatchCount).toBe(10);
      expect(record.healthScore).toBe(1.0);
      expect(record.consecutiveFailures).toBe(0);
      expect(record.version).toBe(2);
      expect(record.matchHistory).toHaveLength(1);
      expect(record.matchHistory[0]!.count).toBe(10);
    });

    it('starts unhealthy when initial count is 0', () => {
      const record = createHealthRecord('.card', null, 'home', 0);
      expect(record.healthScore).toBe(0.0);
      expect(record.consecutiveFailures).toBe(1);
    });
  });

  describe('recordCheck', () => {
    it('creates a new record on first check', () => {
      const record = monitor.recordCheck('home', '.card', 10);
      expect(record.baselineMatchCount).toBe(10);
      expect(record.healthScore).toBe(1.0);
    });

    it('maintains health with consistent match counts', () => {
      monitor.recordCheck('home', '.card', 10);
      const record = monitor.recordCheck('home', '.card', 10);
      // EMA: 0.3 * (10/10) + 0.7 * 1.0 = 1.0
      expect(record.healthScore).toBe(1.0);
      expect(record.consecutiveFailures).toBe(0);
    });

    it('degrades health when match count drops to 0', () => {
      monitor.recordCheck('home', '.card', 10);
      const record = monitor.recordCheck('home', '.card', 0);
      // EMA: 0.3 * 0 + 0.7 * 1.0 = 0.7
      expect(record.healthScore).toBeCloseTo(0.7, 2);
      expect(record.consecutiveFailures).toBe(1);
    });

    it('tracks consecutive failures', () => {
      monitor.recordCheck('home', '.card', 10);
      monitor.recordCheck('home', '.card', 0);
      monitor.recordCheck('home', '.card', 0);
      const record = monitor.recordCheck('home', '.card', 0);
      expect(record.consecutiveFailures).toBe(3);
    });

    it('resets consecutive failures on successful check', () => {
      monitor.recordCheck('home', '.card', 10);
      monitor.recordCheck('home', '.card', 0);
      monitor.recordCheck('home', '.card', 0);
      const record = monitor.recordCheck('home', '.card', 8);
      expect(record.consecutiveFailures).toBe(0);
    });

    it('caps health ratio at 1.5 to avoid inflation', () => {
      monitor.recordCheck('home', '.card', 5);
      // Match count much higher than baseline — should be capped
      const record = monitor.recordCheck('home', '.card', 100);
      // ratio = min(100/5, 1.5) = 1.5
      // EMA: 0.3 * 1.5 + 0.7 * 1.0 = 1.15 → clamped to 1.0
      expect(record.healthScore).toBeLessThanOrEqual(1.0);
    });

    it('trims match history to max entries', () => {
      monitor.recordCheck('home', '.card', 10);
      // Record 25 checks (history max is 20)
      for (let i = 0; i < 25; i++) {
        monitor.recordCheck('home', '.card', 10);
      }
      const record = monitor.getHealth('home');
      expect(record!.matchHistory.length).toBeLessThanOrEqual(20);
    });
  });

  describe('isHealthy', () => {
    it('returns true when no record exists', () => {
      expect(monitor.isHealthy('unknown')).toBe(true);
    });

    it('returns true for a healthy selector', () => {
      monitor.recordCheck('home', '.card', 10);
      expect(monitor.isHealthy('home')).toBe(true);
    });

    it('returns false after 3 consecutive failures', () => {
      monitor.recordCheck('home', '.card', 10);
      monitor.recordCheck('home', '.card', 0);
      monitor.recordCheck('home', '.card', 0);
      monitor.recordCheck('home', '.card', 0);
      expect(monitor.isHealthy('home')).toBe(false);
    });

    it('returns false when health score drops below threshold', () => {
      monitor.recordCheck('home', '.card', 10);
      // Keep recording zeros to push health below 0.3
      for (let i = 0; i < 10; i++) {
        monitor.recordCheck('home', '.card', 0);
      }
      const record = monitor.getHealth('home');
      expect(record!.healthScore).toBeLessThan(0.3);
      expect(monitor.isHealthy('home')).toBe(false);
    });
  });

  describe('loadRecord', () => {
    it('loads a pre-existing record', () => {
      const record = createHealthRecord('.cached', '.feed', 'watch', 15);
      monitor.loadRecord(record);
      expect(monitor.getHealth('watch')).toBe(record);
      expect(monitor.isHealthy('watch')).toBe(true);
    });
  });

  describe('resetHealth', () => {
    it('resets health score and failures', () => {
      monitor.recordCheck('home', '.card', 10);
      monitor.recordCheck('home', '.card', 0);
      monitor.recordCheck('home', '.card', 0);
      monitor.recordCheck('home', '.card', 0);
      expect(monitor.isHealthy('home')).toBe(false);

      const reset = monitor.resetHealth('home', '.new-card', 8);
      expect(reset.cardSelector).toBe('.new-card');
      expect(reset.healthScore).toBe(1.0);
      expect(reset.consecutiveFailures).toBe(0);
      expect(reset.baselineMatchCount).toBe(8);
      expect(monitor.isHealthy('home')).toBe(true);
    });

    it('carries over recent history', () => {
      monitor.recordCheck('home', '.card', 10);
      monitor.recordCheck('home', '.card', 0);
      const reset = monitor.resetHealth('home', '.new-card', 8);
      // Should have some carried-over history + the new entry
      expect(reset.matchHistory.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getAllHealthRecords', () => {
    it('returns all tracked records', () => {
      monitor.recordCheck('home', '.card-a', 10);
      monitor.recordCheck('watch', '.card-b', 5);
      const records = monitor.getAllHealthRecords();
      expect(records).toHaveLength(2);
    });
  });

  describe('setFeedSelector', () => {
    it('updates feed selector on existing record', () => {
      monitor.recordCheck('home', '.card', 10);
      monitor.setFeedSelector('home', '.new-feed');
      expect(monitor.getHealth('home')!.feedSelector).toBe('.new-feed');
    });

    it('does nothing for non-existent record', () => {
      // Should not throw
      monitor.setFeedSelector('missing', '.feed');
      expect(monitor.getHealth('missing')).toBeNull();
    });
  });

  describe('path pattern isolation', () => {
    it('tracks different path patterns independently', () => {
      monitor.recordCheck('home', '.card-home', 10);
      monitor.recordCheck('watch', '.card-watch', 5);

      // Degrade only 'watch'
      monitor.recordCheck('watch', '.card-watch', 0);
      monitor.recordCheck('watch', '.card-watch', 0);
      monitor.recordCheck('watch', '.card-watch', 0);

      expect(monitor.isHealthy('home')).toBe(true);
      expect(monitor.isHealthy('watch')).toBe(false);
    });
  });
});
