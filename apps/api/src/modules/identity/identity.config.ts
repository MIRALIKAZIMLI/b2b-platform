/** Kimlik modülü yapılandırması (IdentityModule.forRoot). Değerler loglanmaz. */
export interface IdentityConfig {
  /** OTP_HASH_KEY (env şeması en az 32 karakter ister). */
  readonly otpHashKey: string;
  /** Erişim anahtarı imzası (F1.5b): güncel anahtar imzalar, öncekisi yalnızca doğrular. */
  readonly jwt: {
    readonly current: JwtKey;
    readonly previous?: JwtKey;
  };
}

export interface JwtKey {
  /** JWT başlığındaki `kid`. */
  readonly id: string;
  /** HS256 gizli anahtarı (en az 32 karakter). */
  readonly secret: string;
}

export const IDENTITY_CONFIG = Symbol('IDENTITY_CONFIG');
