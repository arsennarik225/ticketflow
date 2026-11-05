import { useMemo } from 'react';
import { create } from 'qrcode';
import { useT } from './i18n';

// Encode the API's signed payload locally: the phone and PDF use the same ticket.
export function TicketQr({ payload }: { payload: string }) {
  const t = useT();
  const { size, path } = useMemo(() => {
    const { modules } = create(payload, { errorCorrectionLevel: 'M' });
    const cells: string[] = [];
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) cells.push(`M${col + 4} ${row + 4}h1v1h-1z`);
      }
    }
    return { size: modules.size + 8, path: cells.join('') };
  }, [payload]);
  return (
    <figure className="ticket-qr">
      <svg
        role="img"
        aria-label={t('Ticket QR code')}
        viewBox={`0 0 ${size} ${size}`}
        width="320"
        height="320"
        shapeRendering="crispEdges"
      >
        <rect width={size} height={size} fill="#fff" />
        <path d={path} fill="#000" />
      </svg>
      <figcaption>
        {t('Show this QR code at the entrance. Increase your screen brightness.')}
      </figcaption>
    </figure>
  );
}
