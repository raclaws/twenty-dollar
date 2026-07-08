interface HealthRingProps {
  progress: number; // 0–1
  size?: number;
  strokeWidth?: number;
}

export function HealthRing({ progress, size = 20, strokeWidth = 2.5 }: HealthRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const strokeDashoffset = circumference * (1 - clamped);

  const color =
    clamped >= 1
      ? '#a6e3a1' // funded green
      : clamped >= 0.5
        ? '#f9e2af' // amber
        : '#f38ba8'; // red

  return (
    <svg
      width={size}
      height={size}
      className="flex-shrink-0"
      aria-label={`${Math.round(clamped * 100)}% progress`}
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-zinc-700"
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
