import { ok, err } from '../messages';
import type {
  ProcessContentMessage,
  LearnFeedbackMessage,
  TrackSearchMessage,
  GetStatsMessage,
  BlockTopicMessage,
  SwitchContextMessage,
  ImplicitSignalMessage,
  MessageResponse,
} from '../messages';

// ── ok() ──────────────────────────────────────────────────────────────────────

describe('ok()', () => {
  it('returns { success: true, data } for a string payload', () => {
    const result = ok('hello');
    expect(result).toEqual({ success: true, data: 'hello' });
  });

  it('returns { success: true, data } for an object payload', () => {
    const payload = { id: 1, name: 'test' };
    const result = ok(payload);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(payload);
  });

  it('returns { success: true, data } for null', () => {
    const result = ok(null);
    expect(result).toEqual({ success: true, data: null });
  });

  it('returns { success: true, data } for undefined', () => {
    const result = ok(undefined);
    expect(result).toEqual({ success: true, data: undefined });
  });

  it('returns { success: true, data } for an array', () => {
    const result = ok([1, 2, 3]);
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('does not include error field', () => {
    const result = ok('data');
    expect(result.error).toBeUndefined();
  });
});

// ── err() ─────────────────────────────────────────────────────────────────────

describe('err()', () => {
  it('returns { success: false, error } for a string message', () => {
    const result = err('something went wrong');
    expect(result).toEqual({ success: false, error: 'something went wrong' });
  });

  it('success is false', () => {
    expect(err('fail').success).toBe(false);
  });

  it('error is the provided string', () => {
    expect(err('not found').error).toBe('not found');
  });

  it('does not include data field', () => {
    const result = err('error');
    expect(result.data).toBeUndefined();
  });
});

// ── Message shapes (discriminated union) ──────────────────────────────────────

describe('Message type shapes', () => {
  it('ProcessContentMessage has correct shape', () => {
    const msg: ProcessContentMessage = {
      type: 'PROCESS_CONTENT',
      payload: {
        url: 'https://example.com',
        title: 'Test',
        topics: ['tech'],
        entities: [],
        platform: 'unknown',
      } as any,
    };
    expect(msg.type).toBe('PROCESS_CONTENT');
    expect(msg.payload).toBeDefined();
  });

  it('LearnFeedbackMessage has correct shape', () => {
    const msg: LearnFeedbackMessage = {
      type: 'LEARN_FEEDBACK',
      payload: {
        content: {} as any,
        feedback: 'like' as any,
      },
    };
    expect(msg.type).toBe('LEARN_FEEDBACK');
    expect(msg.payload.feedback).toBe('like');
  });

  it('TrackSearchMessage has correct shape', () => {
    const msg: TrackSearchMessage = {
      type: 'TRACK_SEARCH',
      payload: { query: 'best laptop', platform: 'amazon' },
    };
    expect(msg.type).toBe('TRACK_SEARCH');
    expect(msg.payload.query).toBe('best laptop');
  });

  it('GetStatsMessage has null payload', () => {
    const msg: GetStatsMessage = { type: 'GET_STATS', payload: null };
    expect(msg.type).toBe('GET_STATS');
    expect(msg.payload).toBeNull();
  });

  it('BlockTopicMessage has topic in payload', () => {
    const msg: BlockTopicMessage = {
      type: 'BLOCK_TOPIC',
      payload: { topic: 'crypto' },
    };
    expect(msg.type).toBe('BLOCK_TOPIC');
    expect(msg.payload.topic).toBe('crypto');
  });

  it('SwitchContextMessage has context in payload', () => {
    const msg: SwitchContextMessage = {
      type: 'SWITCH_CONTEXT',
      payload: { context: 'work' },
    };
    expect(msg.type).toBe('SWITCH_CONTEXT');
    expect(msg.payload.context).toBe('work');
  });

  it('ImplicitSignalMessage has required fields', () => {
    const msg: ImplicitSignalMessage = {
      type: 'IMPLICIT_SIGNAL',
      payload: {
        topics: ['ai'],
        entities: ['openai'],
        platform: 'unknown',
        signalType: 'dwell_extended',
        contentId: 'abc123',
      },
    };
    expect(msg.type).toBe('IMPLICIT_SIGNAL');
    expect(msg.payload.signalType).toBe('dwell_extended');
    expect(msg.payload.contentId).toBe('abc123');
  });
});

// ── MessageResponse generic ───────────────────────────────────────────────────

describe('MessageResponse structure', () => {
  it('can represent a successful response with typed data', () => {
    const response: MessageResponse<{ count: number }> = {
      success: true,
      data: { count: 42 },
    };
    expect(response.success).toBe(true);
    expect(response.data!.count).toBe(42);
  });

  it('can represent an error response', () => {
    const response: MessageResponse<string> = {
      success: false,
      error: 'not found',
    };
    expect(response.success).toBe(false);
    expect(response.error).toBe('not found');
  });
});
