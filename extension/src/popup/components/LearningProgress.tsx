import { useEffect, useState } from 'react';

interface LearningState {
  memoryCount: number;
  entityCount: number;
  relationCount: number;
  blockedCount: number;
  likedCount: number;
  totalHidden: number;
}

function send(
  type: string,
  payload: unknown = null,
): Promise<{ success: boolean; data?: unknown }> {
  return chrome.runtime.sendMessage({ type, payload });
}

/**
 * Milestones that show the user how their preference graph is growing.
 * Each milestone unlocks when the threshold is met.
 */
const MILESTONES = [
  {
    id: 'first_pref',
    label: 'Set a preference',
    check: (s: LearningState) => s.blockedCount + s.likedCount >= 1,
  },
  {
    id: 'first_hide',
    label: 'First card filtered',
    check: (s: LearningState) => s.totalHidden >= 1,
  },
  {
    id: 'five_memories',
    label: '5 memories formed',
    check: (s: LearningState) => s.memoryCount >= 5,
  },
  {
    id: 'ten_entities',
    label: '10 topics learned',
    check: (s: LearningState) => s.entityCount >= 10,
  },
  {
    id: 'twenty_five_hidden',
    label: '25 cards filtered',
    check: (s: LearningState) => s.totalHidden >= 25,
  },
  {
    id: 'fifty_relations',
    label: '50 connections mapped',
    check: (s: LearningState) => s.relationCount >= 50,
  },
  {
    id: 'hundred_hidden',
    label: '100 cards filtered',
    check: (s: LearningState) => s.totalHidden >= 100,
  },
  {
    id: 'graph_growing',
    label: 'Graph is thriving',
    check: (s: LearningState) => s.entityCount >= 50 && s.relationCount >= 100,
  },
];

export function LearningProgress() {
  const [state, setState] = useState<LearningState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([send('GET_GRAPH_SUMMARY'), send('GET_STATS'), send('GET_DB_STATS')])
      .then(([graphRes, statsRes, dbRes]) => {
        const graph = graphRes.data as
          | {
              entityCount?: number;
              relationCount?: number;
              memoryCount?: number;
            }
          | undefined;
        const stats = statsRes.data as
          | {
              total_hidden?: number;
            }
          | undefined;
        const db = dbRes.data as
          | {
              blocked?: string[];
              liked?: string[];
            }
          | undefined;

        setState({
          memoryCount: graph?.memoryCount ?? 0,
          entityCount: graph?.entityCount ?? 0,
          relationCount: graph?.relationCount ?? 0,
          blockedCount: db?.blocked?.length ?? 0,
          likedCount: db?.liked?.length ?? 0,
          totalHidden: stats?.total_hidden ?? 0,
        });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !state) return null;

  const completedCount = MILESTONES.filter((m) => m.check(state)).length;
  const progress = completedCount / MILESTONES.length;

  // Don't show if graph is already thriving (all milestones complete)
  if (completedCount === MILESTONES.length) return null;

  // Don't show if absolutely nothing has happened (no preferences at all)
  const hasAnyActivity =
    state.blockedCount > 0 ||
    state.likedCount > 0 ||
    state.totalHidden > 0 ||
    state.memoryCount > 0;
  if (!hasAnyActivity) return null;

  return (
    <div className="learning-progress">
      <h3 className="section-title">Learning Progress</h3>
      <div className="learning-bar-wrap">
        <div className="learning-bar-fill" style={{ width: `${Math.max(progress * 100, 4)}%` }} />
        <span className="learning-bar-label">
          {completedCount}/{MILESTONES.length} milestones
        </span>
      </div>
      <div className="learning-milestones">
        {MILESTONES.map((m) => {
          const done = m.check(state);
          return (
            <div key={m.id} className={`learning-milestone ${done ? 'done' : 'pending'}`}>
              <span className="learning-milestone-check">{done ? '\u2713' : '\u25CB'}</span>
              <span className="learning-milestone-label">{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
