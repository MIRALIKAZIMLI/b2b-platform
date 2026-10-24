// Ortak ESLint yapılandırması (düz yapılandırma). Kökteki eslint.config.mjs bunu kullanır.
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

const TS_FILES = ['**/*.ts', '**/*.mts', '**/*.tsx'];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'docs/**'],
  },

  eslint.configs.recommended,

  // TypeScript: tip bilgisiyle strict kurallar.
  {
    files: TS_FILES,
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // NestJS modül sınıfları gövdesizdir (@Module({}) class X {}).
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },

  // Yasaklar (AGENTS.md "Yapma" bölümü, coding-guidelines §6, §7, §9).
  {
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CatchClause > BlockStatement[body.length=0]',
          message: 'Boş catch yasak: hatayı ele al veya yeniden fırlat (coding-guidelines §6.4).',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML yasak (coding-guidelines §9.7).',
        },
      ],
    },
  },

  // Modül sınırları (coding-guidelines §3.1): başka bir modüle yalnızca index.ts üzerinden erişilir.
  {
    files: ['apps/api/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        node: { extensions: ['.ts', '.mts', '.js', '.mjs', '.json'] },
      },
      'boundaries/elements': [
        { type: 'api-module', pattern: 'apps/api/src/modules/*' },
        { type: 'api-core', pattern: 'apps/api/src/core/*' },
        { type: 'api-infrastructure', pattern: 'apps/api/src/infrastructure/*' },
      ],
    },
    rules: {
      // Sonraki politika öncekini ezer: modüle dışarıdan erişim yasak, index.ts ve modül içi serbest.
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          message:
            'Başka bir modüle yalnızca index.ts üzerinden erişilir (coding-guidelines §3.1): {{dependency.source}}',
          policies: [
            { disallow: { to: { element: { type: 'api-module' } } } },
            { allow: { to: { element: { type: 'api-module', fileInternalPath: 'index.ts' } } } },
            { allow: { dependency: { relationship: { to: 'internal' } } } },
          ],
        },
      ],
    },
  },

  // JavaScript yapılandırma dosyalarında tip bilgisi kuralları kapalı.
  {
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Biçim kuralları Prettier'a bırakılır.
  prettier,
);
