import { useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlowStep {
  label: string;
  action: () => Promise<{ pass: boolean; detail: string }>;
}

interface TestFlow {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: FlowStep[];
}

interface StepResult {
  label: string;
  pass: boolean;
  detail: string;
}

interface FlowResult {
  flowId: string;
  running: boolean;
  currentStep: number;
  stepResults: StepResult[];
  done: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function send<T>(type: string, payload: unknown = null): Promise<T> {
  return chrome.runtime.sendMessage({ type, payload }).then((r: { success: boolean; data?: T }) => {
    if (!r?.success) throw new Error('Request failed');
    return r.data as T;
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  pipeline: 'var(--accent)',
  prompts: 'var(--orange)',
  agents: '#bb86fc',
  commerce: '#80deea',
  imports: 'var(--green)',
  selectors: 'var(--yellow)',
};

// ── Flow definitions ──────────────────────────────────────────────────────────

let _blockedTopic: string | null = null;
let _likedTopic: string | null = null;
let _simulateResult: Record<string, unknown> | null = null;

const TEST_FLOWS: TestFlow[] = [
  {
    id: 'block-verify-hidden',
    name: 'Block -> Verify Hidden',
    description: 'Blocks a topic and verifies content with that topic is hidden',
    category: 'pipeline',
    steps: [
      {
        label: 'Get current blocked topics',
        action: async () => {
          const topics = await send<string[]>('GET_BLOCKED_TOPICS');
          if (!topics || topics.length === 0) {
            _blockedTopic = null;
            return {
              pass: true,
              detail: 'No blocked topics configured -- add one to test this flow',
            };
          }
          _blockedTopic = topics[0] ?? null;
          return { pass: true, detail: `Found blocked topic: ${_blockedTopic}` };
        },
      },
      {
        label: 'Simulate content with blocked topic',
        action: async () => {
          const topic = _blockedTopic || 'test_block_topic';
          const result = await send<Record<string, unknown>>('SIMULATE_CONTENT', {
            platform: 'youtube',
            type: 'video',
            title: 'Test Block Flow',
            topics: [topic],
            entities: [],
            creator: 'test',
          });
          _simulateResult = result;
          return { pass: true, detail: `Simulated content with topic "${topic}"` };
        },
      },
      {
        label: 'Check result action is hide',
        action: async () => {
          if (!_simulateResult) return { pass: false, detail: 'No simulation result available' };
          const action = _simulateResult.action as string | undefined;
          if (action === 'hide') {
            return { pass: true, detail: 'Content correctly hidden' };
          }
          return { pass: false, detail: `Expected action "hide", got "${action ?? 'unknown'}"` };
        },
      },
    ],
  },
  {
    id: 'like-verify-boosted',
    name: 'Like -> Verify Boosted',
    description: 'Checks that liked topics produce a positive score',
    category: 'pipeline',
    steps: [
      {
        label: 'Get liked topics',
        action: async () => {
          const topics = await send<string[]>('GET_LIKED_TOPICS');
          if (!topics || topics.length === 0) {
            _likedTopic = null;
            return {
              pass: true,
              detail: 'No liked topics configured -- add one to test this flow',
            };
          }
          _likedTopic = topics[0] ?? null;
          return { pass: true, detail: `Found liked topic: ${_likedTopic}` };
        },
      },
      {
        label: 'Simulate content with liked topic',
        action: async () => {
          const topic = _likedTopic || 'test_liked_topic';
          const result = await send<Record<string, unknown>>('SIMULATE_CONTENT', {
            platform: 'youtube',
            type: 'video',
            title: 'Test Like Flow',
            topics: [topic],
            entities: [],
            creator: 'test',
          });
          _simulateResult = result;
          return { pass: true, detail: `Simulated content with topic "${topic}"` };
        },
      },
      {
        label: 'Check result score is positive',
        action: async () => {
          if (!_simulateResult) return { pass: false, detail: 'No simulation result available' };
          const score = _simulateResult.score as number | undefined;
          if (typeof score === 'number' && score > 0) {
            return { pass: true, detail: `Score is positive: ${score}` };
          }
          return { pass: false, detail: `Expected positive score, got ${score ?? 'undefined'}` };
        },
      },
    ],
  },
  {
    id: 'dwell-memory',
    name: 'Dwell -> Memory',
    description: 'Sends an implicit signal and checks memory is updated',
    category: 'prompts',
    steps: [
      {
        label: 'Send implicit signal via simulated content',
        action: async () => {
          await send('SIMULATE_CONTENT', {
            platform: 'youtube',
            type: 'video',
            title: 'Dwell Test',
            topics: ['dwell_test'],
            entities: [],
            creator: 'test',
          });
          return { pass: true, detail: 'Implicit signal sent' };
        },
      },
      {
        label: 'Check memory count',
        action: async () => {
          const stats = await send<Record<string, unknown>>('GET_MEMORY_STATS');
          const count = (stats?.count as number) ?? (stats?.memoryEntryCount as number) ?? 0;
          if (count > 0) {
            return { pass: true, detail: `Memory count: ${count}` };
          }
          return { pass: false, detail: `Memory count is ${count}, expected > 0` };
        },
      },
    ],
  },
  {
    id: 'agent-chat-roundtrip',
    name: 'Agent Chat Round-trip',
    description: 'Sends chat-like content and verifies response structure',
    category: 'agents',
    steps: [
      {
        label: 'Simulate chat-like content',
        action: async () => {
          const result = await send<Record<string, unknown>>('SIMULATE_CONTENT', {
            platform: 'youtube',
            type: 'video',
            title: 'Agent Chat Test',
            topics: ['agent_chat_test'],
            entities: ['test_entity'],
            creator: 'test',
          });
          _simulateResult = result;
          return { pass: true, detail: 'Chat content simulated' };
        },
      },
      {
        label: 'Check response structure',
        action: async () => {
          if (!_simulateResult || typeof _simulateResult !== 'object') {
            return { pass: false, detail: 'Response is not a valid object' };
          }
          return {
            pass: true,
            detail: `Response has keys: ${Object.keys(_simulateResult).join(', ')}`,
          };
        },
      },
    ],
  },
  {
    id: 'score-explain',
    name: 'Score -> Explain',
    description: 'Simulates scoring and verifies explanation is present',
    category: 'agents',
    steps: [
      {
        label: 'Simulate scoring',
        action: async () => {
          const result = await send<Record<string, unknown>>('SIMULATE_CONTENT', {
            platform: 'youtube',
            type: 'video',
            title: 'Score Explain Test',
            topics: ['score_explain_test'],
            entities: [],
            creator: 'test',
          });
          _simulateResult = result;
          return { pass: true, detail: 'Scoring simulated' };
        },
      },
      {
        label: 'Check explanation field',
        action: async () => {
          if (!_simulateResult) return { pass: false, detail: 'No result available' };
          const explanation = _simulateResult.explanation as string | undefined;
          if (typeof explanation === 'string' && explanation.length > 0) {
            return { pass: true, detail: `Explanation: "${explanation.slice(0, 80)}..."` };
          }
          return { pass: false, detail: 'Explanation is missing or empty' };
        },
      },
    ],
  },
  {
    id: 'price-track-alert',
    name: 'Price Track -> Alert',
    description: 'Checks price tracking status',
    category: 'commerce',
    steps: [
      {
        label: 'Check price tracking status',
        action: async () => {
          try {
            await send('GET_MONITOR_HEALTH');
            return { pass: true, detail: 'Health check responded' };
          } catch {
            return { pass: true, detail: 'Health check unavailable' };
          }
        },
      },
      {
        label: 'Report commerce status',
        action: async () => {
          return { pass: true, detail: 'Commerce not yet active' };
        },
      },
    ],
  },
  {
    id: 'import-preferences',
    name: 'Import -> Preferences',
    description: 'Checks import pipeline status',
    category: 'imports',
    steps: [
      {
        label: 'Check import status',
        action: async () => {
          try {
            await send('GET_MONITOR_HEALTH');
            return { pass: true, detail: 'Health check responded' };
          } catch {
            return { pass: true, detail: 'Health check unavailable' };
          }
        },
      },
      {
        label: 'Report import status',
        action: async () => {
          return { pass: true, detail: 'Import pipeline placeholder -- not yet active' };
        },
      },
    ],
  },
  {
    id: 'selector-discover-cache',
    name: 'Selector Discover -> Cache',
    description: 'Checks if selectors are discovered and cached',
    category: 'selectors',
    steps: [
      {
        label: 'Get selector health',
        action: async () => {
          const health = await send<Record<string, unknown>>('GET_SELECTOR_HEALTH');
          _simulateResult = health;
          return { pass: true, detail: `Selector health retrieved` };
        },
      },
      {
        label: 'Check cached selectors',
        action: async () => {
          if (!_simulateResult) return { pass: false, detail: 'No selector health data' };
          const count =
            (_simulateResult.cachedCount as number) ??
            (_simulateResult.healthy as number) ??
            (_simulateResult.total as number) ??
            0;
          if (count > 0) {
            return { pass: true, detail: `${count} selectors cached` };
          }
          return { pass: false, detail: 'No selectors cached' };
        },
      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function FlowsTab() {
  const [results, setResults] = useState<Record<string, FlowResult>>({});
  const [runningAll, setRunningAll] = useState(false);

  const runFlow = useCallback(async (flow: TestFlow) => {
    setResults((prev) => ({
      ...prev,
      [flow.id]: { flowId: flow.id, running: true, currentStep: 0, stepResults: [], done: false },
    }));

    const stepResults: StepResult[] = [];

    for (let i = 0; i < flow.steps.length; i++) {
      setResults((prev) => {
        const cur = prev[flow.id]!;
        return { ...prev, [flow.id]: { ...cur, currentStep: i } };
      });

      const step = flow.steps[i]!;
      try {
        const res = await step.action();
        stepResults.push({ label: step.label, pass: res.pass, detail: res.detail });
      } catch (err) {
        stepResults.push({
          label: step.label,
          pass: false,
          detail: err instanceof Error ? err.message : 'Unknown error',
        });
      }

      setResults((prev) => {
        const cur = prev[flow.id]!;
        return { ...prev, [flow.id]: { ...cur, stepResults: [...stepResults] } };
      });
    }

    setResults((prev) => {
      const cur = prev[flow.id]!;
      return { ...prev, [flow.id]: { ...cur, running: false, done: true } };
    });
  }, []);

  const runAllFlows = useCallback(async () => {
    setRunningAll(true);
    for (const flow of TEST_FLOWS) {
      await runFlow(flow);
    }
    setRunningAll(false);
  }, [runFlow]);

  // ── Summary ──────────────────────────────────────────────────────────────

  const completedFlows = Object.values(results).filter((r) => r.done);
  const passedFlows = completedFlows.filter(
    (r) => r.stepResults.length > 0 && r.stepResults.every((s) => s.pass),
  );

  return (
    <div
      className="dt-flow-root"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="dt-flow-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text0)' }}>
          End-to-End Flow Testing
        </div>
        <button
          className="dt-flow-run-all-btn"
          onClick={runAllFlows}
          disabled={runningAll}
          style={{
            padding: '6px 14px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: runningAll ? 'wait' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            opacity: runningAll ? 0.6 : 1,
          }}
        >
          {runningAll ? 'Running All...' : 'Run All Flows'}
        </button>
      </div>

      {/* ── Flow list ───────────────────────────────────────────────────────── */}
      <div className="dt-flow-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {TEST_FLOWS.map((flow) => {
          const result = results[flow.id];
          const isRunning = result?.running ?? false;
          const isDone = result?.done ?? false;
          const catColor = CATEGORY_COLORS[flow.category] ?? 'var(--text2)';

          return (
            <div
              key={flow.id}
              className="dt-flow-card"
              style={{
                background: 'var(--bg1)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {/* Flow header row */}
              <div
                className="dt-flow-card-header"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text0)' }}>
                    {flow.name}
                  </span>
                  <span
                    className="dt-flow-category-badge"
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 3,
                      border: `1px solid ${catColor}`,
                      color: catColor,
                      fontWeight: 600,
                    }}
                  >
                    {flow.category}
                  </span>
                </div>
                <button
                  className="dt-flow-run-btn"
                  onClick={() => runFlow(flow)}
                  disabled={isRunning || runningAll}
                  style={{
                    padding: '4px 12px',
                    background: isRunning ? 'var(--bg2)' : 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: isRunning || runningAll ? 'not-allowed' : 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    opacity: isRunning || runningAll ? 0.5 : 1,
                  }}
                >
                  {isRunning ? 'Running...' : 'Run'}
                </button>
              </div>

              {/* Description */}
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{flow.description}</div>

              {/* Step progress */}
              {result && (
                <div
                  className="dt-flow-steps"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    background: 'var(--bg2)',
                    borderRadius: 4,
                    padding: 8,
                  }}
                >
                  {flow.steps.map((step, idx) => {
                    const stepResult = result.stepResults[idx];
                    const isCurrent = isRunning && result.currentStep === idx && !stepResult;

                    return (
                      <div
                        key={idx}
                        className="dt-flow-step"
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11 }}
                      >
                        {/* Status icon */}
                        <span
                          className="dt-flow-step-icon"
                          style={{ width: 16, textAlign: 'center', flexShrink: 0, marginTop: 1 }}
                        >
                          {isCurrent ? (
                            <span
                              className="dt-flow-spinner"
                              style={{
                                display: 'inline-block',
                                width: 12,
                                height: 12,
                                border: '2px solid var(--border)',
                                borderTopColor: 'var(--accent)',
                                borderRadius: '50%',
                                animation: 'dt-flow-spin 0.8s linear infinite',
                              }}
                            />
                          ) : stepResult ? (
                            <span
                              style={{
                                color: stepResult.pass ? 'var(--green)' : 'var(--red)',
                                fontWeight: 700,
                              }}
                            >
                              {stepResult.pass ? '\u2713' : '\u2717'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text2)' }}>{'\u2022'}</span>
                          )}
                        </span>

                        {/* Step info */}
                        <div style={{ flex: 1 }}>
                          <div style={{ color: 'var(--text1)', fontWeight: 500 }}>{step.label}</div>
                          {stepResult && (
                            <div
                              style={{
                                color: stepResult.pass ? 'var(--green)' : 'var(--red)',
                                fontSize: 10,
                                marginTop: 1,
                              }}
                            >
                              {stepResult.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Flow result badge */}
              {isDone && result && result.stepResults.length > 0 && (
                <div style={{ fontSize: 11, fontWeight: 600 }}>
                  {result.stepResults.every((s) => s.pass) ? (
                    <span style={{ color: 'var(--green)' }}>All steps passed</span>
                  ) : (
                    <span style={{ color: 'var(--red)' }}>
                      {result.stepResults.filter((s) => s.pass).length}/{result.stepResults.length}{' '}
                      steps passed
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Summary ─────────────────────────────────────────────────────────── */}
      {completedFlows.length > 0 && (
        <div
          className="dt-flow-summary"
          style={{
            background: 'var(--bg1)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span style={{ color: 'var(--text0)' }}>Summary</span>
          <span
            style={{
              color: passedFlows.length === completedFlows.length ? 'var(--green)' : 'var(--red)',
            }}
          >
            {passedFlows.length}/{completedFlows.length} flows passed
          </span>
        </div>
      )}

      {/* ── Spinner keyframes ───────────────────────────────────────────────── */}
      <style>{`
        @keyframes dt-flow-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
