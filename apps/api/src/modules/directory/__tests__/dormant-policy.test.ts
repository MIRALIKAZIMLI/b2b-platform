// F2.17 bağlantısız hesap aşama kuralı (saf; US-027 AC1–AC4, kart K2–K3).
import { describe, expect, it } from 'vitest';
import {
  type DormantSettings,
  type DormantState,
  dormantMinScanDays,
  dormantWarningLeadDays,
  nextDormantStep,
} from '../jobs/dormant-policy';

const DAY = 24 * 60 * 60 * 1000;
const SINCE = new Date('2026-01-01T10:00:00Z');
const SETTINGS: DormantSettings = {
  reminderDays: [7, 30],
  warningDay: 90,
  deactivateDay: 120,
  deleteDay: 180,
};

function at(days: number): Date {
  return new Date(SINCE.getTime() + days * DAY);
}

function state(partial: Partial<DormantState>): DormantState {
  return { status: 'active', stage: 'none', stageAt: null, since: SINCE, ...partial };
}

describe('F2.17 dormant-policy', () => {
  it('US-027-AC1 7. gün dolmadan adım yok; tam 7 × 24 saatte ilk hatırlatma', () => {
    expect(nextDormantStep(state({}), SETTINGS, new Date(at(7).getTime() - 1))).toBeUndefined();
    expect(nextDormantStep(state({}), SETTINGS, at(7))).toBe('reminded_7');
  });

  it('US-027-AC1 30. günde ikinci hatırlatma; aynı aşama tekrar gelmez', () => {
    const reminded = state({ stage: 'reminded_7', stageAt: at(7) });
    expect(nextDormantStep(reminded, SETTINGS, at(29))).toBeUndefined();
    expect(nextDormantStep(reminded, SETTINGS, at(30))).toBe('reminded_30');
    const second = state({ stage: 'reminded_30', stageAt: at(30) });
    expect(nextDormantStep(second, SETTINGS, at(89))).toBeUndefined();
  });

  it('US-027-AC2 90. günde uyarı; K3 kaçırılan gecede eski hatırlatma atlanır', () => {
    expect(
      nextDormantStep(state({ stage: 'reminded_30', stageAt: at(30) }), SETTINGS, at(90)),
    ).toBe('warned');
    // 40. güne dek iş çalışmadıysa yalnız ikinci hatırlatma gider.
    expect(nextDormantStep(state({}), SETTINGS, at(40))).toBe('reminded_30');
    // 95. günde hiç hatırlatma almamış hesap doğrudan uyarı alır.
    expect(nextDormantStep(state({}), SETTINGS, at(95))).toBe('warned');
  });

  it('US-027-AC3 120. günde pasifleşme yalnız uyarıdan en az 30 gün sonra', () => {
    const warned = state({ stage: 'warned', stageAt: at(90) });
    expect(nextDormantStep(warned, SETTINGS, at(119))).toBeUndefined();
    expect(nextDormantStep(warned, SETTINGS, at(120))).toBe('deactivated');
    // Uyarı geç gittiyse (130. gün) söz verilen 30 gün beklenir.
    const lateWarned = state({ stage: 'warned', stageAt: at(130) });
    expect(nextDormantStep(lateWarned, SETTINGS, at(159))).toBeUndefined();
    expect(nextDormantStep(lateWarned, SETTINGS, at(160))).toBe('deactivated');
  });

  it('US-027-AC4 180. günde arşiv yalnız pasifleşmeden ve aradaki fark kadar sonra', () => {
    const deactivated = state({ status: 'dormant', stage: 'deactivated', stageAt: at(120) });
    expect(nextDormantStep(deactivated, SETTINGS, at(179))).toBeUndefined();
    expect(nextDormantStep(deactivated, SETTINGS, at(180))).toBe('archive');
    const late = state({ status: 'dormant', stage: 'deactivated', stageAt: at(170) });
    expect(nextDormantStep(late, SETTINGS, at(200))).toBeUndefined();
    expect(nextDormantStep(late, SETTINGS, at(230))).toBe('archive');
  });

  it('tutarsız durumda adım yok (uyarı aşaması ama işletme dormant; pasif aşama ama active)', () => {
    expect(
      nextDormantStep(
        state({ status: 'dormant', stage: 'warned', stageAt: at(90) }),
        SETTINGS,
        at(200),
      ),
    ).toBeUndefined();
    expect(
      nextDormantStep(state({ stage: 'deactivated', stageAt: at(120) }), SETTINGS, at(400)),
    ).toBeUndefined();
  });

  it('tek hatırlatma ayarında yalnız reminded_7; tarama alt sınırı ilk hatırlatma', () => {
    const one: DormantSettings = { ...SETTINGS, reminderDays: [10] };
    expect(nextDormantStep(state({}), one, at(50))).toBe('reminded_7');
    expect(
      nextDormantStep(state({ stage: 'reminded_7', stageAt: at(10) }), one, at(50)),
    ).toBeUndefined();
    expect(dormantMinScanDays(one)).toBe(10);
    expect(dormantMinScanDays(SETTINGS)).toBe(7);
    expect(dormantWarningLeadDays(SETTINGS)).toBe(30);
  });
});
