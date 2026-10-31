// Davet token'ı (F2.1a, faz spesifikasyonu §6.2): 32 bayt rastgele, URL-güvenli (base64url).
// Saklanan yalnızca SHA-256 özeti (`invitations.token_hash`). Token log, audit, outbox ve hata
// mesajına girmez; yalnızca SMS'teki bağlantıda bulunur.
import { createHash, randomBytes } from 'node:crypto';

export interface InvitationToken {
  readonly token: string;
  readonly hash: string;
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateInvitationToken(): InvitationToken {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInvitationToken(token) };
}
