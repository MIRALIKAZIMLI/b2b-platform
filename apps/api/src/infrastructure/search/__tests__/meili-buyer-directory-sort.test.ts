// F2.18 (US-015 AC2): dizinde doğrulanmış perakendeci üstte (birim; sunucu davranışı
// meili-buyer-directory-index.int.test.ts'te CI'da).
import { describe, expect, it } from 'vitest';
import { BUYER_DIRECTORY_SETTINGS, buyerDirectorySort } from '../meili-buyer-directory-index';

describe('buyer_directory sıralaması (F2.18)', () => {
  it('US-015 AC2: sorgusuz listede önce rozet, sonra ünvan; aramada rozet eşitlik bozucu', () => {
    expect(buyerDirectorySort(undefined)).toEqual(['verifiedRank:desc', 'legalName:asc']);
    expect(buyerDirectorySort('market')).toEqual(['verifiedRank:desc']);
    expect(BUYER_DIRECTORY_SETTINGS.sortableAttributes).toContain('verifiedRank');
  });
});
