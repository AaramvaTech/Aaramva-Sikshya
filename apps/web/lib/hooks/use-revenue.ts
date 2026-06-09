import { useQuery } from '@tanstack/react-query';
import { superAdminApi } from '@/lib/api/super-admin.api';

export function useRevenue() {
  return useQuery({
    queryKey: ['platform', 'revenue'],
    queryFn: () => superAdminApi.getRevenue().then((r) => r.data.data),
  });
}
