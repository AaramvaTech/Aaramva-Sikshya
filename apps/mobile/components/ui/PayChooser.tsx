import { View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PrimaryButton } from './PrimaryButton';

export type PayGateway = 'ESEWA' | 'KHALTI';

const GATEWAY_NAMES: Record<PayGateway, string> = {
  ESEWA: 'eSewa',
  KHALTI: 'Khalti',
};

/**
 * The invoice pay action (PAY-2 T3): one button per ENABLED gateway — a
 * two-option chooser when both eSewa and Khalti are configured, a single
 * button when one is, nothing when the server has no gateway. Pure and
 * prop-driven so the chooser states are render-testable.
 */
export function PayChooser({
  balanceLabel,
  gateways,
  payingWith,
  onPay,
  style,
}: {
  /** Formatted amount, e.g. "Rs. 1,500" — becomes "Pay Rs. 1,500 with eSewa". */
  balanceLabel: string;
  gateways: { esewa: boolean; khalti: boolean };
  /** Gateway currently initiating (spinner on it, other disabled), or null. */
  payingWith: PayGateway | null;
  onPay: (gateway: PayGateway) => void;
  style?: ViewStyle;
}) {
  const { t } = useTranslation('common');
  const enabled: PayGateway[] = [
    ...(gateways.esewa ? (['ESEWA'] as const) : []),
    ...(gateways.khalti ? (['KHALTI'] as const) : []),
  ];
  if (enabled.length === 0) return null;

  return (
    <View style={[{ gap: 8 }, style]}>
      {enabled.map((gw) => (
        <PrimaryButton
          key={gw}
          label={t('pay.payWith', { amount: balanceLabel, gateway: GATEWAY_NAMES[gw] })}
          icon="account_balance_wallet"
          variant="soft"
          loading={payingWith === gw}
          disabled={payingWith !== null && payingWith !== gw}
          onPress={() => onPay(gw)}
        />
      ))}
    </View>
  );
}
