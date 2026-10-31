import type { Metadata } from 'next';
import { ActivateView } from '../../../../features/activation/activate-view';

/**
 * Toptancı aktivasyonu (F2.1b, US-009 AC2–AC3). Adreste davet token'ı olduğu için sayfa başka
 * siteye referrer göndermez: yanıt başlığı (`next.config.ts`) ve meta etiketi `no-referrer`.
 */
export const metadata: Metadata = { referrer: 'no-referrer' };

export default function ActivatePage() {
  return (
    <main>
      <ActivateView />
    </main>
  );
}
