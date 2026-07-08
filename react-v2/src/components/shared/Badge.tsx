import type { ReactNode } from 'react';

interface BadgeProps {
  variant: 'positive' | 'negative' | 'warning' | 'neutral' | 'info';
  children: ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
