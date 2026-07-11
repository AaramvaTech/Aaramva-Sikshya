import { View, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useNotices } from '../../hooks/useStudentMe';
import { NoticeFeed, ScreenHeader } from '../../components/ui';
import { useThemeColors } from '../../lib/theme/colors';

/**
 * Teacher notices screen (PUSH-1 / audit gap): same audience-filtered
 * GET /communication/notices the student/parent screens use — the API scopes
 * by role, so a TEACHER token sees ALL + TEACHERS notices.
 */
export default function TeacherNotices() {
  const [refreshing, setRefreshing] = useState(false);
  const { data: notices, isLoading, isError, refetch } = useNotices();
  const c = useThemeColors();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <ScreenHeader
          variant="plain"
          compact
          padTop={12}
          padBottom={16}
          title="Notices"
          subtitle="Announcements from your school"
        />

        <View style={styles.body}>
          <NoticeFeed notices={notices} isLoading={isLoading} isError={isError} onRetry={() => refetch()} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
});
