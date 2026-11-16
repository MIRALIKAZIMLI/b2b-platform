// Birim kataloğu kuralları (F3.1, US-028). Yazma metotları çağıranın platform işleminde (`*Tx`;
// platform-admin `withPlatformTx` açar, c4 §3.7); audit aynı işlemde. Okuma her bağlamda (G).
import { Inject, Injectable } from '@nestjs/common';
import type { CatalogName, UnitAbbreviation, UnitKind } from '@b2b/shared';
import Decimal from 'decimal.js';
import { type AuditRequestContext, AuditService } from '../../core/audit';
import { Clock } from '../../core/clock';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { type UnitConversionRow, type UnitRow, UnitsRepository } from './units.repository';

export interface UnitView {
  readonly code: string;
  readonly kind: UnitKind;
  readonly name: unknown;
  readonly abbreviation: unknown;
  readonly allowsDecimal: boolean;
  readonly isActive: boolean;
}

export interface UnitConversionView {
  readonly fromCode: string;
  readonly toCode: string;
  /** openapi `UnitFactor`; sondaki sıfırlar atılır (`1000`, `0.5`). */
  readonly factor: string;
}

export interface UnitCatalogView {
  readonly items: UnitView[];
  readonly conversions: UnitConversionView[];
}

export interface NewUnit {
  readonly code: string;
  readonly kind: UnitKind;
  readonly name: CatalogName;
  readonly abbreviation: UnitAbbreviation;
  readonly allowsDecimal: boolean;
}

export interface UnitPatch {
  readonly name?: CatalogName | undefined;
  readonly abbreviation?: UnitAbbreviation | undefined;
  readonly allowsDecimal?: boolean | undefined;
  readonly isActive?: boolean | undefined;
}

export interface UnitConversionInput {
  readonly fromCode: string;
  readonly toCode: string;
  readonly factor: string;
}

export interface UnitsActor {
  readonly userId: string;
}

function invalid(field: string, reason: string): DomainError {
  return new DomainError('VALIDATION_FAILED', { [field]: [reason] });
}

function sameText(a: unknown, b: Readonly<Record<string, string | undefined>>): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const sorted = (value: object) =>
    JSON.stringify(
      Object.entries(value)
        .filter(([, text]) => text !== undefined)
        .sort(([x], [y]) => x.localeCompare(y)),
    );
  return sorted(a) === sorted(b);
}

function factorText(value: string): string {
  return new Decimal(value).toFixed();
}

function unitView(row: UnitRow): UnitView {
  return { ...row, kind: row.kind as UnitKind };
}

function conversionView(row: UnitConversionRow): UnitConversionView {
  return { fromCode: row.fromCode, toCode: row.toCode, factor: factorText(row.factor) };
}

