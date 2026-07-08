import { formatCurrency } from '@/lib/format';

interface MoneyDisplayProps {
  amount: number;
  unsigned?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function MoneyDisplay({ amount, unsigned, size }: MoneyDisplayProps) {
  const variant = amount > 0 ? 'money--positive' : amount < 0 ? 'money--negative' : 'money--zero';
  const sizeClass = size ? `money--${size}` : '';
  const className = `money ${variant} ${sizeClass}`.trim();

  const text = unsigned
    ? formatCurrency(Math.abs(amount)).replace(/^-/, '')
    : formatCurrency(amount);

  return <span className={className}>{text}</span>;
}
