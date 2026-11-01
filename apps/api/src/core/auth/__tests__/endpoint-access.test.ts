// Varsayılan reddet bekçisi (Mimar, F1.8b): uygulamadaki TÜM controller uçları taranır. Her uç bir
// erişim işareti taşır; @Public / @Authenticated dışındakiler izin kodu veya platform rolü ister.
// Yeni bir controller işaretsiz eklenirse bu test (ve lint kuralı) kırılır. Uç listesi de sabittir:
// yeni @Public / @Authenticated uç bilinçli olarak bu listeye eklenir.
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { isPermissionCode, isPlatformRole } from '@b2b/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { ACCESS_METADATA, type AccessRule } from '../access-decorators';

interface Endpoint {
  readonly route: string;
  readonly rule: AccessRule | undefined;
}

/** Bilinçli olarak kimliksiz (Public) veya yalnızca girişli (Authenticated) uçlar. */
const EXPECTED_OPEN: Record<string, 'public' | 'authenticated'> = {
  'GET /api/health': 'public',
  // F1.14b: mobil açılışta, girişten önce sürüm kontrolü (US-060).
  'GET /api/app-config': 'public',
  'GET /api/v1/i18n/:lang': 'public',
  'GET /api/v1/catalog/regions': 'public',
  'GET /api/v1/dev/sms-outbox': 'public',
  // Yerel dosya deposu (ADR-0023): erişim token'daki HMAC imzası ve süreyle.
  'PUT /api/v1/dev/storage': 'public',
  'GET /api/v1/dev/storage': 'public',
  'POST /api/v1/auth/otp/request': 'public',
  'POST /api/v1/auth/otp/verify': 'public',
  'POST /api/v1/auth/refresh': 'public',
  'POST /api/v1/auth/totp/setup': 'public',
  'POST /api/v1/auth/totp/verify': 'public',
  'POST /api/v1/auth/logout': 'authenticated',
  'GET /api/v1/auth/sessions': 'authenticated',
  'DELETE /api/v1/auth/sessions/:id': 'authenticated',
  'GET /api/v1/me': 'authenticated',
  // F1.13a: profil (ad, dil, saat dilimi); yalnız kendi satırı (users U).
  'PATCH /api/v1/me': 'authenticated',
  'POST /api/v1/push-tokens': 'authenticated',
  'GET /api/v1/notifications': 'authenticated',
  'POST /api/v1/notifications/read': 'authenticated',
  'PUT /api/v1/notifications/preferences': 'authenticated',
  // İzin purpose'a göre; bağlam ve izin uç içinde TenantContextService ile (F1.10 S1).
  'POST /api/v1/files/upload-url': 'authenticated',
  'POST /api/v1/files/:id/complete': 'authenticated',
  // F2.1a: davet kabulü; kabul eden henüz üye değil (R17), telefon eşleşmesi fonksiyonda (R16).
  'POST /api/v1/team/invitations/accept': 'authenticated',
  // F2.2: kimliksiz toptancı başvuru formu (US-008); IP hız sınırı serviste.
  'POST /api/v1/seller-applications': 'public',
  // F2.3a: kayıt formu listesi (G tablosu, herkes okur).
  'GET /api/v1/catalog/activity-types': 'public',
  // F2.3a: kimliksiz perakendeci kaydı; yetki kayıt anahtarı (pendingToken) ile serviste, IP hız
  // sınırı serviste (F2 spesifikasyonu §6 kural 6).
  'POST /api/v1/buyers/register': 'public',
};

/** Platform uçlarının rolleri (F2.1a S1 = A: toptancıyı süper admin ve operasyon açar). */
const EXPECTED_PLATFORM: Record<string, readonly string[]> = {
  'POST /api/v1/admin/sellers': ['super_admin', 'operations'],
  'GET /api/v1/admin/sellers': ['super_admin', 'operations'],
  'POST /api/v1/admin/sellers/:id/activation': ['super_admin', 'operations'],
  'GET /api/v1/admin/plans': ['super_admin', 'operations'],
  'GET /api/v1/admin/seller-applications': ['super_admin', 'operations'],
  'POST /api/v1/admin/seller-applications/:id/reject': ['super_admin', 'operations'],
};

function join(...parts: (string | undefined)[]): string {
  const path = parts
    .flatMap((part) => (part ?? '').split('/'))
    .filter((segment) => segment !== '')
    .join('/');
  return `/${path}`;
}

function collect(app: NestFastifyApplication): Endpoint[] {
  const modules = app.get(ModulesContainer);
  const scanner = new MetadataScanner();
  const reflector = app.get(Reflector);
  const endpoints: Endpoint[] = [];
  const wrappers = [...modules.values()].flatMap((module) => [...module.controllers.values()]);
  for (const wrapper of wrappers) {
    const instance: unknown = wrapper.instance;
    const type = wrapper.metatype;
    if (typeof instance !== 'object' || instance === null || type === null) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
    const base = reflector.get<string | undefined>(PATH_METADATA, type);
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (typeof handler !== 'function') continue;
      const method = reflector.get<RequestMethod | undefined>(METHOD_METADATA, handler);
      if (method === undefined) continue;
      const path = reflector.get<string | undefined>(PATH_METADATA, handler);
      const rule =
        reflector.get<AccessRule | undefined>(ACCESS_METADATA, handler) ??
        reflector.get<AccessRule | undefined>(ACCESS_METADATA, type);
      endpoints.push({ route: `${RequestMethod[method]} ${join(base, path)}`, rule });
    }
  }
  return endpoints;
}

describe('uç noktası erişim bekçisi (varsayılan reddet)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('F1.8-AC8: her controller ucu erişim işareti taşır; açık uçlar beklenen listeyle aynı', () => {
    const endpoints = collect(app);
    expect(endpoints.length).toBeGreaterThan(0);
    const open: Record<string, string> = {};
    for (const endpoint of endpoints) {
      const rule = endpoint.rule;
      expect(rule, `${endpoint.route} işaretsiz`).toBeDefined();
      if (rule === undefined) continue;
      switch (rule.kind) {
        case 'public':
        case 'authenticated':
          open[endpoint.route] = rule.kind;
          break;
        case 'permission':
          expect(isPermissionCode(rule.code), endpoint.route).toBe(true);
          break;
        case 'platform':
          expect(rule.roles.length, endpoint.route).toBeGreaterThan(0);
          expect(rule.roles.every(isPlatformRole), endpoint.route).toBe(true);
          break;
      }
    }
    expect(open).toEqual(EXPECTED_OPEN);
  });

  it('F2.1a-AC6: admin uçları yalnız süper admin ve operasyon rolüne açık', () => {
    const platform: Record<string, readonly string[]> = {};
    for (const endpoint of collect(app)) {
      if (endpoint.rule?.kind === 'platform') platform[endpoint.route] = endpoint.rule.roles;
    }
    expect(platform).toEqual(EXPECTED_PLATFORM);
  });
});
