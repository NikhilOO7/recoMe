import {
  DB_NAME,
  DB_VERSION,
  DEFAULT_USER_ID,
  SCORE_THRESHOLDS,
  FACTOR_WEIGHTS,
  DECAY_MS,
  STATUS_STRENGTH,
  PATTERN_THRESHOLD,
  SHORT_TERM_MAX,
  IMPLICIT_SIGNAL_WEIGHTS,
  IMPLICIT_DECAY_MS,
  GRAPH_AFFINITY_DECAY,
  GRAPH_MAX_DEPTH,
  WORK_HOURS,
  WORK_DAYS,
  PLATFORM_CONTEXT_MAP,
  LEARNING_DOMAINS,
  ALARM_NAMES,
  ALARM_INTERVALS,
  TOAST_DURATION_MS,
  STORAGE_KEYS,
} from '../constants';

// ── Database ──────────────────────────────────────────────────────────────────

describe('Database constants', () => {
  it('DB_NAME is a non-empty string', () => {
    expect(typeof DB_NAME).toBe('string');
    expect(DB_NAME.length).toBeGreaterThan(0);
  });

  it('DB_VERSION is a positive integer', () => {
    expect(typeof DB_VERSION).toBe('number');
    expect(Number.isInteger(DB_VERSION)).toBe(true);
    expect(DB_VERSION).toBeGreaterThan(0);
  });

  it('DEFAULT_USER_ID is a non-empty string', () => {
    expect(typeof DEFAULT_USER_ID).toBe('string');
    expect(DEFAULT_USER_ID.length).toBeGreaterThan(0);
  });
});

// ── Score Thresholds ──────────────────────────────────────────────────────────

describe('SCORE_THRESHOLDS', () => {
  it('all values are numbers', () => {
    for (const v of Object.values(SCORE_THRESHOLDS)) {
      expect(typeof v).toBe('number');
    }
  });

  it('hide < suppress < boost', () => {
    expect(SCORE_THRESHOLDS.hide).toBeLessThan(SCORE_THRESHOLDS.suppress);
    expect(SCORE_THRESHOLDS.suppress).toBeLessThan(SCORE_THRESHOLDS.boost);
  });

  it('hide and suppress are in [-1, 1]', () => {
    expect(SCORE_THRESHOLDS.hide).toBeGreaterThanOrEqual(-1);
    expect(SCORE_THRESHOLDS.hide).toBeLessThanOrEqual(1);
    expect(SCORE_THRESHOLDS.suppress).toBeGreaterThanOrEqual(-1);
    expect(SCORE_THRESHOLDS.suppress).toBeLessThanOrEqual(1);
  });

  it('boost and prompt are in [-1, 1]', () => {
    expect(SCORE_THRESHOLDS.boost).toBeGreaterThanOrEqual(-1);
    expect(SCORE_THRESHOLDS.boost).toBeLessThanOrEqual(1);
    expect(SCORE_THRESHOLDS.prompt).toBeGreaterThanOrEqual(-1);
    expect(SCORE_THRESHOLDS.prompt).toBeLessThanOrEqual(1);
  });
});

// ── Factor Weights ────────────────────────────────────────────────────────────

describe('FACTOR_WEIGHTS', () => {
  it('all weights are positive numbers', () => {
    for (const v of Object.values(FACTOR_WEIGHTS)) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
    }
  });

  it('direct_block has the highest weight', () => {
    const allWeights = Object.values(FACTOR_WEIGHTS);
    const maxWeight = Math.max(...allWeights);
    expect(FACTOR_WEIGHTS.direct_block).toBe(maxWeight);
  });
});

// ── Decay Timing ──────────────────────────────────────────────────────────────

