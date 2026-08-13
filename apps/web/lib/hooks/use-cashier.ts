import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashierApi } from '@/lib/api/cashier.api';
import { useTenantStore } from '@/store/tenant.store';
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

export function useOpenShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OpenShiftData) => cashierApi.openShift(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cashier-shifts'] }),
  });
}

export function useCloseShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CloseShiftData }) => cashierApi.closeShift(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cashier-shifts'] }),
  });
}
