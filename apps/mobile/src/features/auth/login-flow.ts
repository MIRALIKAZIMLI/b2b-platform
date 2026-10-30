// Mobil giriş akışı (F1.14a, US-001): telefon → SMS kodu → (gerekirse) TOTP. Ekranlardan bağımsız,
// birim testli. Ekranlar yalnızca sonucu (`LoginOutcome`) gösterir. Kod ve anahtarlar loglanmaz.
import type { ApiClient, components } from '@b2b/api-client';
import type { TokenPair } from '../../lib/api';

type AuthResult = components['schemas']['AuthResult'];
export type DeviceType = 'ios' | 'android';

export type LoginStep =
  | { readonly kind: 'code'; readonly challengeId: string }
  | { readonly kind: 'totp'; readonly pendingToken: string }
  | { readonly kind: 'totp_setup'; readonly pendingToken: string; readonly otpauthUri: string }
  | { readonly kind: 'recovery'; readonly pendingToken: string; readonly codes: readonly string[] }
  | { readonly kind: 'register' };

export type LoginOutcome =
  | { readonly kind: 'step'; readonly step: LoginStep }
  | { readonly kind: 'signed_in'; readonly tokens: TokenPair }
  /** `errors.<code>` çeviri anahtarının kodu. */
  | { readonly kind: 'error'; readonly code: string };

/** API hata gövdesi → hata kodu; kod yoksa genel hata. */
export function errorCodeOf(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'INTERNAL_ERROR';
}

function fail(error: unknown): LoginOutcome {
  return { kind: 'error', code: errorCodeOf(error) };
}

export interface LoginFlowOptions {
  readonly client: ApiClient;
  readonly device: { readonly type: DeviceType; readonly appVersion?: string };
}

export function createLoginFlow({ client, device }: LoginFlowOptions) {
  async function setupTotp(pendingToken: string): Promise<LoginOutcome> {
    const { data, error } = await client.POST('/api/v1/auth/totp/setup', {
      headers: { Authorization: `Bearer ${pendingToken}` },
      body: {},
    });
    if (data?.otpauthUri === undefined) return fail(error);
    return {
      kind: 'step',
      step: { kind: 'totp_setup', pendingToken, otpauthUri: data.otpauthUri },
    };
  }

  async function next(result: AuthResult): Promise<LoginOutcome> {
    if (result.nextStep === 'none' && result.accessToken !== undefined) {
      return {
        kind: 'signed_in',
        tokens: {
          accessToken: result.accessToken,
          ...(result.refreshToken === undefined ? {} : { refreshToken: result.refreshToken }),
        },
      };
    }
    if (result.nextStep === 'totp' && result.pendingToken !== undefined) {
      return { kind: 'step', step: { kind: 'totp', pendingToken: result.pendingToken } };
    }
    if (result.nextStep === 'totp_setup' && result.pendingToken !== undefined) {
      return setupTotp(result.pendingToken);
    }
    // Kayıt F2.3'te; burada yalnızca bilgi gösterilir.
    return { kind: 'step', step: { kind: 'register' } };
  }

  return {
    async requestCode(phone: string): Promise<LoginOutcome> {
      const { data, error } = await client.POST('/api/v1/auth/otp/request', {
        body: { phone: phone.trim(), purpose: 'login' },
      });
      if (data === undefined) return fail(error);
      return { kind: 'step', step: { kind: 'code', challengeId: data.challengeId } };
    },

    async verifyCode(challengeId: string, code: string): Promise<LoginOutcome> {
      const { data, error } = await client.POST('/api/v1/auth/otp/verify', {
        body: { challengeId, code: code.trim(), device },
      });
      if (data === undefined) return fail(error);
      return next(data);
    },

    async verifyTotp(pendingToken: string, code: string): Promise<LoginOutcome> {
      const { data, error } = await client.POST('/api/v1/auth/totp/verify', {
        body: { pendingToken, code: code.trim(), device },
      });
      if (data === undefined) return fail(error);
      return next(data);
    },

    /** TOTP kurulumu onayı: kurtarma kodları bir kez gösterilir, sonra TOTP ile giriş. */
    async confirmTotpSetup(pendingToken: string, code: string): Promise<LoginOutcome> {
      const { data, error } = await client.POST('/api/v1/auth/totp/setup', {
        headers: { Authorization: `Bearer ${pendingToken}` },
        body: { confirmCode: code.trim() },
      });
      if (data?.recoveryCodes === undefined) return fail(error);
      return {
        kind: 'step',
        step: { kind: 'recovery', pendingToken, codes: data.recoveryCodes },
      };
    },
  };
}

export type LoginFlow = ReturnType<typeof createLoginFlow>;
