import { useEffect } from 'react';
import { router } from 'expo-router';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/auth';
import { routeForPush, setupPushHandlers } from '../lib/notifications';
import api from '../lib/api';

/**
 * Wires push receive/tap handling once the user is authed (PUSH-1). Renders
 * nothing. In Expo Go / simulator setupPushHandlers resolves to null and this
 * is inert — the wiring lights up in a development build (EAS session).
 *
 * Navigation on tap goes through router.push (never replace) so the root
 * layout's auth routing in app/_layout.tsx stays the single owner of replaces.
 */
export default function PushBootstrap() {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== 'authed') return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;

    void setupPushHandlers({
      onReceived: () => {
        // Badge + inbox refresh while the app is foregrounded.
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      },
      onTap: (data) => {
        // Role is read at tap time — session may have switched since setup.
        const role = useAuthStore.getState().user?.role;
        if (!role) return;
        if (data.notificationId) {
          api
            .patch(`/communication/notifications/${data.notificationId}/read`)
            .catch(() => {})
            .finally(() => void queryClient.invalidateQueries({ queryKey: ['notifications'] }));
        }
        router.push(routeForPush(role, data.route));
      },
    }).then((c) => {
      if (cancelled) c?.();
      else cleanup = c;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [status]);

  return null;
}
