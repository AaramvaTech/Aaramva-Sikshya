import { buildCorrectionSequenceKey, buildCorrectionNumber } from '../bill-correction.util';

describe('buildCorrectionSequenceKey', () => {
  it('is namespaced by doctype and tenant, CONTINUOUS only (no reset variant this checkpoint)', () => {
    expect(buildCorrectionSequenceKey('demo')).toBe('correction:demo:CONTINUOUS');
  });

  it('never shares a namespace with invoice/receipt sequences', () => {
    expect(buildCorrectionSequenceKey('demo')).not.toContain('bill_invoice');
    expect(buildCorrectionSequenceKey('demo')).not.toContain('receipt');
  });
});

describe('buildCorrectionNumber', () => {
  it('COR-<bsYear>-NNNNNN, 6-digit zero-padded', () => {
    expect(buildCorrectionNumber(2083, 1)).toBe('COR-2083-000001');
    expect(buildCorrectionNumber(2083, 42)).toBe('COR-2083-000042');
  });

  it('accepts bigint seq values from the sequences table', () => {
    expect(buildCorrectionNumber(2083, BigInt(7))).toBe('COR-2083-000007');
  });
});
