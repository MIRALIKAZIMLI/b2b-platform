// Birim kataloğu sorguları (F3.1, US-028). Okuma her bağlamda (G: herkes okur); yazma yalnız
// çağıranın platform işleminde (`withPlatformTx`, platform-admin açar) RLS yazma politikasıyla.
import { Injectable } from '@nestjs/common';
import type { CatalogName, UnitAbbreviation, UnitKind } from '@b2b/shared';
import { and, asc, eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Tx } from '../../core/db';
import { unitConversions, units } from './catalog.schema';

export interface UnitRow {
  readonly code: string;
  readonly kind: string;
  readonly name: unknown;
  readonly abbreviation: unknown;
  readonly allowsDecimal: boolean;
  readonly isActive: boolean;
}

export interface UnitConversionRow {
  readonly fromCode: string;
  readonly toCode: string;
  readonly factor: string;
}

const unitColumns = {
  code: units.code,
  kind: units.kind,
  name: units.name,
  abbreviation: units.abbreviation,
  allowsDecimal: units.allowsDecimal,
  isActive: units.isActive,
};

const conversionColumns = {
  fromCode: unitConversions.fromCode,
  toCode: unitConversions.toCode,
  factor: unitConversions.factor,
};

@Injectable()
export class UnitsRepository {
  async listUnits(tx: Tx, activeOnly: boolean): Promise<UnitRow[]> {
    return await tx
      .select(unitColumns)
      .from(units)
      .where(activeOnly ? eq(units.isActive, true) : undefined)
      .orderBy(asc(units.code));
  }

  /** `activeOnly`: iki ucu da aktif dönüşümler (K4). */
  async listConversions(tx: Tx, activeOnly: boolean): Promise<UnitConversionRow[]> {
    if (!activeOnly) {
      return await tx
        .select(conversionColumns)
        .from(unitConversions)
        .orderBy(asc(unitConversions.fromCode), asc(unitConversions.toCode));
    }
    const fromUnit = alias(units, 'from_unit');
    const toUnit = alias(units, 'to_unit');
    return await tx
      .select(conversionColumns)
      .from(unitConversions)
      .innerJoin(fromUnit, eq(fromUnit.code, unitConversions.fromCode))
      .innerJoin(toUnit, eq(toUnit.code, unitConversions.toCode))
      .where(and(eq(fromUnit.isActive, true), eq(toUnit.isActive, true)))
      .orderBy(asc(unitConversions.fromCode), asc(unitConversions.toCode));
  }

  async findUnit(tx: Tx, code: string): Promise<UnitRow | undefined> {
    const rows = await tx.select(unitColumns).from(units).where(eq(units.code, code));
    return rows[0];
  }

  async lockUnit(tx: Tx, code: string): Promise<UnitRow | undefined> {
    const rows = await tx.select(unitColumns).from(units).where(eq(units.code, code)).for('update');
    return rows[0];
  }

  /** Aynı kod yarışında ikinci istek 0 satır ekler (çağıran 422 `taken` verir). */
  async insertUnit(
    tx: Tx,
    row: {
      code: string;
      kind: UnitKind;
      name: CatalogName;
      abbreviation: UnitAbbreviation;
      allowsDecimal: boolean;
      now: Date;
    },
  ): Promise<boolean> {
    const inserted = await tx
      .insert(units)
      .values({
        code: row.code,
        kind: row.kind,
        name: row.name,
        abbreviation: row.abbreviation,
        allowsDecimal: row.allowsDecimal,
        isActive: true,
        createdAt: row.now,
        updatedAt: row.now,
      })
      .onConflictDoNothing({ target: units.code })
      .returning({ code: units.code });
    return inserted.length > 0;
  }

  async updateUnit(
    tx: Tx,
    code: string,
    patch: {
      name?: CatalogName;
      abbreviation?: UnitAbbreviation;
      allowsDecimal?: boolean;
      isActive?: boolean;
    },
    now: Date,
  ): Promise<void> {
    await tx
      .update(units)
      .set({ ...patch, updatedAt: now })
      .where(eq(units.code, code));
  }

  /** İki yönden biri kayıtlıysa satırı (kilitli) döner. */
  async lockConversionPair(tx: Tx, fromCode: string, toCode: string): Promise<UnitConversionRow[]> {
    return await tx
      .select(conversionColumns)
      .from(unitConversions)
      .where(
        or(
          and(eq(unitConversions.fromCode, fromCode), eq(unitConversions.toCode, toCode)),
          and(eq(unitConversions.fromCode, toCode), eq(unitConversions.toCode, fromCode)),
        ),
      )
      .for('update');
  }

  async upsertConversion(
    tx: Tx,
    row: { fromCode: string; toCode: string; factor: string; now: Date },
  ): Promise<void> {
    await tx
      .insert(unitConversions)
      .values({
        fromCode: row.fromCode,
        toCode: row.toCode,
        factor: row.factor,
        createdAt: row.now,
        updatedAt: row.now,
      })
      .onConflictDoUpdate({
        target: [unitConversions.fromCode, unitConversions.toCode],
        set: { factor: row.factor, updatedAt: row.now },
      });
  }

  async deleteConversion(tx: Tx, fromCode: string, toCode: string): Promise<boolean> {
    const deleted = await tx
      .delete(unitConversions)
      .where(and(eq(unitConversions.fromCode, fromCode), eq(unitConversions.toCode, toCode)))
      .returning({ fromCode: unitConversions.fromCode });
    return deleted.length > 0;
  }
}
