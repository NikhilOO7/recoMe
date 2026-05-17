import { describe, it, expect } from 'vitest';
import { AgentRegistry } from '../AgentRegistry.js';
import { BaseAgent } from '../BaseAgent.js';
import type { AgentResult, AgentContext, AgentTrigger } from '../types.js';

class StubAgent extends BaseAgent {
  constructor(
    public readonly name: string,
    public readonly triggers: ReadonlyArray<AgentTrigger>,
  ) {
    super();
  }
  readonly displayName = this.name;
  async run(_ctx: AgentContext): Promise<AgentResult> {
    return { status: 'skipped', reason: 'stub' };
  }
}

describe('AgentRegistry', () => {
  it('registers and looks up by name', () => {
    const reg = new AgentRegistry();
    const a = new StubAgent('alpha', ['scheduled']);
    reg.register(a);
    expect(reg.byName('alpha')).toBe(a);
    expect(reg.byName('missing')).toBeUndefined();
  });

  it('rejects duplicate registration to prevent silent override', () => {
    // Double-register would be a bug — masks one agent's behaviour with
    // another's and is impossible to debug later. Fail loud at boot.
    const reg = new AgentRegistry();
    reg.register(new StubAgent('alpha', ['scheduled']));
    expect(() => reg.register(new StubAgent('alpha', ['scheduled']))).toThrow(/already registered/);
  });

  it('filters by trigger mode', () => {
    const reg = new AgentRegistry();
    reg.register(new StubAgent('event-only', ['event']));
    reg.register(new StubAgent('multi', ['event', 'on_demand']));
    reg.register(new StubAgent('cron', ['scheduled']));

    const eventers = reg
      .byTrigger('event')
      .map((a) => a.name)
      .sort();
    expect(eventers).toEqual(['event-only', 'multi']);
    expect(reg.byTrigger('scheduled').map((a) => a.name)).toEqual(['cron']);
    expect(reg.byTrigger('on_demand').map((a) => a.name)).toEqual(['multi']);
  });
});
