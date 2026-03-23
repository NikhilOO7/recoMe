interface TraceEvent {
  type: string;
  summary: string;
  timestamp: number;
  details: Record<string, unknown>;
}

interface PipelineTrace {
  traceId: string;
  contentTitle: string;
  platform: string;
  events: TraceEvent[];
  startTime: number;
  endTime?: number;
  finalAction?: string;
  finalScore?: number;
  durationMs?: number;
  agentsInvolved?: string[];
}

interface Props {
  trace: PipelineTrace;
  onClose?: () => void;
}

export function PipelineTraceView({ trace, onClose }: Props) {
  const steps = trace.events.sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="dt-trace-panel">
      <div className="dt-trace-header">
        <span className="dt-trace-title">{trace.contentTitle || trace.traceId}</span>
        <span className={`platform-badge platform-${trace.platform}`}>{trace.platform}</span>
        {trace.durationMs != null && (
          <span className="dt-trace-duration">{trace.durationMs.toFixed(1)}ms</span>
        )}
        {trace.finalAction && (
          <span className={`action-${trace.finalAction}`}>{trace.finalAction.toUpperCase()}</span>
        )}
        {onClose && (
          <button className="dt-btn" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="dt-trace-steps">
        {steps.map((step, i) => {
          const delta = i > 0 ? step.timestamp - steps[i - 1]!.timestamp : 0;
          return (
            <div key={i} className="dt-trace-step">
              {i > 0 && <div className="dt-trace-connector" />}
              <div className="dt-trace-step-dot" />
              <div className="dt-trace-step-content">
                <div className="dt-trace-step-label">
                  <span className="dt-trace-step-type">{step.type}</span>
                  {i > 0 && <span className="dt-trace-step-delta">+{delta}ms</span>}
                </div>
                <div className="dt-trace-step-summary">{step.summary}</div>
                {Object.keys(step.details).length > 0 && (
                  <div className="dt-trace-step-details">
                    {Object.entries(step.details).map(([k, v]) => (
                      <span key={k} className="dt-trace-detail">
                        {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {trace.agentsInvolved && trace.agentsInvolved.length > 0 && (
        <div className="dt-trace-agents">Agents: {trace.agentsInvolved.join(', ')}</div>
      )}
    </div>
  );
}
