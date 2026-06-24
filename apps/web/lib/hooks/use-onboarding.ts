import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { onboardingApi } from '@/lib/api/onboarding.api';
import { useAuthStore } from '@/store/auth.store';

// Roles that go through guided setup. Other roles never fetch onboarding status.
const SETUP_ROLES = ['PLATFORM_ADMIN', 'SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR'];

export function useOnboardingStatus() {
  const { accessToken, user } = useAuthStore();
  const isSetupRole = !!user && SETUP_ROLES.includes(user.role);
  return useQuery({
    queryKey: ['onboarding', 'status'],
    queryFn: () => onboardingApi.getStatus().then((r) => r.data.data),
    enabled: !!accessToken && isSetupRole,
    staleTime: 30_000,
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => onboardingApi.complete().then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding', 'status'] }),
  });
}
