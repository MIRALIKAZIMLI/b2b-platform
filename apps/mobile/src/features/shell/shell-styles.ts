import { StyleSheet } from 'react-native';

export const shellStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  screen: { flex: 1, padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  button: { borderWidth: 1, borderRadius: 6, padding: 12, alignItems: 'center' },
  banner: { borderWidth: 1, borderRadius: 6, padding: 12, gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  option: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 6 },
  selected: { borderWidth: 2 },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  disabled: { opacity: 0.5 },
});
