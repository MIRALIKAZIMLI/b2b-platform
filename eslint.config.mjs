import config from '@b2b/config/eslint';

export default [
  ...config,
  // Üretilmiş dosya (pnpm generate:api); elle düzenlenmez, lint edilmez.
  { ignores: ['packages/api-client/src/schema.d.ts'] },
];
