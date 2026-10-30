// Bildirim testleri için ortak kurulum: şablon seed'i, bilinen dilde kullanıcı, sahte ayar,
// kayıt tutan iş kuyruğu ve log. Gerçek PostgreSQL (app_user), migrator yalnızca kurulumda.
import { randomBytes, randomUUID } from 'node:crypto';
import { settingDefault, type SettingValue } from '@b2b/shared';
import { type Mock, vi } from 'vitest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { randomTestPhone } from '../../../../test/users';
import { withUserTx } from '../../../core/db';
import { seedI18n } from '../../i18n';
import type { NotificationLog, PushSettingKey, PushSettingsPort } from '../notification-dispatcher';
import { type NotificationJob, NotificationJobs } from '../notification-jobs';
import { NotificationsRepository } from '../notifications.repository';
import { seedNotifications } from '../seed/notifications.seed';

export async function runNotificationSeed(): Promise<void> {
  const client = await connectAsMigrator();
  try {
    await seedI18n(client);
    await seedNotifications(client);
  } finally {
    await client.end();
  }
}

export interface TestRecipient {
  readonly id: string;
  readonly phone: string;
  readonly fullName: string;
}

/** Bilinen dil, telefon ve adla kullanıcı (AC6: bunların hiçbiri push'ta ve logda olmamalı). */
export async function insertRecipient(language: string | null): Promise<TestRecipient> {
  const recipient = {
    id: randomUUID(),
    phone: randomTestPhone(),
    fullName: `Alıcı ${randomBytes(4).toString('hex')}`,
  };
  const client = await connectAsMigrator();
  try {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    await client.query(
      `insert into users (id, phone_e164, full_name, preferred_language) values ($1, $2, $3, $4)`,
      [recipient.id, recipient.phone, recipient.fullName, language],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
  return recipient;
}

/** Benzersiz Expo biçiminde token. */
export function expoToken(): string {
  return `ExponentPushToken[${randomBytes(11).toString('hex')}]`;
}

/** Token'ı kullanıcıya kaydeder (push_token_register); token satır kimliğini döner. */
export async function registerToken(
  repo: NotificationsRepository,
  userId: string,
  token: string,
  id = randomUUID(),
): Promise<string> {
  await withUserTx({ userId }, (tx) =>
    repo.registerToken(tx, {
      id,
      token,
      platform: 'android',
      now: new Date('2026-10-30T09:00:00Z'),
    }),
  );
  const rows = await withUserTx({ userId }, (tx) => repo.tokens(tx));
  const row = rows.find((item) => item.token === token);
  if (row === undefined) throw new Error('token kaydedilemedi');
  return row.id;
}

export function fakeSettings(
  values: Partial<{ [K in PushSettingKey]: SettingValue<K> }> = {},
): PushSettingsPort {
  return {
    get: <K extends PushSettingKey>(key: K) => Promise.resolve(values[key] ?? settingDefault(key)),
  };
}

export interface RecordedJob {
  readonly job: NotificationJob;
  readonly delayMs: number;
  readonly jobId: string;
}

export class RecordingJobs extends NotificationJobs {
  readonly added: RecordedJob[] = [];

  add(job: NotificationJob, delayMs: number, jobId: string): Promise<void> {
    this.added.push({ job, delayMs, jobId });
    return Promise.resolve();
  }

  /** Eklenen işleri boşaltıp döner. */
  take(): RecordedJob[] {
    return this.added.splice(0);
  }
}

type LogFn = (obj: object, msg: string) => void;

export function fakeLog(): NotificationLog & {
  info: Mock<LogFn>;
  warn: Mock<LogFn>;
  error: Mock<LogFn>;
  text(): string;
} {
  const log = { info: vi.fn<LogFn>(), warn: vi.fn<LogFn>(), error: vi.fn<LogFn>() };
  return {
    ...log,
    text: () =>
      JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls]),
  };
}
