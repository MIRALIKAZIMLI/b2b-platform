import { describe, expect, it } from 'vitest';
import { fromDecimalString } from '../../../core/money';
import { requiresBranchApproval } from '../branch-approval';

const m = fromDecimalString;

describe('requiresBranchApproval (US-010 AC2)', () => {
  it('US-010-AC2 above_amount: eşiğin altı doğrudan gönderilir, üstü onaya düşer', () => {
    expect(requiresBranchApproval('above_amount', m('500.00'), m('499.99'))).toBe(false);
    expect(requiresBranchApproval('above_amount', m('500.00'), m('500.01'))).toBe(true);
    expect(requiresBranchApproval('above_amount', m('500'), m('120.5'))).toBe(false);
  });

  it('US-010-AC2 every_order her zaman, none hiçbir zaman onaya düşer', () => {
    expect(requiresBranchApproval('every_order', null, m('0.01'))).toBe(true);
    expect(requiresBranchApproval('none', null, m('999999.99'))).toBe(false);
  });

  it('US-010-AC2 above_amount eşiksiz gelirse güvenli taraf: onaya düşer', () => {
    expect(requiresBranchApproval('above_amount', null, m('1'))).toBe(true);
  });
});
