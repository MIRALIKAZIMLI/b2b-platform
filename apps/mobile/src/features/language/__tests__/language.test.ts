import { createApiClient } from '@b2b/api-client';
import { describe, expect, it, vi } from 'vitest';
import { createLanguageController } from '../language';

const BASE = 'http://mobile.test';

function setup(options: { session: boolean; patchStatus?: number }) {
  const patches: unknown[] = [];
  const fetch = vi.fn(async (request: Request): Promise<Response> => {
    patches.push(await request.json());
    const status = options.patchStatus ?? 200;
    return new Response(JSON.stringify(status === 200 ? {} : { code: 'VALIDATION_FAILED' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  let active = 'az';
  const apply = vi.fn((lang: string) => {
    active = lang;
    return Promise.resolve(true);
  });
  const setApiLanguage = vi.fn();
  const remember = vi.fn(() => Promise.resolve());
  const controller = createLanguageController({
    client: createApiClient({ baseUrl: BASE, fetch }),
    hasSession: () => options.session,
    apply,
    setApiLanguage,
    remember,
  });
  return { controller, patches, apply, setApiLanguage, remember, active: () => active };
}

describe('mobil dil seçimi', () => {
  it('US-058 AC1: az → ru geçişi profile yazılır (PATCH /me) ve arayüz dili değişir', async () => {
    const t = setup({ session: true });
    expect(await t.controller.change('ru')).toEqual({ ok: true });
    expect(t.patches).toEqual([{ preferredLanguage: 'ru' }]);
    expect(t.active()).toBe('ru');
    expect(t.setApiLanguage).toHaveBeenCalledWith('ru');
    expect(t.remember).toHaveBeenCalledWith('ru');
  });

  it('US-058 AC1: profil kaydı başarısızsa dil değişmez', async () => {
    const t = setup({ session: true, patchStatus: 422 });
    expect(await t.controller.change('tr')).toEqual({ ok: false, code: 'VALIDATION_FAILED' });
    expect(t.apply).not.toHaveBeenCalled();
    expect(t.active()).toBe('az');
  });

  it('US-058 AC1: girişten önceki seçim yalnızca cihazda saklanır, profile yazılmaz', async () => {
    const t = setup({ session: false });
    expect(await t.controller.change('tr')).toEqual({ ok: true });
    expect(t.patches).toEqual([]);
    expect(t.remember).toHaveBeenCalledWith('tr');
  });

  it('US-058 AC1: girişte profildeki dil uygulanır, profil değiştirilmez', async () => {
    const t = setup({ session: true });
    await t.controller.applyProfile('ru');
    expect(t.active()).toBe('ru');
    expect(t.patches).toEqual([]);
    expect(await t.controller.applyProfile(null)).toBeUndefined();
    expect(t.active()).toBe('ru');
  });
});
