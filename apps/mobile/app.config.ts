import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config layered on top of the static app.json.
 *
 * Sole purpose: enable Android cleartext (plain http://) traffic for
 * NON-production builds only.
 *
 * Dev and the `preview` APK talk to the dev API over the LAN by IP
 * (http://<lan-ip>:3001) — and Android 9+ blocks cleartext HTTP by default
 * (expo-build-properties `usesCleartextTraffic` defaults to false), so the app
 * silently cannot reach the dev API without this. Production talks to the API
 * over HTTPS, so cleartext stays OFF there and the Play Store data-safety
 * posture stays clean.
 *
 * Gated on EAS_BUILD_PROFILE, which EAS sets during a build (`preview` /
 * `production`). Local `expo start` leaves it undefined → treated as non-prod
 * → cleartext ON, which is what dev wants.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const isProduction = process.env.EAS_BUILD_PROFILE === 'production';
  const plugins = [...(config.plugins ?? [])];

  if (!isProduction) {
    plugins.push([
      'expo-build-properties',
      { android: { usesCleartextTraffic: true } },
    ] as [string, Record<string, unknown>]);
  }

  return {
    ...config,
    name: config.name ?? 'Aaramva Shikshya',
    slug: config.slug ?? 'aaramva-shikshya',
    plugins,
  };
};
