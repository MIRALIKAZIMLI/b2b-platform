// Platform ekibi rolleri (productreport "Platform rolleri", data-model `platform_staff.role`, F1.6).
// Platform uç noktaları bu rollerle korunur (`@RequirePlatformRole`), izin kodlarıyla değil (c4 §5).
export const PLATFORM_ROLES = ['super_admin', 'operations', 'support', 'content'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value);
}
