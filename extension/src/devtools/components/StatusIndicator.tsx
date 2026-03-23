interface Props {
  status: 'ok' | 'degraded' | 'error' | 'unknown' | 'placeholder';
  label: string;
  detail?: string;
}

export function StatusIndicator({ status, label, detail }: Props) {
  return (
    <span className={`dt-status-indicator dt-status-${status}`} title={detail}>
      <span className="dt-status-dot" />
      <span className="dt-status-label">{label}</span>
    </span>
  );
}
