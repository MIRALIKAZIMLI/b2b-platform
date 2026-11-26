// F3.3b web ürün formu: form ↔ gövde, istemci denetimi, 422 eşleme, durum düğmeleri.
import { describe, expect, it } from 'vitest';
import {
  categoryOptions,
  emptyProductForm,
  emptyVariant,
  missingPackagingLevels,
  productActions,
  productFieldErrors,
  type ProductForm,
  productFormBody,
  productsAccess,
  productToForm,
  type ProductViewLike,
  withBaseUnit,
} from '../product-form';
import { productCreateSchema, productUpdateSchema } from '../products';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('beklenen değer yok');
  return value;
}

const CATEGORY = '0190a000-0000-7000-8000-000000000001';
const VARIANT = '0190a000-0000-7000-8000-000000000002';
const OLD_VARIANT = '0190a000-0000-7000-8000-000000000003';
const REGION = '0190a000-0000-7000-8000-000000000004';

function validForm(): ProductForm {
  const base = emptyProductForm('k1');
  return {
    ...base,
    sku: 'SKU-1',
    name: { ...base.name, az: 'Süd 1 l' },
    categoryId: CATEGORY,
    variants: [{ ...emptyVariant('k1', 'H87'), sku: 'SKU-1-A' }],
  };
}

const view: ProductViewLike = {
  sku: 'P-1',
  name: { az: 'Ad', ru: 'Имя' },
  description: null,
  categoryId: CATEGORY,
  brandId: null,
  baseUnitCode: 'H87',
  hasExpiry: true,
  shelfLifeMonths: 6,
  visibility: { regionIds: [REGION] },
  variants: [
    {
      id: VARIANT,
      sku: 'P-1-A',
      gtin: null,
      status: 'active',
      attributes: { volume_ml: 400, color: 'qırmızı', light: true },
      packaging: [
        {
          level: 'case',
          unitCode: 'XCT',
          baseQty: '24',
          gtin: null,
          isSalesUnit: true,
          minOrderQty: '2',
          orderMultiple: '2',
          weightG: 9600,
          dimensionsMm: { l: 400, w: 300, h: 200 },
        },
        {
          level: 'unit',
          unitCode: 'H87',
          baseQty: '1',
          gtin: null,
          isSalesUnit: false,
          minOrderQty: '1',
          orderMultiple: '1',
        },
      ],
    },
    {
      id: OLD_VARIANT,
      sku: 'P-1-OLD',
      gtin: null,
      status: 'archived',
      attributes: {},
      packaging: [],
    },
  ],
};

