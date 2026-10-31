import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { IDENTITY_CONFIG, type IdentityConfig } from './identity.config';
import { ipKey } from './otp-code';

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

/**
 * İstek IP'sinin Redis anahtarlarında kullanılan HMAC özeti (OTP ile aynı anahtar; IP düz
 * yazılmaz). Kimliksiz uçların IP hız sınırı için (F2.2 toptancı başvurusu).
 */
@Injectable()
export class IpKeyService {
  constructor(@Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig) {}

  /** Geçerli IPv4/IPv6 ise özet; IP bilinmiyor veya geçersizse undefined. */
  keyOf(ip: string | undefined): string | undefined {
    const parsed = ipSchema.safeParse(ip);
    return parsed.success ? ipKey(this.config.otpHashKey, parsed.data) : undefined;
  }
}
