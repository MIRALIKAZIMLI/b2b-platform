'use client';
// Ürün formu (F3.3b, US-030 AC1–AC6). UX kararları:
// - Tek sayfa, dört kart: Əsas (SKU, dil sekmeli ad + açıklama; dolu dil noktayla işaretli),
//   Təsnifat (kategori, marka, temel birim, raf ömrü), Variantlar, Görünürlük (hamısı / seçilən
//   bölgələr). Altta sabit eylem çubuğu: durum rozeti + Yadda saxla / Dərc et / Arxivlə / Bərpa et.
// - Yeni ürün yalnız "Qaralama kimi saxla" (her zaman `draft`); yayın detayda (§14).
// - Onay bekleyen markada "Dərc et" kapalı ve nedeni yazar (V5). Arşivli ürün ve `catalog.manage`
//   olmayan üye: alanlar salt okunur (fieldset disabled).
// - Kategori artık görünür değilse (pasif) uyarı (#77 N5); seçicide "(deaktiv)".
// - İstemci hataları ve API 422 aynı alana düşer (`productFieldErrors`); üstte özet uyarı.
import {
  categoryOptions,
  filterRegionOptions,
  LANGUAGE_CODES,
  type LanguageCode,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_NAME_MAX,
  PRODUCT_SKU_MAX,
  type ProductFieldErrors,
  type ProductForm,
  productActions,
  productFieldErrors,
  productFormBody,
  productsAccess,
  productToForm,
  emptyProductForm,
  SHELF_LIFE_MONTHS_MAX,
  withBaseUnit,
} from '@b2b/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { ApiError, useRegionOptions } from '../admin-sellers/api';
import { LoadFailed, StatusLine } from '../seller-settings/status';
import { useShell } from '../shell/use-shell';
import { Dialog } from '../ui/dialog';
import {
  Button,
  Card,
  Field,
  PageHeader,
  SelectInput,
  TextArea,
  TextInput,
} from '../ui/primitives';
import {
  type Category,
  type Product,
  type Unit,
  useCategories,
  useProduct,
  useProductMutations,
  useUnits,
} from './api';
import { type BrandChoice, BrandPicker } from './brand-picker';
import { useFieldError } from './error-text';
import { ProductPricesCard } from '../prices/product-prices-card';
import { ProductTierPricesCard } from '../prices/product-tier-prices-card';
import { ImagesCard } from './images-card';
import { StatusBadge } from './products-page';
import { unitLabel, VariantsEditor } from './variants-editor';

const newKey = () => globalThis.crypto.randomUUID();

/** `/seller/products/new` (productId yok) ve `/seller/products/[id]`. */
export function ProductEditor({ productId }: { productId?: string }) {
  const t = useTranslations('products');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const shell = useShell();
  const businessId = shell.activeBusinessId;
  const access = productsAccess((shell.me?.activeBusiness?.permissions ?? []).map((p) => p.code));
  const product = useProduct(businessId, productId);
  const units = useUnits();
  const categories = useCategories();
  const [saved, setSaved] = useState<string | undefined>();
  // Yeni ürün kaydından sonra `?created=1` ile gelinir: bir kez "yaradıldı" yazılır.
  useEffect(() => {
    if (new URLSearchParams(globalThis.location.search).get('created') === '1') {
      setSaved(t('created'));
    }
  }, [t]);

  const back = (
    <Link
      href={`/${locale}/seller/products`}
      className="text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-slate-900"
    >
      ← {t('back')}
    </Link>
  );

  if (product.isError || units.isError || categories.isError) {
    const code = errorCodeOf(product.error);
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
        {back}
        {code === 'NOT_FOUND' ? (
          <p role="alert" className="text-sm text-slate-600">
            {tErrors('NOT_FOUND')}
          </p>
        ) : (
          <LoadFailed
            onRetry={() => {
              void product.refetch();
              void units.refetch();
              void categories.refetch();
            }}
          />
        )}
      </div>
    );
  }
  const loading =
    units.data === undefined ||
    categories.data === undefined ||
    (productId !== undefined && product.data === undefined) ||
    shell.me === undefined;
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:py-12" aria-busy="true">
        {back}
        <div className="h-8 w-1/3 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }
  return (
    <ProductFormView
      // Kayıttan sonra sunucudaki hâl yeniden yüklenir (varyant kimlikleri, arşivler).
      key={product.data?.updatedAt ?? 'new'}
      businessId={businessId}
      product={product.data}
      canManage={access.manage}
      units={units.data}
      categories={categories.data}
      saved={saved}
      onSaved={setSaved}
      back={back}
    />
  );
}