describe('DECAY_MS', () => {
  describe('mid_term ranges are ordered', () => {
    it('core_to_dream < dream_to_forgotten < forgotten_to_deleted', () => {
      expect(DECAY_MS.mid_term.core_to_dream).toBeLessThan(DECAY_MS.mid_term.dream_to_forgotten);
      expect(DECAY_MS.mid_term.dream_to_forgotten).toBeLessThan(
        DECAY_MS.mid_term.forgotten_to_deleted,
      );
    });

    it('all values are positive', () => {
      expect(DECAY_MS.mid_term.core_to_dream).toBeGreaterThan(0);
      expect(DECAY_MS.mid_term.dream_to_forgotten).toBeGreaterThan(0);
      expect(DECAY_MS.mid_term.forgotten_to_deleted).toBeGreaterThan(0);
    });
  });

  describe('working_set ranges are ordered', () => {
    it('core_to_dream < dream_to_forgotten < forgotten_to_deleted', () => {
      expect(DECAY_MS.working_set.core_to_dream).toBeLessThan(
        DECAY_MS.working_set.dream_to_forgotten,
      );
      expect(DECAY_MS.working_set.dream_to_forgotten).toBeLessThan(
        DECAY_MS.working_set.forgotten_to_deleted,
      );
    });

    it('all values are positive', () => {
      expect(DECAY_MS.working_set.core_to_dream).toBeGreaterThan(0);
      expect(DECAY_MS.working_set.dream_to_forgotten).toBeGreaterThan(0);
      expect(DECAY_MS.working_set.forgotten_to_deleted).toBeGreaterThan(0);
    });
  });

  it('working_set decays faster than mid_term', () => {
    expect(DECAY_MS.working_set.core_to_dream).toBeLessThan(DECAY_MS.mid_term.core_to_dream);
    expect(DECAY_MS.working_set.dream_to_forgotten).toBeLessThan(
      DECAY_MS.mid_term.dream_to_forgotten,
    );
    expect(DECAY_MS.working_set.forgotten_to_deleted).toBeLessThan(
      DECAY_MS.mid_term.forgotten_to_deleted,
    );
  });
});

// ── Alarm Names ───────────────────────────────────────────────────────────────

