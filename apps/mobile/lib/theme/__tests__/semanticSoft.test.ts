import { describe, it, expect } from '@jest/globals';
import { SEMANTIC_SOFT } from '../colors';

describe('SEMANTIC_SOFT', () => {
  it('every semantic soft-pair has fg/fgDeep/bg hex values', () => {
    for (const key of ['success', 'warning', 'info', 'danger', 'neutral'] as const) {
      for (const slot of ['fg', 'fgDeep', 'bg'] as const) {
        expect(SEMANTIC_SOFT[key][slot]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});
