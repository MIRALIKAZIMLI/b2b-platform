/** Kimlik modülü yapılandırması (IdentityModule.forRoot). Değerler loglanmaz. */
export interface IdentityConfig {
  /** OTP_HASH_KEY (env şeması en az 32 karakter ister). */
  readonly otpHashKey: string;
}

export const IDENTITY_CONFIG = Symbol('IDENTITY_CONFIG');
