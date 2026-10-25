import { describe, expect, it } from 'vitest';
import { AUDIT_MASK, MASKED_AUDIT_FIELDS, maskAuditValue } from '../audit-mask';

describe('maskAuditValue (birim)', () => {
  it('F1.9-AC2: before/after içindeki phone_e164, contact_name maskeli', () => {
    const before = { phone_e164: '+994501234567', contact_name: 'Əli Məmmədov', status: 'active' };

    expect(maskAuditValue(before)).toEqual({
      phone_e164: AUDIT_MASK,
      contact_name: AUDIT_MASK,
      status: 'active',
    });
  });

  it('F1.9-AC2: data-model §5 listesindeki 6 alanın her biri maskelenir', () => {
    expect(MASKED_AUDIT_FIELDS).toEqual([
      'phone_e164',
      'full_name',
      'contact_name',
      'personal_phone',
      'email',
      'delivery_snapshot',
    ]);
    for (const field of MASKED_AUDIT_FIELDS) {
      expect(maskAuditValue({ [field]: 'gizli', other: 1 }), field).toEqual({
        [field]: AUDIT_MASK,
        other: 1,
      });
    }
  });

  it('F1.9-AC2: nesne değerli alan (delivery_snapshot) tümüyle maskelenir', () => {
    const value = { delivery_snapshot: { address: 'Bakı', contact_name: 'X', phone_e164: '+994' } };

    expect(maskAuditValue(value)).toEqual({ delivery_snapshot: AUDIT_MASK });
  });

  it('F1.9-AC2: iç içe nesne ve dizilerde de maskelenir', () => {
    const value = {
      person: { full_name: 'Ad Soyad', email: 'a@b.az' },
      contacts: [{ personal_phone: '+994551112233', role: 'owner' }],
    };

    expect(maskAuditValue(value)).toEqual({
      person: { full_name: AUDIT_MASK, email: AUDIT_MASK },
      contacts: [{ personal_phone: AUDIT_MASK, role: 'owner' }],
    });
  });

  it('F1.9-AC2: girdi değiştirilmez; ilkel değer ve null aynen döner', () => {
    const input = { email: 'a@b.az' };

    maskAuditValue(input);

    expect(input).toEqual({ email: 'a@b.az' });
    expect(maskAuditValue(42)).toBe(42);
    expect(maskAuditValue('metin')).toBe('metin');
    expect(maskAuditValue(null)).toBeNull();
    expect(maskAuditValue([1, 2])).toEqual([1, 2]);
  });
});
