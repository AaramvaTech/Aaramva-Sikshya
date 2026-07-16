import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Mirror the Next.js `@/*` → project-root path alias (tsconfig `paths`) so tests
// can import app modules the same way the app does.
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
    },
  },
});
