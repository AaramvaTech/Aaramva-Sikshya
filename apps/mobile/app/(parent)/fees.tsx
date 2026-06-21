import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { adToBs, formatBs } from 'bs-calendar';

import { useMyChildren, useChildFees, useChildLedger } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { useThemeColors } from '../../lib/theme/colors';
import {
  ScreenHeader, ChildPicker, Card, StatusBadge, EmptyState, ErrorState, LoadingBlock,
} from '../../components/ui';
import type { FeeAssignment } from '../../types';

// Semantic fee-status palette (not brand-coupled).
const FEE_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  PAID:    { bg: '#d1fae5', text: '#065f46', label: 'Paid' },
  PARTIAL: { bg: '#fef3c7', text: '#92400e', label: 'Partial' },
  UNPAID:  { bg: '#fee2e2', text: '#dc2626', label: 'Unpaid' },
  OVERDUE: { bg: '#fee2e2', text: '#991b1b', label: 'Overdue' },
  WAIVED:  { bg: '#dbeafe', text: '#1d4ed8', label: 'Waived' },
};
const feeStatus = (status: string) => FEE_STATUS[status?.toUpperCase()] ?? FEE_STATUS.UNPAID;
const formatNPR = (amount: number) => `NPR ${amount.toLocaleString('en-IN')}`;

function FeeCard({ fee }: { fee: FeeAssignment }) {
  const c = useThemeColors();
  const cfg = feeStatus(fee.status);
  const bsDue = fee.dueDate ? formatBs(adToBs(new Date(fee.dueDate)), 'en') : null;
  return (
    <Card padded style={styles.feeCard}>
      <View style={styles.feeTop}>
        <View style={styles.feeInfo}>
          <Text className="text-foreground" style={styles.feeName}>{fee.feeCategoryName}</Text>
          {bsDue && (
            <View style={styles.dueRow}>
              <Ionicons name="time-outline" size={12} color={c.mutedForeground} />
              <Text className="text-muted-foreground" style={styles.dueText}>Due: {bsDue}</Text>
            </View>
          )}
        </View>
        <View style={styles.feeRight}>
          <StatusBadge label={cfg.label} bg={cfg.bg} color={cfg.text} />
          <Text className="text-foreground" style={styles.amount}>{formatNPR(fee.amount)}</Text>
          {fee.paidAmount > 0 && fee.paidAmount < fee.amount && (
            <Text className="text-muted-foreground" style={styles.subAmount}>Paid: {formatNPR(fee.paidAmount)}</Text>
          )}
          {fee.balance > 0 && (
            <Text className="text-danger" style={styles.balance}>Due: {formatNPR(fee.balance)}</Text>
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

  const feesQuery = useChildFees(effectiveChildId ?? '', academicYearId);
  const ledgerQuery = useChildLedger(effectiveChildId ?? '', academicYearId);

  const fees = feesQuery.data ?? [];
  const ledger = ledgerQuery.data;
  const outstanding = ledger?.outstanding ?? fees.reduce((sum, f) => sum + f.balance, 0);
  const totalFees = ledger?.totalFees ?? fees.reduce((sum, f) => sum + f.amount, 0);
  const totalPaid = ledger?.totalPaid ?? fees.reduce((sum, f) => sum + f.paidAmount, 0);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([feesQuery.refetch(), ledgerQuery.refetch()]);
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
        {(feesQuery.data || ledger) && (
          <Card elevated padded={false} style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text className="text-muted-foreground" style={styles.summaryLabel}>Total Fees</Text>
                <Text className="text-foreground" style={styles.summaryValue}>{formatNPR(totalFees)}</Text>
              </View>
              <View className="border-l border-border" style={styles.summaryItem}>
                <Text className="text-muted-foreground" style={styles.summaryLabel}>Paid</Text>
                <Text style={[styles.summaryValue, { color: '#065f46' }]}>{formatNPR(totalPaid)}</Text>
              </View>
              <View className="border-l border-border" style={styles.summaryItem}>
                <Text className="text-muted-foreground" style={styles.summaryLabel}>Outstanding</Text>
                <Text style={[styles.summaryValue, { color: outstanding > 0 ? '#dc2626' : '#065f46' }]}>
                  {formatNPR(outstanding)}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {feesQuery.isLoading ? (
          <Card><LoadingBlock /></Card>
        ) : feesQuery.isError ? (
          <Card><ErrorState compact title="Failed to load fees" onRetry={() => void feesQuery.refetch()} /></Card>
        ) : fees.length === 0 ? (
          <Card><EmptyState icon="card-outline" title="No fee records" /></Card>
        ) : (
          fees.map((fee) => <FeeCard key={fee.id} fee={fee} />)
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
