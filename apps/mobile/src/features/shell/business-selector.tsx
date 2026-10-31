// İşletme seçici (US-003 AC1–AC2). Yalnızca kullanıcının üyelikleri (`/me`).
import type { components } from '@b2b/api-client';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { shellStyles } from './shell-styles';
import { useSelectBusiness } from './use-shell';

type Membership = components['schemas']['MembershipSummary'];

function label(item: Membership): string {
  const name = item.businessName ?? '';
  const role = item.roleName ?? '';
  return role === '' ? name : `${name} · ${role}`;
}

export function BusinessSelector({
  memberships,
  activeBusinessId,
}: {
  readonly memberships: readonly Membership[];
  readonly activeBusinessId: string | undefined;
}) {
  const { t } = useTranslation();
  const select = useSelectBusiness();
  if (memberships.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text>{t('shell.business_label')}</Text>
      <View style={shellStyles.row}>
        {memberships.map((item) => {
          const selected = item.businessId === activeBusinessId;
          return (
            <Pressable
              key={item.businessId}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[shellStyles.option, selected && shellStyles.selected]}
              onPress={() => {
                if (!selected && item.businessId !== undefined) select(item.businessId);
              }}
            >
              <Text>{label(item)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
