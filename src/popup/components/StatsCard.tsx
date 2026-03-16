interface StatsCardProps {
  label: string;
  value: number | string;
  icon: string;
  color?: string;
}

export function StatsCard({ label, value, icon, color = '#6366f1' }: StatsCardProps) {
  return (
    <div className="stats-card" style={{ borderColor: `${color}33` }}>
      <div className="stats-icon" style={{ color }}>{icon}</div>
      <div className="stats-value" style={{ color }}>{value}</div>
      <div className="stats-label">{label}</div>
    </div>
  );
}
