import { describe, expect, it } from 'vitest';
import { assertBootstrapAllowed } from '../bootstrap-env';

describe('db:bootstrap ortam kontrolü', () => {
  it('APP_ENV yoksa hata verir', () => {
    expect(() => {
      assertBootstrapAllowed({});
    }).toThrow(/APP_ENV/);
    expect(() => {
      assertBootstrapAllowed({ APP_ENV: '' });
    }).toThrow(/APP_ENV/);
  });

  it('staging ve production reddedilir', () => {
    expect(() => {
      assertBootstrapAllowed({ APP_ENV: 'staging' });
    }).toThrow(/local ve test/);
    expect(() => {
      assertBootstrapAllowed({ APP_ENV: 'production' });
    }).toThrow(/local ve test/);
  });

  it('local ve test kabul edilir', () => {
    expect(() => {
      assertBootstrapAllowed({ APP_ENV: 'local' });
    }).not.toThrow();
    expect(() => {
      assertBootstrapAllowed({ APP_ENV: 'test' });
    }).not.toThrow();
  });
});
