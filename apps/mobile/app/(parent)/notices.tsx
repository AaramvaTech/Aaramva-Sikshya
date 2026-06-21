import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotices } from '../../hooks/useStudentMe';
import { NoticeFeed } from '../../components/ui';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export default function ParentNotices() {
  const [refreshing, setRefreshing] = useState(false);
  const { data: notices, isLoading, isError, refetch } = useNotices();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

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
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
          ]}
        >
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Notices</Text>
          <Text style={[styles.headerSub, { color: c.mutedForeground }]}>Announcements from your school</Text>
        </View>

        <View style={styles.body}>
          <NoticeFeed notices={notices} isLoading={isLoading} isError={isError} onRetry={() => refetch()} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontFamily: FONT.extrabold, fontSize: 17 },
  headerSub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
});
