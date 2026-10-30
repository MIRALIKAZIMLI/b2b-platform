import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** API taban adresi (sunucu tarafı). Tarayıcı API'yi aynı kökenden `/api/v1/*` ile çağırır. */
const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@b2b/api-client'],
  // Aynı köken: yenileme cookie'si (`Path=/api/v1/auth`, `Domain` yok) web host'unda kalır,
  // CORS gerekmez (F1.13a, kart emin olunmayan nokta 2).
  rewrites() {
    return Promise.resolve([{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }]);
  },
};

export default withNextIntl(nextConfig);
