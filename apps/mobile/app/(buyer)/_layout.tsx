import { Stack } from 'expo-router';

// Perakendeci (`buyer`) ekranları; iş ekranları F2+ adımlarında bu gruba eklenir.
export default function BuyerLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
