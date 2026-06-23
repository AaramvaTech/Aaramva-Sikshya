import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { adToBs, formatBs } from 'bs-calendar';

import { useMyChildren, useChildLedger } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { useThemeColors } from '../../lib/theme/colors';
import {
  ScreenHeader, ChildPicker, Card, StatusBadge, EmptyState, ErrorState, LoadingBlock,
} from '../../components/ui';
import type { Invoice } from '../../types';

// Semantic fee-status palette (not brand-coupled). Mirrors the backend invoice
// status values: UNPAID / PARTIAL / PAID / OVERDUE.
const FEE_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  PAID:    { bg: '#d1fae5', text: '#065f46', label: 'Paid' },
  PARTIAL: { bg: '#fef3c7', text: '#92400e', label: 'Partial' },
  UNPAID:  { bg: '#fee2e2', text: '#dc2626', label: 'Unpaid' },
  OVERDUE: { bg: '#fee2e2', text: '#991b1b', label: 'Overdue' },
  WAIVED:  { bg: '#dbeafe', text: '#1d4ed8', label: 'Waived' },
};
const feeStatus = (status: string) => FEE_STATUS[status?.toUpperCase()] ?? FEE_STATUS.UNPAID;
const formatNPR = (amount: number) => `NPR ${amount.toLocaleString('en-IN')}`;

// An invoice may bundle several fee categories; show the categories when known,
// else fall back to the invoice number.
function invoiceTitle(inv: Invoice): string {
  const items = inv.items ?? [];
  if (items.length === 1) return items[0].feeCategoryName;
  if (items.length > 1) return `${items[0].feeCategoryName} +${items.length - 1} more`;
  return inv.invoiceNumber;
}

function InvoiceCard({ inv }: { inv: Invoice }) {
  const c = useThemeColors();
  const cfg = feeStatus(inv.status);
  const bsDue = inv.dueDate?.ad ? formatBs(adToBs(new Date(inv.dueDate.ad)), 'en') : null;
  return (
    <Card padded style={styles.feeCard}>
      <View style={styles.feeTop}>
        <View style={styles.feeInfo}>
          <Text className="text-foreground" style={styles.feeName}>{invoiceTitle(inv)}</Text>
          {bsDue && (
            <View style={styles.dueRow}>
              <Ionicons name="time-outline" size={12} color={c.mutedForeground} />
              <Text className="text-muted-foreground" style={styles.dueText}>Due: {bsDue}</Text>
            </View>
          )}
        </View>
        <View style={styles.feeRight}>
          <StatusBadge label={cfg.label} bg={cfg.bg} color={cfg.text} />
          <Text className="text-foreground" style={styles.amount}>{formatNPR(inv.totalAmount)}</Text>
          {inv.paidAmount > 0 && inv.paidAmount < inv.totalAmount && (
            <Text className="text-muted-foreground" style={styles.subAmount}>Paid: {formatNPR(inv.paidAmount)}</Text>
          )}
          {inv.balance > 0 && (
            <Text className="text-danger" style={styles.balance}>Due: {formatNPR(inv.balance)}</Text>
          )}
        </View>
      </View>
    </Card>
  );
}

export default function ParentFees() {
  const [refreshing, setRefreshing] = useState(false);
  const c = useThemeColors();

  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);
  useEffect(() => {
    if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);
  }, [selectedChildId, effectiveChildId, setSelectedChildId]);
  const selectedChild = children.find((ch) => ch.id === effectiveChildId) ?? null;
  const academicYearId = selectedChild?.currentEnrollment?.academicYearId ?? null;

  const ledgerQuery = useChildLedger(effectiveChildId ?? '', academicYearId);

  const ledger = ledgerQuery.data;
  const invoices = ledger?.invoices ?? [];
  const totalFees = ledger?.summary.totalInvoiced ?? 0;
  const totalPaid = ledger?.summary.totalPaid ?? 0;
  const outstanding = ledger?.summary.totalBalance ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await ledgerQuery.refetch();
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
        eyebrow={selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : 'Fees'}
        title="Fee Status"
        overlap
      >
        <ChildPicker children={children} selectedId={effectiveChildId} onSelect={setSelectedChildId} />
      </ScreenHeader>

      <View style={styles.cards}>
        {ledger && (
          <Card elevated padded={false} style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text className="text-muted-foreground" style={styles.summaryLabel}>Total Fees</Text>
                <Text className="text-foreground" style={styles.summaryValue}>{formatNPR(totalFees)}</Text>
              </View>
              <View className="border-l border-border" style={styles.summaryItem}>
                <Text className="text-muted-foreground" style={styles.summaryLabel}>Paid</Text>
                <Text style={[styles.summaryValue, { color: c.success }]}>{formatNPR(totalPaid)}</Text>
              </View>
              <View className="border-l border-border" style={styles.summaryItem}>
                <Text className="text-muted-foreground" style={styles.summaryLabel}>Outstanding</Text>
                <Text style={[styles.summaryValue, { color: outstanding > 0 ? c.danger : c.success }]}>
                  {formatNPR(outstanding)}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {ledgerQuery.isLoading ? (
          <Card><LoadingBlock /></Card>
        ) : ledgerQuery.isError ? (
          <Card><ErrorState compact title="Failed to load fees" onRetry={() => void ledgerQuery.refetch()} /></Card>
        ) : invoices.length === 0 ? (
          <Card><EmptyState icon="card-outline" title="No fee records" subtitle="Invoices will appear here once raised by the school." /></Card>
        ) : (
          invoices.map((inv) => <InvoiceCard key={inv.id} inv={inv} />)
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
  summaryCard: { marginBottom: 2 },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, padding: 18, alignItems: 'center' },
  summaryLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  summaryValue: { fontSize: 15, fontWeight: '800' },
  feeCard: { padding: 18 },
  feeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feeInfo: { flex: 1, marginRight: 12 },
  feeName: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  dueRow: { flexDirection: 'row', alignItems: 'center' },
  dueText: { fontSize: 12, marginLeft: 4 },
  feeRight: { alignItems: 'flex-end' },
  amount: { fontSize: 14, fontWeight: '800', marginTop: 6 },
  subAmount: { fontSize: 11, marginTop: 2 },
  balance: { fontSize: 11, marginTop: 1, fontWeight: '600' },
});
