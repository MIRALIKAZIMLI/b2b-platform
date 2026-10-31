import { StyleSheet } from 'react-native';

export const authStyles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10 },
  button: { borderWidth: 1, borderRadius: 6, padding: 12, alignItems: 'center' },
  link: { padding: 8, alignItems: 'center' },
  mono: { fontFamily: 'monospace' },
});
