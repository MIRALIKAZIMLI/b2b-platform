// `businesses` logo portunun uygulaması (F2.10b, ADR-0024). Bağımlılık yönü files → businesses.
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { TenantTxContext } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { BUSINESS_LOGO_PORT, type BusinessLogoPort } from '../businesses';
import { FilesModule } from './files.module';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';

@Injectable()
export class FilesBusinessLogoAdapter implements BusinessLogoPort {
  constructor(
    @Inject(FilesRepository) private readonly repository: FilesRepository,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  async isUsableLogo(ctx: TenantTxContext, fileId: string): Promise<boolean> {
    const file = await this.repository.findById(ctx, fileId);
    return (
      file?.ownerBusinessId === ctx.businessId && file.purpose === 'logo' && file.status === 'ready'
    );
  }

  async readUrl(ctx: TenantTxContext, fileId: string): Promise<string | null> {
    try {
      return await this.files.getReadUrl(ctx, fileId);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  }
}

/** Portu tüm uygulamaya sağlar; `BusinessesModule` FilesModule'ü içe aktarmaz (döngü yok). */
@Global()
@Module({
  imports: [FilesModule],
  providers: [
    FilesBusinessLogoAdapter,
    { provide: BUSINESS_LOGO_PORT, useExisting: FilesBusinessLogoAdapter },
  ],
  exports: [BUSINESS_LOGO_PORT],
})
export class BusinessLogoPortModule {}
