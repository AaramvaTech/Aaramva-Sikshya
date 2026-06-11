import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api/settings.api';
import { useTenantStore } from '@/store/tenant.store';
import type { UpdateProfileData } from '@/types/api.types';

export function useSchoolProfile() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: () => settingsApi.getProfile().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useUpdateSchoolProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProfileData) => settingsApi.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] });
    },
  });
}
