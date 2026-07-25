import { validate } from 'class-validator';
import { IsMoneyString } from './is-money-string.validator';

class Fixture {
  @IsMoneyString()
  amount!: string;
}

async function errorsFor(value: unknown): Promise<string[]> {
  const f = new Fixture();
  (f as unknown as Record<string, unknown>).amount = value;
  const errors = await validate(f);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('@IsMoneyString()', () => {
  it('accepts a whole-rupee decimal string', async () => {
    expect(await errorsFor('1234')).toEqual([]);
  });

  it('accepts a 2dp decimal string', async () => {
    expect(await errorsFor('1234.56')).toEqual([]);
  });

  it('accepts a 1dp decimal string', async () => {
    expect(await errorsFor('1234.5')).toEqual([]);
  });

  it('accepts zero', async () => {
    expect(await errorsFor('0')).toEqual([]);
    expect(await errorsFor('0.00')).toEqual([]);
  });

  it('rejects a JS number (the exact hole this validator exists to close)', async () => {
    expect(await errorsFor(1234.56)).not.toEqual([]);
  });

  it('rejects more than 2 decimal places', async () => {
    expect(await errorsFor('1234.567')).not.toEqual([]);
  });

  it('rejects a negative value (fields using this validator are non-negative)', async () => {
    expect(await errorsFor('-100.00')).not.toEqual([]);
  });

  it('rejects comma grouping', async () => {
    expect(await errorsFor('1,234.56')).not.toEqual([]);
  });

  it('rejects empty string', async () => {
    expect(await errorsFor('')).not.toEqual([]);
  });

  it('rejects non-numeric garbage', async () => {
    expect(await errorsFor('abc')).not.toEqual([]);
  });

  it('rejects a leading-dot decimal', async () => {
    expect(await errorsFor('.56')).not.toEqual([]);
  });

  it('rejects null/undefined', async () => {
    expect(await errorsFor(null)).not.toEqual([]);
    expect(await errorsFor(undefined)).not.toEqual([]);
  });
});
