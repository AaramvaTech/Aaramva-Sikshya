module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Jest's default moduleFileExtensions resolves .js before .ts, so the
  // stale, already-committed src/data.js and src/index.js (pre-existing
  // clutter, not this package's real build output — that's dist/) were
  // silently shadowing the real .ts source whenever anything under src/
  // did an extensionless `require`/`import`. Preferring .ts here does NOT
  // touch or delete those stale files — it just stops them from being
  // picked ahead of the real source during test resolution.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
