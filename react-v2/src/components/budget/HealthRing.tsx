interface HealthRingProps {
  available: number;
  activity: number;
  size?: number;
}

export function HealthRing({ available, activity, size = 20 }: HealthRingProps) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const ratio = (() => {
    if (available < 0) return 0;
    const absActivity = Math.abs(activity);
    if (absActivity === 0) return available > 0 ? 1 : 0;
    return Math.min(available / absActivity, 1);
  })();

  const color = (() => {
    if (available < 0) return 'var(--c-negative)';
    if (ratio >= 0.75) return 'var(--c-positive)';
    if (ratio >= 0.25) return 'var(--c-warning)';
    return 'var(--c-negative)';
  })();

  const dashOffset = circumference * (1 - ratio);

  return (
    <svg width={size} height={size} className="health-ring">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--c-surface0)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
