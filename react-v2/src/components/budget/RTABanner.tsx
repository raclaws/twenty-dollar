import { observer } from 'mobx-react-lite';
import { formatCurrency } from '@/lib/format';

interface RTABannerProps {
  rta: number;
}

export const RTABanner = observer(function RTABanner({ rta }: RTABannerProps) {
  const variant = rta === 0 ? 'rta--zero' : rta > 0 ? 'rta--positive' : 'rta--negative';

  const message =
    rta === 0
      ? 'All dollars have a job'
      : rta > 0
        ? 'Assign these dollars to categories'
        : 'You assigned more than you have';

  return (
    <div className={`rta-banner ${variant}`}>
      <span className="rta-banner__amount">Ready to Assign: {formatCurrency(Math.abs(rta))}</span>
      <span className="rta-banner__message">{message}</span>
    </div>
  );
});
