import { eventBus } from '../EventBus';

afterEach(() => {
  eventBus.clear();
});

describe('EventBus', () => {
  it('should emit and receive events', () => {
    const handler = jest.fn();
    eventBus.on('CONTENT_HIDDEN', handler);

    eventBus.emit('CONTENT_HIDDEN', { contentId: '123', topics: ['crypto'] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ contentId: '123', topics: ['crypto'] });
  });

  it('should support multiple listeners', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    eventBus.on('TOPIC_BLOCKED', handler1);
    eventBus.on('TOPIC_BLOCKED', handler2);

    eventBus.emit('TOPIC_BLOCKED', { topic: 'spam' });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should return unsubscribe function', () => {
    const handler = jest.fn();
    const unsub = eventBus.on('CONTENT_BOOSTED', handler);

    eventBus.emit('CONTENT_BOOSTED', { contentId: '1', topics: [] });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    eventBus.emit('CONTENT_BOOSTED', { contentId: '2', topics: [] });
    expect(handler).toHaveBeenCalledTimes(1); // no second call
  });

  it('should not propagate errors from listeners', () => {
    eventBus.on('CONTENT_HIDDEN', () => { throw new Error('boom'); });
    const handler2 = jest.fn();
    eventBus.on('CONTENT_HIDDEN', handler2);

    // Should not throw
    eventBus.emit('CONTENT_HIDDEN', { contentId: '1', topics: [] });
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should not fire listeners for different events', () => {
    const handler = jest.fn();
    eventBus.on('TOPIC_LIKED', handler);

    eventBus.emit('TOPIC_BLOCKED', { topic: 'test' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should clear all listeners', () => {
    const handler = jest.fn();
    eventBus.on('CONTENT_HIDDEN', handler);

    eventBus.clear();
    eventBus.emit('CONTENT_HIDDEN', { contentId: '1', topics: [] });

    expect(handler).not.toHaveBeenCalled();
  });
});
