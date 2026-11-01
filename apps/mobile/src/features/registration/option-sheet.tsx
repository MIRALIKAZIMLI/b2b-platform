// Seçim alanı + alttan açılan liste (F2.3b). Yeni paket yok: `Modal` + arama + `FlatList`.
// UX: alan bir kart düğmesi gibi görünür (seçili değer veya "Seçin"); liste uzun olabileceği için
// (bölgeler) üstte arama vardır; satırlar 52 pt yüksekliğinde, seçili satır Indigo işaretli.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { filterOptions, type Option } from './options';

export function OptionField({
  label,
  value,
  options,
  error,
  onChange,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly Option[];
  readonly error?: string | undefined;
  readonly onChange: (id: string) => void;
  readonly testID: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.id === value);
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={selected?.label ?? t('register.choose')}
        testID={testID}
        onPress={() => {
          setOpen(true);
        }}
        style={({ pressed: isPressed }) => [
          styles.control,
          error !== undefined && styles.controlInvalid,
          isPressed && pressed,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.value, selected === undefined && styles.placeholder]}
        >
          {selected?.label ?? t('register.choose')}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>
      {error !== undefined && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <Pressable style={styles.backdrop} accessibilityRole="button" onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {label}
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('register.choose')}
            placeholderTextColor={colors.textSubtle}
            style={styles.search}
            accessibilityLabel={label}
            autoCorrect={false}
          />
          <FlatList
            data={filterOptions(options, query)}
            keyExtractor={(option) => option.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === value }}
                testID={`${testID}-option-${item.id}`}
                onPress={() => {
                  onChange(item.id);
                  close();
                }}
                style={({ pressed: isPressed }) => [
                  styles.row,
                  item.id === value && styles.rowSelected,
                  isPressed && styles.rowPressed,
                ]}
              >
                <Text numberOfLines={2} style={styles.rowText}>
                  {item.label}
                </Text>
                {item.id === value && <Text style={styles.check}>✓</Text>}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  control: {
    minHeight: touchTarget + 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    ...softShadow(1),
  },
  controlInvalid: { borderColor: colors.danger },
  value: { flex: 1, fontSize: 16, color: colors.text },
  placeholder: { color: colors.textSubtle },
  chevron: { fontSize: 18, color: colors.textMuted },
  error: { fontSize: 13, fontWeight: '500', color: colors.danger },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    gap: space.md,
    ...softShadow(3),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  search: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: space.lg,
    fontSize: 16,
    color: colors.text,
  },
  row: {
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  rowSelected: { backgroundColor: colors.accentSoft },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowText: { flex: 1, fontSize: 16, color: colors.text },
  check: { fontSize: 16, fontWeight: '700', color: colors.accent },
});
