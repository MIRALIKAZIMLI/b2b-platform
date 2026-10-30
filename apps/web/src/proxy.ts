import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Dil öneki olmayan sayfa adresini `/<dil>/...` adresine yönlendirir (next-intl).
export default createMiddleware(routing);

export const config = {
  // API (Next rewrite ile backend'e gider), Next iç dosyaları ve uzantılı dosyalar hariç.
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