function ProductFormView({
  businessId,
  product,
  canManage,
  units,
  categories,
  saved,
  onSaved,
  back,
}: {
  businessId: string | undefined;
  product: Product | undefined;
  canManage: boolean;
  units: Unit[];
  categories: Category[];
  saved: string | undefined;
  onSaved: (text: string | undefined) => void;
  back: ReactNode;
}) {
  const t = useTranslations('products');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const { create, update } = useProductMutations(businessId);
  const [form, setForm] = useState<ProductForm>(() =>
    product === undefined
      ? emptyProductForm(
          newKey(),
          units.some((u) => u.code === 'H87') ? 'H87' : (units[0]?.code ?? 'H87'),
        )
      : productToForm(product),
  );
  const [brand, setBrand] = useState<BrandChoice | null>(product?.brand ?? null);
  const [lang, setLang] = useState<LanguageCode>(
    LANGUAGE_CODES.includes(locale as LanguageCode) ? (locale as LanguageCode) : 'az',
  );
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const [idempotencyKey] = useState(newKey);
  // #78 notu: arşivleme formu sunucudaki hâle döndürür; kaydedilmemiş düzenleme varsa önce sorulur.
  const [savedSnapshot] = useState(() => JSON.stringify(form));
  const [brandSnapshot] = useState(() => brand?.id ?? null);
  const dirty = JSON.stringify(form) !== savedSnapshot || (brand?.id ?? null) !== brandSnapshot;
  const [confirmArchive, setConfirmArchive] = useState(false);
  const fieldError = useFieldError(errors);

  const status = product?.status ?? null;
  const actions = productActions(status, canManage, brand?.status ?? null);
  const busy = create.isPending || update.isPending;
  const options = useMemo(
    () => categoryOptions(categories, locale, product?.categoryId),
    [categories, locale, product?.categoryId],
  );
  const categoryUnavailable = options.some(
    (option) => option.unavailable && option.id === form.categoryId,
  );
  const unitChoices = units.some((unit) => unit.code === form.baseUnitCode)
    ? units.map((unit) => ({ code: unit.code, label: unitLabel(unit, locale) }))
    : [
        ...units.map((unit) => ({ code: unit.code, label: unitLabel(unit, locale) })),
        { code: form.baseUnitCode, label: form.baseUnitCode },
      ];

  const edit = (patch: Partial<ProductForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    onSaved(undefined);
    setMessage(undefined);
  };

  function fail(failure: unknown) {
    if (failure instanceof ApiError && failure.code === 'VALIDATION_FAILED') {
      setErrors(productFieldErrors(failure.details));
      setMessage(t('fix_errors'));
      return;
    }
    const code = errorCodeOf(failure);
    setMessage(code === 'INVALID_STATE_TRANSITION' ? t('error_state') : tErrors(code));
  }

  function submit(nextStatus?: 'active') {
    onSaved(undefined);
    setMessage(undefined);
    const result = productFormBody(form, product === undefined ? 'create' : 'update');
    if (!result.ok) {
      setErrors(result.errors);
      setMessage(t('fix_errors'));
      return;
    }
    setErrors({});
    if (product === undefined) {
      create.mutate(
        { body: result.body, key: idempotencyKey },
        {
          onSuccess: (created) => {
            router.replace(`/${locale}/seller/products/${created.id}?created=1`);
          },
          onError: fail,
        },
      );
      return;
    }
    update.mutate(
      {
        id: product.id,
        body: { ...result.body, ...(nextStatus === undefined ? {} : { status: nextStatus }) },
      },
      {
        onSuccess: () => {
          onSaved(nextStatus === 'active' ? t('published') : t('saved'));
        },
        onError: fail,
      },
    );
  }

  function changeStatus(next: 'archived' | 'draft') {
    if (product === undefined) return;
    onSaved(undefined);
    setMessage(undefined);
    update.mutate(
      { id: product.id, body: { status: next } },
      {
        onSuccess: () => {
          onSaved(next === 'archived' ? t('archived') : t('restored'));
        },
        onError: fail,
      },
    );
  }

  const title =
    product === undefined
      ? t('create_title')
      : (LANGUAGE_CODES.map((code) => form.name[code]).find((v) => v.trim() !== '') ?? product.sku);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pt-8 pb-12 sm:px-6 lg:pt-12">
      {back}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={title}
        description={product === undefined ? t('create_description') : t('edit_description')}
      />
      {status === 'archived' && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t('archived_notice')}
        </p>
      )}
      {!canManage && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t('read_only_notice')}
        </p>
      )}
      <StatusLine error={message} saved={saved !== undefined} savedText={saved ?? ''} />
      <form
        noValidate
        data-testid="product-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (actions.canSave) submit();
        }}
      >
        <fieldset disabled={!actions.editable || busy} className="min-w-0 space-y-6">
          <Card className="space-y-6 p-6 sm:p-8">
            <h2 className="text-base font-semibold text-slate-900">{t('section.basic')}</h2>
            <Field
              id="product-sku"
              label={t('field.sku')}
              hint={t('field.sku_hint')}
              error={fieldError('sku')}
              className="max-w-sm"
            >
              <TextInput
                id="product-sku"
                name="sku"
                autoComplete="off"
                maxLength={PRODUCT_SKU_MAX}
                value={form.sku}
                invalid={fieldError('sku') !== undefined}
                aria-invalid={fieldError('sku') !== undefined}
                onChange={(event) => {
                  edit({ sku: event.target.value });
                }}
              />
            </Field>
            <div className="space-y-4">
              <div
                role="tablist"
                aria-label={t('language_tabs')}
                className="inline-flex rounded-xl bg-slate-100/80 p-1"
              >
                {LANGUAGE_CODES.map((code) => {
                  const selected = code === lang;
                  const filled = form.name[code].trim() !== '';
                  return (
                    <button
                      key={code}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      data-testid={`lang-tab-${code}`}
                      onClick={() => {
                        setLang(code);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium uppercase transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                        selected
                          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {code}
                      {filled && (
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      )}
                    </button>
                  );
                })}
              </div>
              <Field
                id="product-name"
                label={t('field.name', { lang: lang.toUpperCase() })}
                hint={t('field.name_hint')}
                error={fieldError('name')}
              >
                <TextInput
                  id="product-name"
                  name={`name.${lang}`}
                  autoComplete="off"
                  maxLength={PRODUCT_NAME_MAX}
                  value={form.name[lang]}
                  invalid={fieldError('name') !== undefined}
                  aria-invalid={fieldError('name') !== undefined}
                  onChange={(event) => {
                    edit({ name: { ...form.name, [lang]: event.target.value } });
                  }}
                />
              </Field>
              <Field
                id="product-description"
                label={t('field.description', { lang: lang.toUpperCase() })}
                error={fieldError('description')}
              >
                <TextArea
                  id="product-description"
                  name={`description.${lang}`}
                  rows={4}
                  maxLength={PRODUCT_DESCRIPTION_MAX}
                  value={form.description[lang]}
                  invalid={fieldError('description') !== undefined}
                  onChange={(event) => {
                    edit({ description: { ...form.description, [lang]: event.target.value } });
                  }}
                />
              </Field>
            </div>
          </Card>

          <ImagesCard
            businessId={businessId}
            productId={product?.id}
            images={product?.images ?? []}
            readOnly={!actions.editable}
          />

          <Card className="space-y-6 p-6 sm:p-8">
            <h2 className="text-base font-semibold text-slate-900">
              {t('section.classification')}
            </h2>
            <Field
              id="product-category"
              label={t('field.category')}
              error={fieldError('categoryId')}
            >
              <SelectInput
                id="product-category"
                name="categoryId"
                value={form.categoryId}
                invalid={fieldError('categoryId') !== undefined}
                aria-invalid={fieldError('categoryId') !== undefined}
                onChange={(event) => {
                  edit({ categoryId: event.target.value });
                }}
              >
                <option value="">{t('field.category_placeholder')}</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.unavailable ? t('category_unavailable_option') : option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {categoryUnavailable && (
              <p
                role="status"
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                {t('category_unavailable')}
              </p>
            )}
            <BrandPicker
              businessId={businessId}
              value={brand}
              disabled={!actions.editable}
              error={fieldError('brandId')}
              onChange={(choice) => {
                setBrand(choice);
                edit({ brandId: choice?.id ?? '' });
              }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="product-base-unit"
                label={t('field.base_unit')}
                hint={t('field.base_unit_hint')}
                error={fieldError('baseUnitCode')}
              >
                <SelectInput
                  id="product-base-unit"
                  name="baseUnitCode"
                  value={form.baseUnitCode}
                  invalid={fieldError('baseUnitCode') !== undefined}
                  onChange={(event) => {
                    setForm((prev) => withBaseUnit(prev, event.target.value));
                    onSaved(undefined);
                  }}
                >
                  {unitChoices.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <div className="space-y-3">
                <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-900">
                  <input
                    type="checkbox"
                    name="hasExpiry"
                    checked={form.hasExpiry}
                    onChange={(event) => {
                      edit({
                        hasExpiry: event.target.checked,
                        shelfLifeMonths: event.target.checked ? form.shelfLifeMonths : '',
                      });
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/40"
                  />
                  {t('field.has_expiry')}
                </label>
                {form.hasExpiry && (
                  <Field
                    id="product-shelf-life"
                    label={t('field.shelf_life')}
                    error={fieldError('shelfLifeMonths')}
                  >
                    <TextInput
                      id="product-shelf-life"
                      name="shelfLifeMonths"
                      inputMode="numeric"
                      maxLength={3}
                      value={form.shelfLifeMonths}
                      placeholder={`1–${String(SHELF_LIFE_MONTHS_MAX)}`}
                      invalid={fieldError('shelfLifeMonths') !== undefined}
                      aria-invalid={fieldError('shelfLifeMonths') !== undefined}
                      onChange={(event) => {
                        edit({ shelfLifeMonths: event.target.value });
                      }}
                    />
                  </Field>
                )}
              </div>
            </div>
          </Card>

          <VariantsEditor
            variants={form.variants}
            archived={form.archivedVariants}
            baseUnitCode={form.baseUnitCode}
            units={units}
            errors={errors}
            newKey={newKey}
            readOnly={!actions.editable}
            onChange={(variants, archivedVariants) => {
              edit({ variants, archivedVariants });
            }}
          />

          <VisibilityCard form={form} error={fieldError('visibility.regionIds')} onChange={edit} />
        </fieldset>

        {(actions.canSave || actions.canArchive || actions.canRestore) && (
          <div className="sticky bottom-4 z-20 mt-6 rounded-2xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-900/5 backdrop-blur">
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
                {status !== null && <StatusBadge status={status} />}
                {actions.publishBlocked === 'brand_pending' && (
                  <span>{t('publish_blocked_brand')}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {actions.canArchive && (
                  <Button
                    variant="quiet-danger"
                    disabled={busy}
                    onClick={() => {
                      if (dirty) {
                        setConfirmArchive(true);
                        return;
                      }
                      changeStatus('archived');
                    }}
                  >
                    {t('action.archive')}
                  </Button>
                )}
                {actions.canRestore && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      changeStatus('draft');
                    }}
                  >
                    {t('action.restore')}
                  </Button>
                )}
                {actions.canSave && (
                  <Button
                    type="submit"
                    variant={actions.canPublish ? 'secondary' : 'primary'}
                    disabled={busy}
                  >
                    {product === undefined ? t('action.save_draft') : t('action.save')}
                  </Button>
                )}
                {status === 'draft' && actions.canSave && (
                  <Button
                    disabled={busy || !actions.canPublish}
                    onClick={() => {
                      submit('active');
                    }}
                  >
                    {t('action.publish')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </form>
      {product !== undefined && (
        <div className="mt-6">
          <ProductPricesCard businessId={businessId} product={product} units={units} />
        </div>
      )}
      {product !== undefined && (
        <div className="mt-6">
          <ProductTierPricesCard businessId={businessId} product={product} units={units} />
        </div>
      )}
      {confirmArchive && (
        <DiscardDialog
          onCancel={() => {
            setConfirmArchive(false);
          }}
          onConfirm={() => {
            setConfirmArchive(false);
            changeStatus('archived');
          }}
        />
      )}
    </div>
  );
}

/** Kaydedilmemiş düzenleme varken arşivleme onayı (Müfettiş #78 notu). */
function DiscardDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const t = useTranslations('products.discard');
  const titleId = useId();
  const bodyId = useId();
  return (
    <Dialog labelledBy={titleId} describedBy={bodyId} onClose={onCancel} tone="danger">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {t('title')}
          </h2>
          <p id={bodyId} className="text-sm text-slate-600">
            {t('body')}
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" data-autofocus onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t('confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function VisibilityCard({
  form,
  error,
  onChange,
}: {
  form: ProductForm;
  error: string | undefined;
  onChange: (patch: Partial<ProductForm>) => void;
}) {
  const t = useTranslations('products');
  const locale = useLocale();
  const regions = useRegionOptions(locale);
  const [query, setQuery] = useState('');
  const all = regions.data ?? [];
  const visible = filterRegionOptions(all, query, locale).slice(0, 50);
  const labelOf = new Map(all.map((option) => [option.id, option.label]));
  const selected = new Set(form.regionIds);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ regionIds: [...next] });
  };
  return (
    <Card className="space-y-5 p-6 sm:p-8">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">{t('section.visibility')}</h2>
        <p className="text-sm text-slate-500">{t('section.visibility_hint')}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['all', 'selected'] as const).map((mode) => (
          <label
            key={mode}
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition-all duration-200 ${
              form.regionMode === mode
                ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-500/20'
                : 'border-slate-200/80 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name="regionMode"
              value={mode}
              checked={form.regionMode === mode}
              onChange={() => {
                onChange({ regionMode: mode });
              }}
              className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500/40"
            />
            <span className="space-y-0.5">
              <span className="block font-medium text-slate-900">{t(`visibility.${mode}`)}</span>
              <span className="block text-xs text-slate-500">{t(`visibility.${mode}_hint`)}</span>
            </span>
          </label>
        ))}
      </div>
      {form.regionMode === 'selected' && (
        <div className="space-y-3">
          {form.regionIds.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={t('visibility.selected_list')}>
              {form.regionIds.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      toggle(id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/20 transition-colors duration-200 hover:bg-indigo-100"
                  >
                    {labelOf.get(id) ?? id}
                    <span aria-hidden>×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label htmlFor="region-search" className="sr-only">
            {t('visibility.search_label')}
          </label>
          <TextInput
            id="region-search"
            type="search"
            autoComplete="off"
            placeholder={t('visibility.search_placeholder')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200/80">
            {visible.map((option) => (
              <li key={option.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-slate-700 transition-colors duration-200 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.has(option.id)}
                    onChange={() => {
                      toggle(option.id);
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/40"
                  />
                  {option.label}
                </label>
              </li>
            ))}
          </ul>
          {error !== undefined && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
