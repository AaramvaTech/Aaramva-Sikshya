import { View, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useNotices } from '../../hooks/useStudentMe';
import { NoticeFeed, ScreenHeader } from '../../components/ui';
import { useThemeColors } from '../../lib/theme/colors';
import { useLocale, bsLang } from '../../hooks/useLocale';
import NpText from '../../components/NpText';

export default function ParentNotices() {
  const [refreshing, setRefreshing] = useState(false);
  const { data: notices, isLoading, isError, refetch } = useNotices();
  const c = useThemeColors();
  const { t } = useLocale('parent');

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
          title={t('notices.title')}
          subtitle={t('notices.subtitle')}
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
