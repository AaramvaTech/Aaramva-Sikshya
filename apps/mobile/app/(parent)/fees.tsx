import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { adToBs, formatBs } from 'bs-calendar';

import { useMyChildren, useChildFees, useChildLedger } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import type { FeeAssignment } from '../../types';

const STATUS_FEE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  PAID:       { bg: '#d1fae5', text: '#065f46', label: 'Paid'       },
  PARTIAL:    { bg: '#fef3c7', text: '#92400e', label: 'Partial'    },
  UNPAID:     { bg: '#fee2e2', text: '#dc2626', label: 'Unpaid'     },
  OVERDUE:    { bg: '#fee2e2', text: '#991b1b', label: 'Overdue'    },
  WAIVED:     { bg: '#dbeafe', text: '#1d4ed8', label: 'Waived'     },
};

function feeStatusConfig(status: string) {
  return STATUS_FEE_CONFIG[status?.toUpperCase()] ?? STATUS_FEE_CONFIG['UNPAID'];
}

function formatNPR(amount: number): string {
  return `NPR ${amount.toLocaleString('en-IN')}`;
}

function FeeCard({ fee }: { fee: FeeAssignment }) {
  const cfg = feeStatusConfig(fee.status);
  const bsDue = fee.dueDate ? formatBs(adToBs(new Date(fee.dueDate)), 'en') : null;

  return (
    <View style={styles.feeCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 4 }}>
            {fee.feeCategoryName}
          </Text>
          {bsDue && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="time-outline" size={12} color="#9ca3af" />
              <Text style={{ fontSize: 12, color: '#9ca3af', marginLeft: 4 }}>Due: {bsDue}</Text>
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', marginTop: 6 }}>
            {formatNPR(fee.amount)}
          </Text>
          {fee.paidAmount > 0 && fee.paidAmount < fee.amount && (
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              Paid: {formatNPR(fee.paidAmount)}
            </Text>
          )}
          {fee.balance > 0 && (
            <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 1, fontWeight: '600' }}>
              Due: {formatNPR(fee.balance)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ParentFees() {
  const [refreshing, setRefreshing] = useState(false);

  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);
  if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);
  const selectedChild = children.find((c) => c.id === effectiveChildId) ?? null;
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
      style={styles.root}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e3a5f" />}
    >
      <LinearGradient
        colors={['#0f172a', '#1e3a5f', '#1e40af']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 72, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#93c5fd', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          {selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : 'Fees'}
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
          Fee Status
        </Text>

        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {children.map((c) => {
              const sel = c.id === effectiveChildId;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={{
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                    backgroundColor: sel ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)',
                    marginRight: 8,
                  }}
                  onPress={() => setSelectedChildId(c.id)}
                >
                  <Text style={{ color: sel ? '#1e3a5f' : '#bfdbfe', fontSize: 13, fontWeight: '600' }}>
                    {c.firstName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </LinearGradient>

      <View style={{ marginTop: -52, paddingHorizontal: 16, paddingBottom: 32 }}>
        {/* Summary card */}
        {(feesQuery.data || ledger) && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Fees</Text>
                <Text style={styles.summaryValue}>{formatNPR(totalFees)}</Text>
              </View>
              <View style={[styles.summaryItem, { borderLeftWidth: 1, borderLeftColor: '#f3f4f6' }]}>
                <Text style={styles.summaryLabel}>Paid</Text>
                <Text style={[styles.summaryValue, { color: '#065f46' }]}>{formatNPR(totalPaid)}</Text>
              </View>
              <View style={[styles.summaryItem, { borderLeftWidth: 1, borderLeftColor: '#f3f4f6' }]}>
                <Text style={styles.summaryLabel}>Outstanding</Text>
                <Text style={[styles.summaryValue, { color: outstanding > 0 ? '#dc2626' : '#065f46' }]}>
                  {formatNPR(outstanding)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Fee list */}
        {feesQuery.isLoading ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 40 }]}>
            <ActivityIndicator size="small" color="#1e3a5f" />
          </View>
        ) : feesQuery.isError ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 32 }]}>
            <Ionicons name="cloud-offline-outline" size={40} color="#d1d5db" />
            <Text style={{ color: '#374151', fontWeight: '600', marginTop: 12 }}>Failed to load fees</Text>
            <TouchableOpacity
              onPress={() => void feesQuery.refetch()}
              style={{ backgroundColor: '#1e3a5f', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 12 }}
            >
              <Text style={{ color: 'white', fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : fees.length === 0 ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 40 }]}>
            <Ionicons name="card-outline" size={44} color="#d1d5db" />
            <Text style={{ color: '#374151', fontWeight: '600', fontSize: 16, marginTop: 12 }}>
              No fee records
            </Text>
          </View>
        ) : (
          fees.map((fee) => <FeeCard key={fee.id} fee={fee} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  card: {
    backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  summaryCard: {
    backgroundColor: 'white', borderRadius: 24, padding: 0, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
    overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, padding: 20, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  summaryValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  feeCard: {
    backgroundColor: 'white', borderRadius: 20, padding: 18, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  statusBadge: {
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
});
