import type { ReactNode } from 'react';

// Kök layout. Dil doğrulaması ve çeviriler F1.13'te (next-intl) gelir.
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
