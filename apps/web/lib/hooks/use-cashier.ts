import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashierApi } from '@/lib/api/cashier.api';
import { useTenantStore } from '@/store/tenant.store';
import { useAuthStore } from '@/store/auth.store';
import type { OpenShiftData, CloseShiftData } from '@/types/api.types';

/** UI-6 §4.10 — the Cashier tab: open/close + shift history. */

export function useCashierShifts(params: { cashierId?: string; date?: string } = {}) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['cashier-shifts', params],
    queryFn: () => cashierApi.listShifts(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

/** The signed-in user's own OPEN shift (undefined data = none). */
export function useMyOpenShift() {
  const slug = useTenantStore((s) => s.slug);
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['cashier-shifts', 'my-open', userId],
    queryFn: () => cashierApi.listShifts({ cashierId: userId, status: 'OPEN' }).then((r) => r.data.data[0] ?? null),
    enabled: !!slug && !!userId,
  });
}

/** Today's (Nepal day) cash received outside every shift window, current cashier only. */
export function useOutsideShiftCash() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['cashier-outside-shift-cash'],
    queryFn: () => cashierApi.outsideShiftCash().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useShiftPayments(shiftId: string | null) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['cashier-shift-payments', shiftId],
    queryFn: () => cashierApi.listShiftPayments(shiftId as string).then((r) => r.data.data),
    enabled: !!slug && !!shiftId,
  });
}

export function useOpenShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OpenShiftData) => cashierApi.openShift(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-outside-shift-cash'] });
    },
  });
}

export function useCloseShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CloseShiftData }) => cashierApi.closeShift(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-outside-shift-cash'] });
    },
  });
}
