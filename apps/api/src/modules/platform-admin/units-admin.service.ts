// Admin birim kataloğu (F3.1, US-028). Platform bağlamı (`withPlatformTx`) yalnız bu modülde açılır
// (c4 §3.7); kurallar ve audit `catalog` UnitsService'te (aynı işlem).
import { Inject, Injectable } from '@nestjs/common';
import type { AuditRequestContext } from '../../core/audit';
import { withPlatformTx } from '../../core/db';
import {
  type NewUnit,
  type UnitCatalogView,
  type UnitConversionInput,
  type UnitConversionView,
  type UnitPatch,
  UnitsService,
  type UnitView,
} from '../catalog';
import type { PlatformActor } from './sellers.service';

@Injectable()
export class UnitsAdminService {
  constructor(@Inject(UnitsService) private readonly units: UnitsService) {}

  async list(actor: PlatformActor): Promise<UnitCatalogView> {
    return await withPlatformTx(actor, (tx) => this.units.catalogTx(tx, false));
  }

  async create(
    actor: PlatformActor,
    input: NewUnit,
    context: AuditRequestContext,
  ): Promise<UnitView> {
    return await withPlatformTx(actor, (tx) => this.units.createUnitTx(tx, actor, input, context));
  }

  async update(
    actor: PlatformActor,
    code: string,
    input: UnitPatch,
    context: AuditRequestContext,
  ): Promise<UnitView> {
    return await withPlatformTx(actor, (tx) =>
      this.units.updateUnitTx(tx, actor, code, input, context),
    );
  }

  async saveConversion(
    actor: PlatformActor,
    input: UnitConversionInput,
    context: AuditRequestContext,
  ): Promise<UnitConversionView> {
    return await withPlatformTx(actor, (tx) =>
      this.units.saveConversionTx(tx, actor, input, context),
    );
  }

  async deleteConversion(
    actor: PlatformActor,
    fromCode: string,
    toCode: string,
    context: AuditRequestContext,
  ): Promise<void> {
    await withPlatformTx(actor, (tx) =>
      this.units.deleteConversionTx(tx, actor, fromCode, toCode, context),
    );
  }
}
