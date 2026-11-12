import { useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Paragraph } from './native';
import { useT } from './i18n';

export function TicketQr({ payload }: { payload: string }) {
  const { width } = useWindowDimensions();
  const t = useT();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
      <View accessibilityRole="image" accessibilityLabel={t('Ticket QR code')}>
        <QRCode
          value={payload}
          size={Math.max(120, Math.min(280, width - 120))}
          quietZone={16}
          ecl="M"
        />
      </View>
      <Paragraph>
        {t('Show this QR code at the entrance. Increase your screen brightness.')}
      </Paragraph>
    </View>
  );
}
