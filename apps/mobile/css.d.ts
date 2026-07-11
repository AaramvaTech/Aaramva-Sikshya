// Tracked CSS-module declaration for CI typechecks.
//
// Locally, the side-effect import of global.css is declared by the generated
// (and Expo-template-gitignored) expo-env.d.ts. A fresh CI checkout has
// neither expo-env.d.ts nor .expo/types, so `npx tsc --noEmit` fails with
// TS2882 without this file. Kept separate rather than un-ignoring
// expo-env.d.ts to avoid fighting Expo's gitignore conventions.
declare module '*.css';
