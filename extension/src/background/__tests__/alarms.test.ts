import { registerAlarms, handleAlarm } from '../alarms';
import { ALARM_NAMES, ALARM_INTERVALS } from '@shared/constants';

// ── Mock chrome APIs ────────────────────────────────────────────────────────────

globalThis.chrome = {
  alarms: {
    create: jest.fn(),
    onAlarm: { addListener: jest.fn() },
  },
  tabs: {
    query: jest.fn().mockResolvedValue([{ id: 1 }]),
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
    },
  },
  runtime: { sendMessage: jest.fn() },
} as any;

// ── Mock dependencies ────────────────────────────────────────────────────────────

const mockRunDecay = jest.fn().mockResolvedValue({ entries_decayed: 3, entries_deleted: 1 });
const mockGetMemoryCount = jest.fn().mockResolvedValue(50);
const mockGetEntityCount = jest.fn().mockResolvedValue(15);

jest.mock('@intelligence/index', () => ({
  getIntelligenceService: jest.fn(() => ({
    getMemoryService: () => ({
      runDecay: mockRunDecay,
      getMemoryCount: mockGetMemoryCount,
    }),
    getGraph: () => ({
      getEntityCount: mockGetEntityCount,
    }),
  })),
}));

const mockSynthesizerRun = jest.fn().mockResolvedValue(true);

jest.mock('@intelligence/memory/PreferenceSynthesizer', () => ({
  PreferenceSynthesizer: jest.fn().mockImplementation(() => ({
    run: mockSynthesizerRun,
  })),
}));

jest.mock('@intelligence/memory/storage/MemoryStore', () => ({
  MemoryStore: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@brain/graph/KnowledgeGraph', () => ({
  KnowledgeGraph: jest.fn().mockImplementation(() => ({})),
}));

const mockLinkerRun = jest.fn().mockResolvedValue(2);

jest.mock('@brain/graph/CrossPlatformLinker', () => ({
  CrossPlatformLinker: jest.fn().mockImplementation(() => ({
    run: mockLinkerRun,
  })),
}));

const mockDetect = jest.fn().mockResolvedValue(3);

jest.mock('@agent/insights', () => ({
  InsightDetector: jest.fn().mockImplementation(() => ({
    detect: mockDetect,
  })),
}));

jest.mock('@shared/EventBus', () => ({
  eventBus: { emit: jest.fn(), on: jest.fn(), off: jest.fn() },
}));

jest.mock('@shared/Logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('alarms', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerAlarms', () => {
    it('creates all expected alarms', () => {
      registerAlarms();

      expect(chrome.alarms.create).toHaveBeenCalledTimes(7);
      expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_NAMES.decay, {
        periodInMinutes: ALARM_INTERVALS.decay_minutes,
        delayInMinutes: 1,
      });
      expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_NAMES.stats, {
        periodInMinutes: ALARM_INTERVALS.stats_minutes,
        delayInMinutes: 5,
      });
      expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_NAMES.preference_synthesis, {
        periodInMinutes: ALARM_INTERVALS.preference_synthesis_minutes,
        delayInMinutes: 10,
      });
      expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_NAMES.insight_check, {
        periodInMinutes: ALARM_INTERVALS.insight_check_minutes,
        delayInMinutes: 5,
      });
      expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_NAMES.selector_health, {
        periodInMinutes: ALARM_INTERVALS.selector_health_minutes,
        delayInMinutes: 15,
      });
    });
  });

  describe('handleAlarm — decay', () => {
    it('calls runDecay on memory service', async () => {
      handleAlarm({ name: ALARM_NAMES.decay, scheduledTime: Date.now() });

      // Allow async handler to resolve
      await new Promise((r) => setTimeout(r, 10));

      expect(mockRunDecay).toHaveBeenCalled();
    });

    it('handles decay errors gracefully', async () => {
      mockRunDecay.mockRejectedValueOnce(new Error('DB error'));

      handleAlarm({ name: ALARM_NAMES.decay, scheduledTime: Date.now() });
      await new Promise((r) => setTimeout(r, 10));

      // Should not throw — error is caught internally
      expect(mockRunDecay).toHaveBeenCalled();
    });
  });

  describe('handleAlarm — stats', () => {
    it('aggregates memory and graph counts', async () => {
      handleAlarm({ name: ALARM_NAMES.stats, scheduledTime: Date.now() });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockGetMemoryCount).toHaveBeenCalled();
      expect(mockGetEntityCount).toHaveBeenCalled();
    });
  });

  describe('handleAlarm — preference_synthesis', () => {
    it('runs PreferenceSynthesizer and CrossPlatformLinker', async () => {
      handleAlarm({ name: ALARM_NAMES.preference_synthesis, scheduledTime: Date.now() });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSynthesizerRun).toHaveBeenCalled();
      expect(mockLinkerRun).toHaveBeenCalled();
    });
  });

  describe('handleAlarm — insight_check', () => {
    it('calls InsightDetector.detect() and notifies tabs when insights found', async () => {
      const { eventBus } = require('@shared/EventBus');

      handleAlarm({ name: ALARM_NAMES.insight_check, scheduledTime: Date.now() });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockDetect).toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith('PROACTIVE_INSIGHT_READY', { insightCount: 3 });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
        type: 'INSIGHT_AVAILABLE',
        payload: { count: 3 },
      });
    });

    it('does not emit or notify when no insights detected', async () => {
      mockDetect.mockResolvedValueOnce(0);
      const { eventBus } = require('@shared/EventBus');

      handleAlarm({ name: ALARM_NAMES.insight_check, scheduledTime: Date.now() });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockDetect).toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleAlarm — unknown', () => {
    it('logs warning for unknown alarm name', () => {
      // Should not throw
      handleAlarm({ name: 'unknown_alarm', scheduledTime: Date.now() });
    });
  });
});
