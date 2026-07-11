import {
  buildSignedMessage,
  esewaSignature,
  formatEsewaAmount,
  parseEsewaAmount,
} from '../esewa/esewa-signature.util';

describe('esewa-signature.util', () => {
  it('produces the hand-computed HMAC-SHA256-base64 for the documented sandbox message', () => {
    // Message + key from developer.esewa.com.np (ePay v2). Expected value
    // computed BY HAND with node:crypto, independent of the implementation:
    //   crypto.createHmac('sha256', '8gBm/:&EnhH.1/q')
    //     .update('total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST')
    //     .digest('base64')
    // (The doc page's displayed example output does not match its own inputs —
    // stale docs; the live sandbox accepts signatures produced this way.)
    const message = 'total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST';
    expect(esewaSignature(message, '8gBm/:&EnhH.1/q')).toBe(
      '5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=',
    );
  });

  it('buildSignedMessage joins field=value pairs in signed_field_names order', () => {
    const msg = buildSignedMessage('total_amount,transaction_uuid,product_code', {
      product_code: 'EPAYTEST',
      transaction_uuid: 'abc-123',
      total_amount: '600',
      unrelated: 'ignored',
    });
    expect(msg).toBe('total_amount=600,transaction_uuid=abc-123,product_code=EPAYTEST');
  });

  it('formatEsewaAmount: whole rupees integral, paisa two decimals, no grouping', () => {
    expect(formatEsewaAmount(1500)).toBe('1500');
    expect(formatEsewaAmount(1500.5)).toBe('1500.50');
    expect(formatEsewaAmount(100000)).toBe('100000');
  });

  it('parseEsewaAmount handles numbers and comma-grouped strings', () => {
    expect(parseEsewaAmount(1000)).toBe(1000);
    expect(parseEsewaAmount('1,000.0')).toBe(1000);
    expect(parseEsewaAmount('600')).toBe(600);
  });
});
