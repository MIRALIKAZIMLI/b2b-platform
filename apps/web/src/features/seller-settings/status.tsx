'use client';
// Ayar kartlarının ortak durum satırları: yükleme hatası (yeniden dene) ve kayıt sonucu.
import { useTranslations } from 'next-intl';
import { Button, Card } from '../ui/primitives';

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('sellerSettings');
  return (
    <Card className="space-y-4 p-8 text-center">
      <p role="alert" className="text-sm text-slate-600">
        {t('load_failed')}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        {t('retry')}
      </Button>
    </Card>
  );
}

export function StatusLine({
  error,
  saved,
  savedText,
}: {
  error: string | undefined;
  saved: boolean;
  savedText: string;
}) {
  if (error !== undefined) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      >
        {error}
      </p>
    );
  }
  if (!saved) return null;
  return (
    <p role="status" className="text-sm font-medium text-emerald-600">
      ✓ {savedText}
    </p>
  );
}
