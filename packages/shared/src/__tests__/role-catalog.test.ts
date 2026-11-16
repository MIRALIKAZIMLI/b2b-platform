import { describe, expect, it } from 'vitest';
import { visibleMenu } from '../menu';
import {
  catalogFailure,
  catalogNameSchema,
  catalogNameValues,
  jobTitleFormBody,
  templateFormBody,
} from '../role-catalog';

const name = { az: 'Kassir', ru: 'Кассир', tr: 'Kasiyer', en: '' };

describe('F2.9 admin katalog formları', () => {
  it('US-012-AC1 şablon formu: kod, üç dil ve en az bir izin; başka yeteneğin izni gövdeye girmez', () => {
    const result = templateFormBody(
      {
        code: 'seller_cashier',
        capability: 'seller',
        name,
        permissions: { 'catalog.view': 'all', 'cart.edit': 'branch' },
      },
      'create',
    );
    expect(result).toEqual({
      ok: true,
      body: {
        code: 'seller_cashier',
        capability: 'seller',
        name: { az: 'Kassir', ru: 'Кассир', tr: 'Kasiyer' },
        permissions: [{ code: 'catalog.view', scope: 'all' }],
      },
    });
    expect(catalogNameSchema.safeParse(result.ok ? result.body.name : {}).success).toBe(true);
  });

  it('US-012-AC1 şablon formu hataları: geçersiz kod, eksik dil, izin yok', () => {
    expect(
      templateFormBody(
        { code: 'Bad Code', capability: 'buyer', name: { ...name, ru: ' ' }, permissions: {} },
        'create',
      ),
    ).toEqual({
      ok: false,
      errors: { code: 'invalid', 'name.ru': 'required', permissions: 'required' },
    });
  });

  it('US-012-AC2 düzenlemede kod ve yetenek gönderilmez', () => {
    const result = templateFormBody(
      { code: '', capability: 'seller', name, permissions: { 'orders.view': 'all' } },
      'edit',
    );
    expect(result.ok && Object.keys(result.body).sort()).toEqual(['name', 'permissions']);
  });

  it('US-012-AC1 unvan formu: şablon zorunlu; kayıttaki ad forma dolar', () => {
    expect(
      jobTitleFormBody(
        { code: 'jt_one', capability: 'seller', name, roleTemplateId: '' },
        'create',
      ),
    ).toEqual({ ok: false, errors: { roleTemplateId: 'required' } });
    expect(catalogNameValues({ az: 'A', en: 'E' })).toEqual({ az: 'A', ru: '', tr: '', en: 'E' });
  });

  it('US-012-AC3 hata eşlemesi: kullanımda, kod alınmış, admin şablonu kilitli, yetenek', () => {
    expect(catalogFailure({ code: 'JOB_TITLE_IN_USE' })).toEqual({
      kind: 'catalog',
      reason: 'in_use',
    });
    expect(catalogFailure({ code: 'VALIDATION_FAILED', details: { code: ['taken'] } })).toEqual({
      kind: 'catalog',
      reason: 'code_taken',
    });
    expect(
      catalogFailure({
        code: 'VALIDATION_FAILED',
        details: { permissions: ['admin_template_locked'] },
      }),
    ).toEqual({ kind: 'catalog', reason: 'admin_template_locked' });
    expect(
      catalogFailure({ code: 'VALIDATION_FAILED', details: { roleTemplateId: ['capability'] } }),
    ).toEqual({ kind: 'catalog', reason: 'capability' });
    expect(catalogFailure({ code: 'PERMISSION_DENIED' })).toEqual({
      kind: 'code',
      code: 'PERMISSION_DENIED',
    });
  });

  it('F2.9 V1 menü: katalog öğeleri süper admin ve içerik ekibine, operasyona değil', () => {
    const keys = (role: string) => visibleMenu('admin', [], role).map((item) => item.key);
    expect(keys('content')).toEqual(['dashboard', 'role_templates', 'job_titles', 'units']);
    expect(keys('super_admin')).toContain('job_titles');
    expect(keys('operations')).not.toContain('role_templates');
  });
});