describe('ALARM_NAMES', () => {
  it('all values are non-empty strings', () => {
    for (const v of Object.values(ALARM_NAMES)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('all values are unique', () => {
    const values = Object.values(ALARM_NAMES);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ── Alarm Intervals ───────────────────────────────────────────────────────────

describe('ALARM_INTERVALS', () => {
  it('all intervals are positive numbers', () => {
    for (const v of Object.values(ALARM_INTERVALS)) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
    }
  });
});

// ── Platform Context Map ──────────────────────────────────────────────────────

describe('PLATFORM_CONTEXT_MAP', () => {
  const validBuckets: string[] = [
    'work',
    'learning',
    'shopping',
    'entertainment',
    'social',
    'general',
  ];

  it('all values are valid ContextBucket types', () => {
    for (const [_platform, bucket] of Object.entries(PLATFORM_CONTEXT_MAP)) {
      expect(validBuckets).toContain(bucket);
    }
  });

  it('maps expected platforms', () => {
    expect(PLATFORM_CONTEXT_MAP.youtube).toBeDefined();
    expect(PLATFORM_CONTEXT_MAP.amazon).toBeDefined();
    expect(PLATFORM_CONTEXT_MAP.unknown).toBeDefined();
  });
});

// ── Work Hours ────────────────────────────────────────────────────────────────

describe('WORK_HOURS', () => {
  it('start < end', () => {
    expect(WORK_HOURS.start).toBeLessThan(WORK_HOURS.end);
  });

  it('hours are within valid range (0-23)', () => {
    expect(WORK_HOURS.start).toBeGreaterThanOrEqual(0);
    expect(WORK_HOURS.start).toBeLessThanOrEqual(23);
    expect(WORK_HOURS.end).toBeGreaterThanOrEqual(0);
    expect(WORK_HOURS.end).toBeLessThanOrEqual(23);
  });
});

describe('WORK_DAYS', () => {
  it('contains valid day numbers', () => {
    for (const day of WORK_DAYS) {
      expect(day).toBeGreaterThanOrEqual(0);
      expect(day).toBeLessThanOrEqual(6);
    }
  });

  it('all days are unique', () => {
    expect(new Set(WORK_DAYS).size).toBe(WORK_DAYS.length);
  });
});

// ── Implicit Signal Weights ───────────────────────────────────────────────────

describe('IMPLICIT_SIGNAL_WEIGHTS', () => {
  it('all weights have strength in (0, 1]', () => {
    for (const signal of Object.values(IMPLICIT_SIGNAL_WEIGHTS)) {
      expect(signal.strength).toBeGreaterThan(0);
      expect(signal.strength).toBeLessThanOrEqual(1);
    }
  });

  it('all weights have confidence in (0, 1]', () => {
    for (const signal of Object.values(IMPLICIT_SIGNAL_WEIGHTS)) {
      expect(signal.confidence).toBeGreaterThan(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('extended dwell has higher strength than short dwell', () => {
    expect(IMPLICIT_SIGNAL_WEIGHTS.dwell_extended.strength).toBeGreaterThan(
      IMPLICIT_SIGNAL_WEIGHTS.dwell_short.strength,
    );
  });

  it('extended dwell has higher confidence than short dwell', () => {
    expect(IMPLICIT_SIGNAL_WEIGHTS.dwell_extended.confidence).toBeGreaterThan(
      IMPLICIT_SIGNAL_WEIGHTS.dwell_short.confidence,
    );
  });

  it('all sentiments are valid', () => {
    const validSentiments = ['positive', 'negative', 'neutral'];
    for (const signal of Object.values(IMPLICIT_SIGNAL_WEIGHTS)) {
      expect(validSentiments).toContain(signal.sentiment);
    }
  });
});

// ── Misc constants ────────────────────────────────────────────────────────────

describe('Miscellaneous constants', () => {
  it('STATUS_STRENGTH has expected statuses', () => {
    expect(STATUS_STRENGTH).toHaveProperty('core');
    expect(STATUS_STRENGTH).toHaveProperty('dream');
    expect(STATUS_STRENGTH).toHaveProperty('forgotten');
  });

  it('PATTERN_THRESHOLD is a positive integer', () => {
    expect(PATTERN_THRESHOLD).toBeGreaterThan(0);
    expect(Number.isInteger(PATTERN_THRESHOLD)).toBe(true);
  });

  it('SHORT_TERM_MAX is a positive integer', () => {
    expect(SHORT_TERM_MAX).toBeGreaterThan(0);
    expect(Number.isInteger(SHORT_TERM_MAX)).toBe(true);
  });

  it('GRAPH_AFFINITY_DECAY is between 0 and 1', () => {
    expect(GRAPH_AFFINITY_DECAY).toBeGreaterThan(0);
    expect(GRAPH_AFFINITY_DECAY).toBeLessThanOrEqual(1);
  });

  it('GRAPH_MAX_DEPTH is a positive integer', () => {
    expect(GRAPH_MAX_DEPTH).toBeGreaterThan(0);
    expect(Number.isInteger(GRAPH_MAX_DEPTH)).toBe(true);
  });

  it('TOAST_DURATION_MS is a positive number', () => {
    expect(TOAST_DURATION_MS).toBeGreaterThan(0);
  });

  it('LEARNING_DOMAINS is a non-empty array of strings', () => {
    expect(Array.isArray(LEARNING_DOMAINS)).toBe(true);
    expect(LEARNING_DOMAINS.length).toBeGreaterThan(0);
    for (const domain of LEARNING_DOMAINS) {
      expect(typeof domain).toBe('string');
    }
  });

  it('STORAGE_KEYS has unique string values', () => {
    const values = Object.values(STORAGE_KEYS);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(typeof v).toBe('string');
    }
  });

  it('IMPLICIT_DECAY_MS ranges are ordered', () => {
    expect(IMPLICIT_DECAY_MS.core_to_dream).toBeLessThan(IMPLICIT_DECAY_MS.dream_to_forgotten);
    expect(IMPLICIT_DECAY_MS.dream_to_forgotten).toBeLessThan(
      IMPLICIT_DECAY_MS.forgotten_to_deleted,
    );
  });
});
