import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// The upload helper touches three externals — mock all of them so the state
// machine itself is what's under test.
const mockPost = jest.fn<any>();
jest.mock('../api', () => ({ __esModule: true, default: { post: (...a: unknown[]) => mockPost(...a) } }));

const mockUploadAsync = jest.fn<any>();
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  uploadAsync: (...a: unknown[]) => mockUploadAsync(...a),
  FileSystemUploadType: { BINARY_CONTENT: 'binary' },
}));

const mockGetDocumentAsync = jest.fn<any>();
jest.mock('expo-document-picker', () => ({
  __esModule: true,
  getDocumentAsync: (...a: unknown[]) => mockGetDocumentAsync(...a),
}));

import {
  pickSubmissionFile,
  uploadSubmissionFile,
  validatePickedFile,
  SUBMISSION_MAX_BYTES,
} from '../submissionUpload';

const FILE = { uri: 'file:///cache/hw.pdf', name: 'hw.pdf', size: 5000, mimeType: 'application/pdf' };

describe('validatePickedFile (client-side pre-check of the kind policy)', () => {
  it('accepts an in-policy file', () => {
    expect(validatePickedFile(FILE)).toBeNull();
  });
  it('rejects a disallowed mime type', () => {
    expect(validatePickedFile({ size: 100, mimeType: 'application/zip' })).toMatch(/not accepted/);
  });
  it('rejects a missing/zero size', () => {
    expect(validatePickedFile({ size: 0, mimeType: 'application/pdf' })).toMatch(/file size/);
    expect(validatePickedFile({ size: null, mimeType: 'application/pdf' })).toMatch(/file size/);
  });
  it('rejects an oversize file (policy mirror: 10 MB)', () => {
    expect(
      validatePickedFile({ size: SUBMISSION_MAX_BYTES + 1, mimeType: 'application/pdf' }),
    ).toMatch(/10 MB/);
  });
});

describe('pickSubmissionFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when the user cancels (not an error)', async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    await expect(pickSubmissionFile()).resolves.toBeNull();
  });

  it('throws the friendly message for an out-of-policy pick', async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ ...FILE, mimeType: 'application/zip' }],
    });
    await expect(pickSubmissionFile()).rejects.toThrow(/not accepted/);
  });
});

describe('uploadSubmissionFile (presign → PUT state machine)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const PRESIGN = {
    data: {
      data: {
        key: 'tenant_demo/submission-file/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf',
        uploadUrl: 'http://storage/put-here',
        expiresIn: 600,
        headers: { 'Content-Type': 'application/pdf' },
      },
    },
  };

  it('presigns via the ASSIGNMENT-scoped endpoint, PUTs with the signed headers, returns the key', async () => {
    mockPost.mockResolvedValueOnce(PRESIGN);
    mockUploadAsync.mockResolvedValueOnce({ status: 200, body: '' });

    const key = await uploadSubmissionFile('asg-1', FILE);

    expect(mockPost).toHaveBeenCalledWith(
      '/assignments/asg-1/submissions/presign-upload',
      { filename: 'hw.pdf', contentType: 'application/pdf', size: 5000 },
    );
    expect(mockUploadAsync).toHaveBeenCalledWith(
      'http://storage/put-here',
      'file:///cache/hw.pdf',
      { httpMethod: 'PUT', headers: { 'Content-Type': 'application/pdf' }, uploadType: 'binary' },
    );
    expect(key).toBe(PRESIGN.data.data.key);
  });

  it('surfaces a storage rejection (non-200 PUT) as a friendly error', async () => {
    mockPost.mockResolvedValueOnce(PRESIGN);
    mockUploadAsync.mockResolvedValueOnce({ status: 403, body: 'denied' });
    await expect(uploadSubmissionFile('asg-1', FILE)).rejects.toThrow(/HTTP 403/);
  });

  it('propagates a presign failure (e.g. the 403 for an untargeted student) without PUTting', async () => {
    mockPost.mockRejectedValueOnce(new Error('Request failed with status code 403'));
    await expect(uploadSubmissionFile('asg-1', FILE)).rejects.toThrow(/403/);
    expect(mockUploadAsync).not.toHaveBeenCalled();
  });
});
