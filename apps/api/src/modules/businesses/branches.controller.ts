import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { MIN_ORDER_AMOUNT_PATTERN } from '@b2b/shared';
import { z } from 'zod';
import { type AuditHttpRequest, requestAuditContext } from '../../core/audit';
import { RequirePermission } from '../../core/auth/access-decorators';
import { CurrentTenant, type TenantContext } from '../../core/tenant-context';
import { BRANCH_APPROVAL_RULES } from './branch-approval';
import type { BranchRow } from './branches.repository';
import { BranchesService } from './branches.service';

// openapi: F2.5 (US-010) şubeler. İzin `business.manage` (c4 §5); `buyer` yeteneği serviste.
// Silme ucu yok (AC4, T2): şube yalnız PATCH `status: inactive` ile pasifleşir.

const thresholdSchema = z
  .string()
  .regex(MIN_ORDER_AMOUNT_PATTERN, 'invalid_amount')
  .refine((value) => /[1-9]/.test(value), 'must_be_positive');

const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

const baseFields = {
  name: z.string().trim().min(1).max(120),
  regionId: z.uuid(),
  addressLine: z.string().trim().min(1).max(300),
  approvalRule: z.enum(BRANCH_APPROVAL_RULES),
  approvalThreshold: thresholdSchema.nullable(),
};

interface GeoBody {
  readonly lat?: number | null | undefined;
  readonly lng?: number | null | undefined;
}

/** Konum iki koordinatla birlikte (T6): ikisi de sayı ya da ikisi de yok / null. */
function geoOf(body: GeoBody) {
  const hasLat = body.lat !== undefined;
  const hasLng = body.lng !== undefined;
  if (!hasLat && !hasLng) return undefined;
  if (body.lat === null && body.lng === null) return null;
  if (typeof body.lat === 'number' && typeof body.lng === 'number') {
    return { lat: body.lat, lng: body.lng };
  }
  return 'invalid' as const;
}

const geoRefine = (body: GeoBody) => geoOf(body) !== 'invalid';
const geoIssue = { message: 'geo_pair', path: ['lat'] };

const branchCreateSchema = z
  .strictObject({
    ...baseFields,
    approvalRule: baseFields.approvalRule.optional(),
    approvalThreshold: baseFields.approvalThreshold.optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
  })
  .refine(geoRefine, geoIssue);

const branchUpdateSchema = z
  .strictObject({
    ...baseFields,
    lat: latSchema.nullable(),
    lng: lngSchema.nullable(),
    status: z.enum(['active', 'inactive']),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'empty_body' })
  .refine(geoRefine, geoIssue);

/** openapi `Branch`. */
export interface BranchView {
  readonly id: string;
  readonly name: string;
  readonly regionId: string | null;
  readonly addressLine: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly approvalRule: string;
  readonly approvalThreshold: string | null;
  readonly status: string;
}

function toBranch(row: BranchRow): BranchView {
  return {
    id: row.id,
    name: row.name,
    regionId: row.regionId,
    addressLine: row.addressLine,
    lat: row.geoLat === null ? null : Number(row.geoLat),
    lng: row.geoLng === null ? null : Number(row.geoLng),
    approvalRule: row.approvalRule,
    approvalThreshold: row.approvalThreshold,
    status: row.status,
  };
}

const idSchema = z.uuid();

/** geoOf sonrası 'invalid' şemada elendi. */
function geoValue(body: GeoBody) {
  const geo = geoOf(body);
  return geo === 'invalid' ? undefined : geo;
}

@Controller('api/v1/branches')
export class BranchesController {
  constructor(@Inject(BranchesService) private readonly branches: BranchesService) {}

  @Get()
  @RequirePermission('business.manage')
  async list(@CurrentTenant() tenant: TenantContext): Promise<BranchView[]> {
    return (await this.branches.list(tenant)).map(toBranch);
  }

  @Get(':id')
  @RequirePermission('business.manage')
  async get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string): Promise<BranchView> {
    return toBranch(await this.branches.get(tenant, idSchema.parse(id)));
  }

  /** US-010 AC1, AC3. */
  @Post()
  @HttpCode(201)
  @RequirePermission('business.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<BranchView> {
    const input = branchCreateSchema.parse(body);
    const row = await this.branches.create(
      tenant,
      {
        name: input.name,
        regionId: input.regionId,
        addressLine: input.addressLine,
        geo: geoValue(input) ?? null,
        approvalRule: input.approvalRule,
        approvalThreshold: input.approvalThreshold,
      },
      requestAuditContext(req),
    );
    return toBranch(row);
  }

  /** Düzenleme; US-010 AC4 pasifleştirme. */
  @Patch(':id')
  @RequirePermission('business.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuditHttpRequest,
  ): Promise<BranchView> {
    const input = branchUpdateSchema.parse(body);
    const row = await this.branches.update(
      tenant,
      idSchema.parse(id),
      {
        name: input.name,
        regionId: input.regionId,
        addressLine: input.addressLine,
        geo: geoValue(input),
        approvalRule: input.approvalRule,
        approvalThreshold: input.approvalThreshold,
        status: input.status,
      },
      requestAuditContext(req),
    );
    return toBranch(row);
  }
}
