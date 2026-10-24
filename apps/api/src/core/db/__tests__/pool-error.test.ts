import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { attachPoolErrorHandler } from '../client';

describe('pg havuzu hata olayı', () => {
  it('F1.2-AC9: pool error olayı yakalanır, süreç çökmez, loglanır', async () => {
    // Bağlanılmayan adres: havuz hiç bağlantı açmaz.
    const pool = new Pool({ connectionString: 'postgres://app_user:pool-secret@127.0.0.1:1/x' });
    const messages: string[] = [];
    attachPoolErrorHandler(pool, (message) => {
      messages.push(message);
    });

    const error = Object.assign(new Error('terminating connection: 127.0.0.1:5432 pool-secret'), {
      code: '57P01',
    });
    // Dinleyici olmasaydı EventEmitter 'error' olayını fırlatırdı (süreç çökerdi).
    expect(() => pool.emit('error', error)).not.toThrow();

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('57P01');
    expect(messages[0]).not.toContain('pool-secret');
    expect(messages[0]).not.toContain('127.0.0.1');
    await pool.end();
  });

  it('F1.2-AC9: kodu olmayan hata da yakalanır', async () => {
    const pool = new Pool({ connectionString: 'postgres://app_user:x@127.0.0.1:1/x' });
    const messages: string[] = [];
    attachPoolErrorHandler(pool, (message) => {
      messages.push(message);
    });

    expect(() => pool.emit('error', new Error('bağlantı koptu'))).not.toThrow();
    expect(messages[0]).toContain('unknown');
    await pool.end();
  });
});