@Injectable()
export class UnitsService {
  constructor(
    @Inject(UnitsRepository) private readonly repository: UnitsRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** `activeOnly`: ürün formu listesi (`GET /catalog/units`, K4); admin tümünü görür. */
  async catalogTx(tx: Tx, activeOnly: boolean): Promise<UnitCatalogView> {
    const items = await this.repository.listUnits(tx, activeOnly);
    const conversions = await this.repository.listConversions(tx, activeOnly);
    return { items: items.map(unitView), conversions: conversions.map(conversionView) };
  }

  /** US-028 AC1: birim aktif açılır; kod benzersiz. */
  async createUnitTx(
    tx: Tx,
    actor: UnitsActor,
    input: NewUnit,
    context: AuditRequestContext,
  ): Promise<UnitView> {
    const inserted = await this.repository.insertUnit(tx, { ...input, now: this.clock.now() });
    if (!inserted) throw invalid('code', 'taken');
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'unit.created',
      targetType: 'unit',
      targetId: input.code,
      after: { ...input },
      context,
    });
    return await this.unitViewTx(tx, input.code);
  }

  /** US-028 AC3: ad, kısaltma, ondalık izni, aktiflik; silme yok, yalnız pasifleştirme. */
  async updateUnitTx(
    tx: Tx,
    actor: UnitsActor,
    code: string,
    input: UnitPatch,
    context: AuditRequestContext,
  ): Promise<UnitView> {
    const unit = await this.repository.lockUnit(tx, code);
    if (unit === undefined) throw new DomainError('NOT_FOUND');
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const patch: {
      name?: CatalogName;
      abbreviation?: UnitAbbreviation;
      allowsDecimal?: boolean;
      isActive?: boolean;
    } = {};
    if (input.name !== undefined && !sameText(unit.name, input.name)) {
      before.name = unit.name;
      after.name = input.name;
      patch.name = input.name;
    }
    if (input.abbreviation !== undefined && !sameText(unit.abbreviation, input.abbreviation)) {
      before.abbreviation = unit.abbreviation;
      after.abbreviation = input.abbreviation;
      patch.abbreviation = input.abbreviation;
    }
    if (input.allowsDecimal !== undefined && input.allowsDecimal !== unit.allowsDecimal) {
      before.allowsDecimal = unit.allowsDecimal;
      after.allowsDecimal = input.allowsDecimal;
      patch.allowsDecimal = input.allowsDecimal;
    }
    if (input.isActive !== undefined && input.isActive !== unit.isActive) {
      before.isActive = unit.isActive;
      after.isActive = input.isActive;
      patch.isActive = input.isActive;
    }
    if (Object.keys(patch).length > 0) {
      await this.repository.updateUnit(tx, code, patch, this.clock.now());
      await this.audit.record(tx, {
        actor: { type: 'platform', userId: actor.userId },
        businessId: null,
        action: 'unit.updated',
        targetType: 'unit',
        targetId: code,
        before,
        after,
        context,
      });
    }
    return await this.unitViewTx(tx, code);
  }

  /** US-028 AC2: aynı türdeki iki farklı birim; tek yön (K3); varsa oran güncellenir. */
  async saveConversionTx(
    tx: Tx,
    actor: UnitsActor,
    input: UnitConversionInput,
    context: AuditRequestContext,
  ): Promise<UnitConversionView> {
    if (input.fromCode === input.toCode) throw invalid('toCode', 'same_unit');
    const from = await this.repository.lockUnit(tx, input.fromCode);
    if (from === undefined) throw invalid('fromCode', 'not_found');
    const to = await this.repository.lockUnit(tx, input.toCode);
    if (to === undefined) throw invalid('toCode', 'not_found');
    if (from.kind !== to.kind) throw invalid('toCode', 'kind_mismatch');
    const existing = await this.repository.lockConversionPair(tx, input.fromCode, input.toCode);
    if (existing.some((row) => row.fromCode === input.toCode)) {
      throw invalid('toCode', 'reverse_exists');
    }
    const factor = factorText(input.factor);
    const previous = existing[0];
    if (previous !== undefined && factorText(previous.factor) === factor) {
      return { fromCode: input.fromCode, toCode: input.toCode, factor };
    }
    await this.repository.upsertConversion(tx, { ...input, factor, now: this.clock.now() });
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'unit_conversion.saved',
      targetType: 'unit_conversion',
      targetId: `${input.fromCode}:${input.toCode}`,
      ...(previous === undefined ? {} : { before: { factor: factorText(previous.factor) } }),
      after: { factor },
      context,
    });
    return { fromCode: input.fromCode, toCode: input.toCode, factor };
  }

  async deleteConversionTx(
    tx: Tx,
    actor: UnitsActor,
    fromCode: string,
    toCode: string,
    context: AuditRequestContext,
  ): Promise<void> {
    const existing = await this.repository.lockConversionPair(tx, fromCode, toCode);
    const row = existing.find((item) => item.fromCode === fromCode);
    if (row === undefined) throw new DomainError('NOT_FOUND');
    await this.repository.deleteConversion(tx, fromCode, toCode);
    await this.audit.record(tx, {
      actor: { type: 'platform', userId: actor.userId },
      businessId: null,
      action: 'unit_conversion.deleted',
      targetType: 'unit_conversion',
      targetId: `${fromCode}:${toCode}`,
      before: { factor: factorText(row.factor) },
      context,
    });
  }

  private async unitViewTx(tx: Tx, code: string): Promise<UnitView> {
    const row = await this.repository.findUnit(tx, code);
    if (row === undefined) throw new DomainError('NOT_FOUND');
    return unitView(row);
  }
}
