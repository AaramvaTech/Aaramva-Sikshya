import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
// SDK 56's default expo-file-system is the new File/Paths API (no status code on
// download). The legacy API returns { status, uri }, which we need to branch on
// 409 (not published) / 403 (not allowed). It ships in SDK 56 at this subpath.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from '../lib/api';
import { useAuthStore } from '../store/auth';

type DownloadState = 'idle' | 'downloading' | 'error';

/**
 * Downloads the report-card PDF from the authed endpoint and opens the system
 * share/open sheet. Self for students (no childId); own-child for parents
 * (pass childId → the parent report-card path). The server enforces the
 * publish gate + hard-scope; this surfaces the "not published yet" (409) and
 * permission (403) cases cleanly instead of saving a broken file.
 */
export function useReportCardDownload(childId?: string) {
  const [state, setState] = useState<DownloadState>('idle');

  const download = useCallback(async () => {
    const { accessToken, slug } = useAuthStore.getState();
    if (!accessToken || !slug) {
      Alert.alert('Not signed in', 'Please sign in again to download your report card.');
      return;
    }

    const url = childId
      ? `${API_BASE_URL}/exams/results/report-card/${childId}/pdf`
      : `${API_BASE_URL}/students/me/report-card/pdf`;
    const target = `${FileSystem.cacheDirectory}report-card-${childId ?? 'me'}.pdf`;

    setState('downloading');
    try {
      const res = await FileSystem.downloadAsync(url, target, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Tenant-Slug': slug,
          'X-Client-Type': 'mobile',
        },
      });

      if (res.status === 409) {
        setState('idle');
        Alert.alert('Not available yet', 'Your results have not been published yet. Please check back later.');
        await FileSystem.deleteAsync(res.uri, { idempotent: true });
        return;
      }
      if (res.status === 403) {
        setState('idle');
        Alert.alert('Not allowed', 'You can only download your own report card.');
        await FileSystem.deleteAsync(res.uri, { idempotent: true });
        return;
      }
      if (res.status !== 200) {
        throw new Error(`Download failed (${res.status})`);
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Report card',
        });
      } else {
        Alert.alert('Downloaded', 'Report card saved.');
      }
      setState('idle');
    } catch (err) {
      setState('error');
      Alert.alert('Download failed', 'Could not download the report card. Please try again.');
    }
  }, [childId]);

  return { download, downloading: state === 'downloading', isError: state === 'error' };
}
