// Telefonla kullanıcı bulma / oluşturma, çağıranın işlemi içinde (F2.1a, S3 = A). Toptancı
// açılışında yetkilinin kullanıcı satırı admin açarken oluşur; yetkili sonra normal OTP girişiyle
// girer. `users` U tablosu: yazma yalnızca platform bağlamında (users_platform politikası), bu
// yüzden çağıran `withPlatformTx` işlemini verir. Var olan kullanıcının adı değiştirilmez
// (kullanıcının kendi verisi; kart, emin olunmayan nokta 5).
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { IdGenerator } from '../../core/id-generator';
import { users } from './identity.schema';

export interface DirectoryUser {
  readonly id: string;
  /** Bu çağrıda yeni oluşturuldu mu. */
  readonly created: boolean;
}

@Injectable()
export class UserDirectory {
  constructor(@Inject(IdGenerator) private readonly ids: IdGenerator) {}

  /** `phoneE164` doğrulanmış E.164 olmalı (çağıran `parsePhoneE164` ile denetler). */
  async findOrCreateByPhoneTx(tx: Tx, phoneE164: string, fullName: string): Promise<DirectoryUser> {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneE164, phoneE164));
    if (existing[0] !== undefined) return { id: existing[0].id, created: false };
    const id = this.ids.next();
    await tx.insert(users).values({ id, phoneE164, fullName });
    return { id, created: true };
  }

  /**
   * Kendi kaydolan kullanıcı (F2.3a). Kimlik işlem bağlamından (app.user_id) alınır; çağıran
   * `withTenantTx({ businessId, userId })` verir. Telefon kayıtlıysa `isPhoneTakenError` hatası.
   */
  async createSelfSignupTx(
    tx: Tx,
    input: { phoneE164: string; fullName: string; preferredLanguage: string | null; now: Date },
  ): Promise<void> {
    await tx.execute(sql`
      select user_create_self_signup(
        ${input.phoneE164}, ${input.fullName}, ${input.preferredLanguage},
        ${input.now.toISOString()}::timestamptz
      )
    `);
  }
}

/** Telefon başka bir kullanıcıda (users_phone_e164_uq, 23505; Drizzle hatası `cause` taşır). */
export function isPhoneTakenError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === 'users_phone_e164_uq'
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}