describe('F3.3b ürün formu', () => {
  it('F3.3b-AC2 boş form: ad, SKU, kategori ve varyant SKU alan hataları', () => {
    const result = productFormBody(emptyProductForm('k'), 'create');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toMatchObject({
      sku: 'required',
      name: 'required',
      categoryId: 'required',
      'variants.0.sku': 'required',
    });
  });

  it('F3.3b-AC2 geçerli form POST gövdesi: boş diller atılır, varyant id yok, şema geçer', () => {
    const result = productFormBody(validForm(), 'create');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.name).toEqual({ az: 'Süd 1 l' });
    expect(result.body.description).toBeNull();
    expect(result.body.brandId).toBeNull();
    expect(result.body.shelfLifeMonths).toBeNull();
    expect(result.body.visibility).toEqual({ regionIds: [] });
    expect(result.body.variants[0]).not.toHaveProperty('id');
    expect(productCreateSchema.safeParse(result.body).success).toBe(true);
  });

  it('F3.3b-AC3 ambalaj: satış birimi yoksa varyant ambalajında hata; sıradaki seviye', () => {
    const form = validForm();
    const variant = form.variants[0];
    if (variant === undefined) throw new Error('varyant yok');
    const packaging = variant.packaging.map((item) => ({ ...item, isSalesUnit: false }));
    const result = productFormBody({ ...form, variants: [{ ...variant, packaging }] }, 'create');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['variants.0.packaging']).toBe('sales_unit_required');
    expect(missingPackagingLevels(variant.packaging)).toEqual(['inner', 'case', 'pallet']);
    expect(
      missingPackagingLevels([
        ...variant.packaging,
        { ...must(packaging[0]), level: 'inner' },
        { ...must(packaging[0]), level: 'case' },
        { ...must(packaging[0]), level: 'pallet' },
      ]),
    ).toEqual([]);
  });

  it('F3.3b-AC3 ambalaj: geçersiz miktar ve GTIN alan yoluyla döner', () => {
    const form = validForm();
    const variant = must(form.variants[0]);
    const unit = must(variant.packaging[0]);
    const result = productFormBody(
      {
        ...form,
        variants: [
          {
            ...variant,
            gtin: '1234567890123',
            packaging: [unit, { ...unit, level: 'case', unitCode: 'XCT', baseQty: '0' }],
          },
        ],
      },
      'create',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors['variants.0.gtin']).toBe('invalid_gtin');
    expect(result.errors['variants.0.packaging.1.baseQty']).toBe('positive');
  });

  it('F3.3b-AC3 temel birim değişince yalnız adet seviyesinin birimi değişir', () => {
    const form = productToForm(view);
    const next = withBaseUnit(form, 'KGM');
    const levels = must(next.variants[0]).packaging.map((item) => [item.level, item.unitCode]);
    expect(levels).toEqual([
      ['unit', 'KGM'],
      ['case', 'XCT'],
    ]);
  });

  it('F3.3b-AC4 son kullanma tarihi açıkken ay zorunlu; kapalıyken null gider', () => {
    const open = productFormBody({ ...validForm(), hasExpiry: true }, 'create');
    expect(open.ok).toBe(false);
    if (!open.ok) expect(open.errors.shelfLifeMonths).toBe('required');
    const wrong = productFormBody(
      { ...validForm(), hasExpiry: true, shelfLifeMonths: 'x' },
      'create',
    );
    if (!wrong.ok) expect(wrong.errors.shelfLifeMonths).toBe('invalid');
    const ok = productFormBody(
      { ...validForm(), hasExpiry: true, shelfLifeMonths: '12' },
      'create',
    );
    expect(ok.ok && ok.body.shelfLifeMonths).toBe(12);
    const closed = productFormBody(
      { ...validForm(), hasExpiry: false, shelfLifeMonths: '12' },
      'create',
    );
    expect(closed.ok && closed.body.shelfLifeMonths).toBeNull();
  });

  it('F3.3b-AC5 durum düğmeleri §14: taslak, yayında, arşiv; bekleyen marka yayını kapatır', () => {
    expect(productActions(null, true, null)).toMatchObject({
      editable: true,
      canSave: true,
      canPublish: false,
      canArchive: false,
    });
    expect(productActions('draft', true, 'active')).toMatchObject({
      canPublish: true,
      canArchive: true,
      canRestore: false,
      publishBlocked: null,
    });
    expect(productActions('draft', true, 'requested')).toMatchObject({
      canPublish: false,
      publishBlocked: 'brand_pending',
    });
    expect(productActions('active', true, null)).toMatchObject({
      editable: true,
      canPublish: false,
      canArchive: true,
    });
    expect(productActions('archived', true, null)).toEqual({
      editable: false,
      canSave: false,
      canPublish: false,
      publishBlocked: null,
      canArchive: false,
      canRestore: true,
    });
  });

  it('F3.3b-AC7 API 422 details form alanına eşlenir; bilinmeyen neden invalid', () => {
    expect(
      productFieldErrors({
        sku: ['taken'],
        'variants.sku': ['taken'],
        'variants.0.packaging.1.baseQty': ['not_increasing'],
        brandId: ['not_approved'],
        'name.az': ['Too big: expected string to have <=200 characters'],
        'visibility.regionIds': ['not_found'],
        'variants.0.attributes.color': ['x'],
      }),
    ).toEqual({
      sku: 'taken',
      variants: 'taken',
      'variants.0.packaging.1.baseQty': 'not_increasing',
      brandId: 'not_approved',
      name: 'invalid',
      'visibility.regionIds': 'not_found',
      'variants.0.attributes': 'invalid',
    });
    expect(productFieldErrors(undefined)).toEqual({});
  });

  it('F3.3b-AC8 düzenleme: varyant id, öznitelik türü, ağırlık/ölçü korunur; arşivli ayrı', () => {
    const form = productToForm(view);
    expect(form.variants.map((v) => v.id)).toEqual([VARIANT]);
    expect(form.archivedVariants.map((v) => v.id)).toEqual([OLD_VARIANT]);
    expect(must(form.variants[0]).packaging.map((item) => item.level)).toEqual(['unit', 'case']);
    expect(form.regionMode).toBe('selected');
    expect(form.name).toEqual({ az: 'Ad', ru: 'Имя', tr: '', en: '' });

    const result = productFormBody(form, 'update');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const variant = must(result.body.variants[0]);
    expect(variant).toMatchObject({
      id: VARIANT,
      attributes: { volume_ml: 400, color: 'qırmızı', light: true },
    });
    expect(variant.packaging[1]).toMatchObject({
      level: 'case',
      weightG: 9600,
      dimensionsMm: { l: 400, w: 300, h: 200 },
    });
    // Arşivli varyant listede yok: sunucu arşivde bırakır (K3).
    expect(result.body.variants).toHaveLength(1);
    expect(result.body.shelfLifeMonths).toBe(6);
    expect(result.body.visibility.regionIds).toEqual([REGION]);
    expect(productUpdateSchema.safeParse(result.body).success).toBe(true);
  });

  it('F3.3b-AC8 seçili bölge modu boşsa hata', () => {
    const result = productFormBody({ ...validForm(), regionMode: 'selected' }, 'create');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['visibility.regionIds']).toBe('regions_required');
  });

  it('F3.3b-AC9 izinler: catalog.view görür, catalog.manage yazar; yazamayan salt okunur', () => {
    expect(productsAccess(['catalog.view'])).toEqual({ view: true, manage: false });
    expect(productsAccess(['catalog.view', 'catalog.manage'])).toEqual({
      view: true,
      manage: true,
    });
    expect(productActions('draft', false, null)).toMatchObject({
      editable: false,
      canSave: false,
      canPublish: false,
      canArchive: false,
    });
  });

  it('F3.3b kategori seçici: ağaç sırası, yol etiketi, pasif kayıtlı kategori başta (#77 N5)', () => {
    const rows = [
      { id: 'b', parentId: 'a', depth: 2, sortOrder: 0, isActive: true, name: { az: 'Süd' } },
      { id: 'a', parentId: null, depth: 1, sortOrder: 0, isActive: true, name: { az: 'Qida' } },
    ];
    expect(categoryOptions(rows, 'az', 'a').map((o) => o.label)).toEqual(['Qida', 'Qida › Süd']);
    const withGone = categoryOptions(rows, 'az', 'gone');
    expect(withGone[0]).toMatchObject({ id: 'gone', unavailable: true });
  });
});
