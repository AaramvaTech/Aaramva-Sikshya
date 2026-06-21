import { ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { useThemeColors, deriveOnPrimary } from '../../lib/theme/colors';
import type { MyChild } from '../../types';

interface ChildPickerProps {
  children: MyChild[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Horizontal selectable chips for multi-child parents. Lives on the gradient
 * header, so the active chip uses a light surface backing and the selected
 * label uses the brand colour. Hidden when there's only one child.
 */
export function ChildPicker({ children, selectedId, onSelect }: ChildPickerProps) {
  const c = useThemeColors();
  const onPrimary = deriveOnPrimary(c.primary);
  if (children.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.content}
    >
      {children.map((child) => {
        const selected = child.id === selectedId;
        return (
          <TouchableOpacity
            key={child.id}
            onPress={() => onSelect(child.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              { backgroundColor: selected ? '#ffffff' : 'rgba(255,255,255,0.14)' },
            ]}
          >
            <NpText
              style={[styles.label, { color: selected ? c.primary : onPrimary.pale }]}
            >
              {child.firstName}
            </NpText>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 14 },
  content: { gap: 8, paddingRight: 8 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '700' },
});
