// F1.11-AC5: şablon kullanıcının dilinde; çeviri yoksa `az` (US-058 AC3).
import { describe, expect, it } from 'vitest';
import {
  renderTemplate,
  templateKeysFor,
  templatesFor,
  templateVariantKey,
  type TemplateText,
} from '../notification-template';
import { intentsForEvent, isNotificationType } from '../notification-types';

const templates = new Map<string, TemplateText>([
  ['az', { title: 'Sifariş {no}', body: 'Sifariş {no} təsdiqləndi' }],
  ['ru', { title: 'Заказ {no}', body: 'Заказ {no} подтверждён' }],
]);

describe('bildirim şablonu (birim)', () => {
  it('F1.11-AC5: kullanıcının dilindeki şablon seçilir, parametre doldurulur', () => {
    expect(renderTemplate(templates, 'ru', { no: 42 })).toEqual({
      lang: 'ru',
      title: 'Заказ 42',
      body: 'Заказ 42 подтверждён',
    });
  });

  it('F1.11-AC5: o dilde çeviri yoksa az', () => {
    expect(renderTemplate(templates, 'tr', { no: 7 })).toEqual({
      lang: 'az',
      title: 'Sifariş 7',
      body: 'Sifariş 7 təsdiqləndi',
    });
  });

  it('F1.11-AC5: kullanıcı dil seçmemişse az', () => {
    expect(renderTemplate(templates, null, { no: 1 })?.lang).toBe('az');
  });

  it('F1.11-AC5: az şablonu da yoksa sonuç yok', () => {
    const onlyRu = new Map([['ru', { title: 'Т', body: 'Б' }]]);
    expect(renderTemplate(onlyRu, 'tr', {})).toBeUndefined();
  });

  it('F1.11-AC5: bilinmeyen yer tutucu olduğu gibi kalır', () => {
    expect(renderTemplate(templates, 'az', {})?.title).toBe('Sifariş {no}');
  });
});

describe('bildirim türleri (birim)', () => {
  it('test olayı tek alıcıya test bildirimi üretir; bilinmeyen olay boş', () => {
    const userId = '0190a7f0-0000-7000-8000-000000000001';
    const ref = '0190a7f0-0000-7000-8000-000000000002';
    expect(intentsForEvent('notification.test', { userId, ref })).toEqual([
      { userId, businessId: null, type: 'test', subjectId: ref, params: {} },
    ]);
    expect(intentsForEvent('test.ping', { ref })).toEqual([]);
    expect(isNotificationType('test')).toBe(true);
    expect(isNotificationType('orders.new')).toBe(false);
  });

  it('US-012-AC2 olay → role_template_version bildirimi (işletme adminine, konu şablon)', () => {
    const templateId = '0190a7f0-0000-7000-8000-000000000003';
    const businessId = '0190a7f0-0000-7000-8000-000000000004';
    const userId = '0190a7f0-0000-7000-8000-000000000005';
    expect(
      intentsForEvent('role_template.version_published', {
        templateId,
        version: 3,
        businessId,
        userId,
      }),
    ).toEqual([
      {
        userId,
        businessId,
        type: 'role_template_version',
        subjectId: templateId,
        params: { version: 3 },
      },
    ]);
    expect(isNotificationType('role_template_version')).toBe(true);
  });
});

describe('değişkenli şablon (F2.18)', () => {
  const base = new Map<string, TemplateText>([['az', { title: 'Genel', body: 'Genel metin' }]]);
  const variant = new Map<string, TemplateText>([['az', { title: 'Ad', body: 'Ad uyuşmuyor' }]]);
  const all = new Map([
    ['voen_rejected', base],
    ['voen_rejected.name_mismatch', variant],
  ]);

  it('US-015 AC2 gerekçe kodunun şablonu seçilir, yoksa genel şablon', () => {
    expect(templatesFor(all, 'voen_rejected', { reason: 'name_mismatch' })).toBe(variant);
    expect(templatesFor(all, 'voen_rejected', { reason: 'other' })).toBe(base);
    expect(templatesFor(all, 'voen_rejected', {})).toBe(base);
  });

  it('US-015 AC2 değişken yalnız tanımlı türde ve kod biçiminde', () => {
    expect(templateVariantKey('connection_request', { reason: 'x' })).toBeUndefined();
    expect(templateVariantKey('voen_rejected', { reason: 'Serbest Metin!' })).toBeUndefined();
    expect(
      templateKeysFor([
        { type: 'voen_rejected', params: { reason: 'other' } },
        { type: 'test', params: {} },
      ]),
    ).toEqual(['voen_rejected', 'voen_rejected.other', 'test']);
  });
});
