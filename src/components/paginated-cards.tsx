import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function PaginatedCards<T>({
  items,
  renderItem,
  keyExtractor,
  pageSize = 5,
  style,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T) => string;
  pageSize?: number;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(items.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount - 1, 0));
  const start = currentPage * pageSize;
  const currentItems = items.slice(start, start + pageSize);

  return (
    <View style={[styles.container, style]}>
      {currentItems.map((item, index) => (
        <View key={keyExtractor(item)}>
          {renderItem(item, start + index)}
        </View>
      ))}
      {pageCount > 1 ? (
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Halaman sebelumnya"
            accessibilityState={{ disabled: currentPage === 0 }}
            disabled={currentPage === 0}
            onPress={() => setPage((value) => Math.max(0, value - 1))}
            style={[styles.button, { borderColor: theme.glassBorder, opacity: currentPage === 0 ? 0.45 : 1 }]}>
            <ThemedText type="smallBold">Sebelumnya</ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            {currentPage + 1} / {pageCount}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Halaman berikutnya"
            accessibilityState={{ disabled: currentPage === pageCount - 1 }}
            disabled={currentPage === pageCount - 1}
            onPress={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
            style={[styles.button, { borderColor: theme.glassBorder, opacity: currentPage === pageCount - 1 ? 0.45 : 1 }]}>
            <ThemedText type="smallBold">Berikutnya</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  button: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
});
