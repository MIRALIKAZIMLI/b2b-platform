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
  'GET /api/v1/i18n/:lang': 'public',
  'GET /api/v1/catalog/regions': 'public',
  'GET /api/v1/dev/sms-outbox': 'public',
  'POST /api/v1/auth/otp/request': 'public',
  'POST /api/v1/auth/otp/verify': 'public',
  'POST /api/v1/auth/refresh': 'public',
  'POST /api/v1/auth/totp/setup': 'public',
  'POST /api/v1/auth/totp/verify': 'public',
  'POST /api/v1/auth/logout': 'authenticated',
  'GET /api/v1/auth/sessions': 'authenticated',
  'DELETE /api/v1/auth/sessions/:id': 'authenticated',
  'GET /api/v1/me': 'authenticated',
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
});
