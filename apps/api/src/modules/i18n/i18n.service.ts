import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ErrorCode } from '@b2b/shared';
import { Clock } from '../../core/clock';
import { DomainError } from '../../core/errors/domain-error';
import type { ErrorMessageResolver } from '../../core/errors/error-message.port';
import { SettingsService } from '../settings';
import { parseAcceptLanguage } from './accept-language';
import { type Dictionary, I18nSnapshot } from './i18n-snapshot';
import type { I18nRepositoryPort, I18nSettingsPort, Region } from './i18n.ports';
import { I18nRepository } from './i18n.repository';

interface CachedSnapshot {
  readonly snapshot: I18nSnapshot;
  readonly expiresAt: number;
}

/** Hata kodu veya adı; mesaj yazılmaz (adres içerebilir). */
function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : 'unknown';
  }
  return error instanceof Error ? error.name : 'unknown';
}

/**
 * Diller, arayüz çevirileri ve bölgeler (US-058, US-059, F1.3).
 * Diller ve çeviriler süreç içinde önbelleklenir; ömür `i18n.cache_ttl_seconds` (US-017).
 * Önbellek boşsa veya süresi dolmuşsa tek sorguyla yeniden yüklenir; aynı anda gelen
 * istekler aynı yüklemeyi bekler. Hatalı yükleme önbelleğe alınmaz.
 */
@Injectable()
export class I18nService implements ErrorMessageResolver {
  private readonly logger = new Logger(I18nService.name);
  private cached: CachedSnapshot | undefined;
  private loading: Promise<I18nSnapshot> | undefined;

  constructor(
    @Inject(I18nRepository) private readonly repository: I18nRepositoryPort,
    @Inject(SettingsService) private readonly settings: I18nSettingsPort,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** Aktif dilin sözlüğü; pasif veya bilinmeyen dil → NOT_FOUND (US-058 AC4). */
  async getDictionary(lang: string): Promise<Dictionary> {
    const dictionary = (await this.snapshot()).dictionary(lang);
    if (dictionary === undefined) {
      throw new DomainError('NOT_FOUND');
    }
    return dictionary;
  }

  /**
   * `errors.<code>` çevirisi: Accept-Language'deki ilk aktif dil → varsayılan dil → kod.
   * Hata atmaz: yükleme başarısızsa uyarı loglanır ve kod döner (Mimar düzeltmesi D3).
   */
  async errorMessage(code: ErrorCode, acceptLanguage: string | undefined): Promise<string> {
    let snapshot: I18nSnapshot;
    try {
      snapshot = await this.snapshot();
    } catch (error: unknown) {
      this.logger.warn(
        `i18n.load_failed: çeviriler yüklenemedi, hata mesajı kod olarak dönüyor (kod: ${errorCode(error)})`,
      );
      return code;
    }
    const lang = snapshot.pickLanguage(parseAcceptLanguage(acceptLanguage));
    return snapshot.translate(`errors.${code}`, lang) ?? code;
  }

  /**
   * Bir çeviri anahtarının Accept-Language dilindeki değeri (ör. SMS şablonu, F1.5a):
   * ilk aktif dil → varsayılan dil. Anahtar yoksa veya çeviriler yüklenemezse undefined;
   * hata atmaz (çağıran kendi yedeğini kullanır).
   */
  async text(key: string, acceptLanguage: string | undefined): Promise<string | undefined> {
    try {
      const snapshot = await this.snapshot();
      const lang = snapshot.pickLanguage(parseAcceptLanguage(acceptLanguage));
      return snapshot.translate(key, lang);
    } catch (error: unknown) {
      this.logger.warn(`i18n.load_failed: çeviriler yüklenemedi (kod: ${errorCode(error)})`);
      return undefined;
    }
  }

  /**
   * Accept-Language'deki ilk aktif dil, yoksa varsayılan dil (F3.5a: şablondaki kategori ve birim
   * adlarının dili). Çeviriler yüklenemezse `az` (platformun varsayılan dili).
   */
  async language(acceptLanguage: string | undefined): Promise<string> {
    try {
      return (await this.snapshot()).pickLanguage(parseAcceptLanguage(acceptLanguage));
    } catch (error: unknown) {
      this.logger.warn(`i18n.load_failed: çeviriler yüklenemedi (kod: ${errorCode(error)})`);
      return 'az';
    }
  }

  /** ErrorMessageResolver (core/errors) uygulaması. */
  resolve(code: ErrorCode, acceptLanguage: string | undefined): Promise<string> {
    return this.errorMessage(code, acceptLanguage);
  }

  async listRegions(countryCode: string): Promise<Region[]> {
    return await this.repository.listRegions(countryCode);
  }

  private async snapshot(): Promise<I18nSnapshot> {
    const now = this.clock.now().getTime();
    if (this.cached !== undefined && now < this.cached.expiresAt) {
      return this.cached.snapshot;
    }
    this.loading ??= this.load().finally(() => {
      this.loading = undefined;
    });
    return await this.loading;
  }

  private async load(): Promise<I18nSnapshot> {
    const snapshot = I18nSnapshot.build(await this.repository.loadLanguages());
    const ttlSeconds = await this.settings.get('i18n.cache_ttl_seconds');
    this.cached = { snapshot, expiresAt: this.clock.now().getTime() + ttlSeconds * 1000 };
    return snapshot;
  }
}
