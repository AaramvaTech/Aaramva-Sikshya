import { describe, it, expect, vi } from 'vitest';
import {
  defaultPrintLanguage, isStorageUnavailable, printErrorMessage, openPresignedUrl,
  PRINT_LANGUAGES, PRINT_LANGUAGE_LABELS, STORAGE_UNAVAILABLE_MESSAGE, THERMAL_SCALE_WARNING,
} from '@/lib/print-document';

// Spec §Language — the print-time choice defaults to the tenant's own
// setting, and mirrors the server's `resolvePrintLanguage` fallback so the UI
// never claims a default the API would not honour.
describe('defaultPrintLanguage', () => {
  it('accepts each of the three real values', () => {
    expect(defaultPrintLanguage('EN')).toBe('EN');
    expect(defaultPrintLanguage('NE')).toBe('NE');
    expect(defaultPrintLanguage('BOTH')).toBe('BOTH');
  });

  it('falls back to EN for null, undefined, or anything unrecognised', () => {
    expect(defaultPrintLanguage(null)).toBe('EN');
    expect(defaultPrintLanguage(undefined)).toBe('EN');
    expect(defaultPrintLanguage('')).toBe('EN');
    expect(defaultPrintLanguage('np')).toBe('EN');      // mobile's locale code, not a print language
    expect(defaultPrintLanguage('ENGLISH')).toBe('EN');
  });

  it('offers exactly the three languages the API accepts, each with a label', () => {
    expect([...PRINT_LANGUAGES]).toEqual(['EN', 'NE', 'BOTH']);
    for (const l of PRINT_LANGUAGES) expect(PRINT_LANGUAGE_LABELS[l]).toBeTruthy();
    // The Nepali option is labelled in Nepali — a parent asking for it should
    // recognise it without reading English.
    expect(PRINT_LANGUAGE_LABELS.NE).toBe('नेपाली');
  });
});

// Addendum A5 — storage is a hard dependency of the whole print surface, and
// a 503 there is a deployment problem, not a broken document. It must never
// be flattened into the generic failure toast.
describe('storage-unavailable error path', () => {
  const storage503 = { response: { status: 503, data: { error: { code: 'STORAGE_UNAVAILABLE' } } } };

  it('recognises STORAGE_UNAVAILABLE', () => {
    expect(isStorageUnavailable(storage503)).toBe(true);
  });

  it('does not claim storage for any other failure', () => {
    expect(isStorageUnavailable({ response: { data: { error: { code: 'RESOURCE_NOT_FOUND' } } } })).toBe(false);
    expect(isStorageUnavailable({ response: { data: { error: { code: 'FORBIDDEN_SCOPE' } } } })).toBe(false);
    expect(isStorageUnavailable(new Error('network down'))).toBe(false);
    expect(isStorageUnavailable(undefined)).toBe(false);
  });

  it('names storage as the cause, and says it is a server setup issue', () => {
    const msg = printErrorMessage(storage503, 'Failed to open the receipt');
    expect(msg).toBe(STORAGE_UNAVAILABLE_MESSAGE);
    expect(msg).toMatch(/storage/i);
    expect(msg).toMatch(/administrator/i);
    expect(msg).not.toBe('Failed to open the receipt');
  });

  it('uses the caller fallback for everything else', () => {
    expect(printErrorMessage(new Error('boom'), 'Failed to open the bill PDF'))
      .toBe('Failed to open the bill PDF');
  });
});

// Addendum A4 — the presigned URL is opened immediately and never persisted.
describe('openPresignedUrl', () => {
  it('opens in a new tab with noopener,noreferrer', () => {
    const open = vi.fn().mockReturnValue({} as Window);
    expect(openPresignedUrl('https://storage.example/x.pdf?sig=abc', open)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://storage.example/x.pdf?sig=abc', '_blank', 'noopener,noreferrer');
  });

  // A blocked popup must be reported, not silently swallowed — otherwise the
  // clerk clicks Print and nothing whatsoever happens.
  it('reports a blocked popup instead of failing silently', () => {
    expect(openPresignedUrl('https://storage.example/x.pdf', vi.fn().mockReturnValue(null))).toBe(false);
  });
});

// Spec §Thermal — the receipt page really is 80mm (226.77pt), so the only
// thing between the user and a correct print is the browser's scale-to-fit
// default. The warning has to name the actual setting.
describe('thermal scale warning', () => {
  it('tells the user the exact dialog setting and the true width', () => {
    expect(THERMAL_SCALE_WARNING).toMatch(/100%/);
    expect(THERMAL_SCALE_WARNING).toMatch(/80mm/);
    expect(THERMAL_SCALE_WARNING).toMatch(/fit to page/i);
  });
});
