import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useState } from 'react';
import { formatBs } from 'bs-calendar';

import { useLocale, bsLang } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { useMyChildren, useChildStatement } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { useThemeColors } from '../../lib/theme/colors';
import { ScreenHeader, Card, CardLabel, EmptyState, ErrorState } from '../../components/ui';
import Skeleton from '../../components/Skeleton';
import type { LedgerEntry } from '../../types';

const formatNPR = (amount: number) => `NPR ${Math.abs(amount).toLocaleString('en-IN')}`;

/**
 * BILL-CHECKOUT-1 — the account tile's drill-down.
 *
 * Required by this ticket, not deferred: under own-charge semantics a late
 * fee appears on NO invoice card, because a fine is a ledger entry with no
 * invoice row of its own. Cards are the only thing with a Pay button, so
 * without this screen a fine becomes a charge a parent can see in their
 * balance and cannot account for. Every entry that moves the balance shows
 * up here, whether or not it produced an invoice.
 *
 * Read-only. There is deliberately no Pay action here — payment is
 * per-invoice, on the Fees cards. A parent clearing arrears pays the
 * individual months, which is what the Fees list already offers.
 */
const ENTRY_LABEL_KEYS: Record<string, string> = {
  OPENING_BALANCE: 'statement.type.openingBalance',
  INVOICE: 'statement.type.invoice',
  PAYMENT: 'statement.type.payment',
  DEPOSIT: 'statement.type.deposit',
  REFUND: 'statement.type.refund',
  CREDIT_NOTE: 'statement.type.creditNote',
  FINE: 'statement.type.fine',
  WRITE_OFF: 'statement.type.writeOff',
  ADJUSTMENT: 'statement.type.adjustment',
};

function EntryRow({ entry }: { entry: LedgerEntry }) {
  const c = useThemeColors();
  const { t, locale } = useLocale('parent');
  // A debit increases what the student owes; a credit reduces it.
  const isCharge = entry.debit > 0;
  const amount = isCharge ? entry.debit : entry.credit;
  const bs = entry.entryBs
    ? formatBs({ year: entry.entryBs.year, month: entry.entryBs.month, day: entry.entryBs.day }, bsLang(locale))
    : entry.entryDate;
  const labelKey = ENTRY_LABEL_KEYS[entry.entryType];

  return (
    <View className="border-b border-border" style={styles.row}>
      <View style={styles.rowLeft}>
        <NpText className="text-foreground" style={styles.rowType}>
          {labelKey ? t(labelKey) : entry.entryType}
        </NpText>
        {!!entry.narration && (
          <NpText className="text-muted-foreground" style={styles.rowNarration} numberOfLines={2}>
            {entry.narration}
          </NpText>
        )}
        <NpText className="text-muted-foreground" style={styles.rowDate}>{bs}</NpText>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowAmount, { color: isCharge ? c.danger : c.success }]}>
          {isCharge ? '+' : '−'}{formatNPR(amount)}
        </Text>
        {entry.runningBalance !== undefined && (
          <NpText className="text-muted-foreground" style={styles.rowBalance}>
            {t('statement.runningBalance', { amount: formatNPR(entry.runningBalance) })}
          </NpText>
        )}
      </View>
    </View>
  );
}

export default function ParentStatement() {
  const [refreshing, setRefreshing] = useState(false);
  const c = useThemeColors();
  const { t } = useLocale('parent');

  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);
  const selectedChild = children.find((ch) => ch.id === effectiveChildId) ?? null;

  const statementQuery = useChildStatement(effectiveChildId ?? '');
  const statement = statementQuery.data;

  const onRefresh = async () => {
    setRefreshing(true);
    await statementQuery.refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="bg-background"
      style={styles.fill}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      <ScreenHeader
        eyebrow={selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : undefined}
        title={t('statement.title')}
        subtitle={t('statement.subtitle')}
        overlap
      />

      <View style={styles.cards}>
        {statementQuery.isLoading || !effectiveChildId ? (
          <>{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 76 }} className="rounded-2xl" />)}</>
        ) : statementQuery.isError ? (
          <Card><ErrorState compact title={t('statement.errorTitle')} onRetry={() => void statementQuery.refetch()} /></Card>
        ) : !statement || statement.entries.length === 0 ? (
          <Card><EmptyState icon="document-text-outline" title={t('statement.emptyTitle')} subtitle={t('statement.emptySubtitle')} /></Card>
        ) : (
          <>
            <Card elevated padded style={styles.summaryCard}>
              <CardLabel>{t('statement.closingLabel')}</CardLabel>
              <Text
                className="text-foreground"
                style={[styles.closing, { color: statement.closingBalance > 0 ? c.danger : c.success }]}
              >
                {formatNPR(statement.closingBalance)}
              </Text>
              <NpText className="text-muted-foreground" style={styles.closingHint}>
                {statement.closingBalance > 0
                  ? t('statement.owes')
                  : statement.closingBalance < 0
                    ? t('statement.advance')
                    : t('statement.settled')}
              </NpText>
            </Card>

            <Card padded={false} style={styles.listCard}>
              {statement.entries.map((e: LedgerEntry) => <EntryRow key={e.id} entry={e} />)}
            </Card>

            <NpText className="text-muted-foreground" style={styles.footnote}>
              {t('statement.footnote')}
            </NpText>
          </>
        )}
        <View style={styles.bottomSpace} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cards: { marginTop: -56, paddingHorizontal: 16, gap: 10 },
  bottomSpace: { height: 14 },
  summaryCard: { alignItems: 'center', paddingVertical: 20 },
  closing: { fontSize: 26, fontWeight: '800', marginTop: 6 },
  closingHint: { fontSize: 12, marginTop: 4 },
  listCard: { overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  rowLeft: { flex: 1, marginRight: 12 },
  rowType: { fontSize: 13, fontWeight: '700' },
  rowNarration: { fontSize: 11, marginTop: 2 },
  rowDate: { fontSize: 11, marginTop: 3 },
  rowRight: { alignItems: 'flex-end' },
  rowAmount: { fontSize: 14, fontWeight: '800' },
  rowBalance: { fontSize: 10, marginTop: 3 },
  footnote: { fontSize: 11, textAlign: 'center', paddingHorizontal: 12, marginTop: 2 },
});
