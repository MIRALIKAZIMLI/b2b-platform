# Teknoloji Yığını

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-24 |
| İlgili belgeler | [ADR-0002](../04-decisions/adr-0002-typescript-full-stack.md) · [design-doc.md](../03-architecture/design-doc.md) · [coding-guidelines.md](coding-guidelines.md) |

Bu liste **kapalı bir listedir**. AI asistanı burada olmayan bir paketi eklemek isterse durur ve platform sahibine sorar (gerekçe, alternatif, bakım durumu). Onaylanan paket bu listeye eklenir.

**Sürüm politikası:** Tablodaki sürümler ana sürüm hedefleridir. Kesin sürümler F0.3 adımında, o günün kararlı sürümleriyle `package.json` dosyasına **sabit** (`^` veya `~` olmadan) yazılır ve `pnpm-lock.yaml` depoya eklenir. Ana sürüm yükseltmesi ayrı bir pull request'te yapılır.

📌 VARSAYIM: Ana sürüm numaraları bu belgenin yazıldığı tarihteki bilgiye dayanır. F0.3 adımında her paketin güncel kararlı ana sürümü kontrol edilip tablo güncellenir.

## 1. Çalışma ortamı ve araçlar

| Katman | Teknoloji | Sürüm hedefi | Not |
| --- | --- | --- | --- |
| Çalışma ortamı | Node.js | Aktif LTS (24.x) | `.nvmrc` ve `engines` ile sabitlenir |
| Dil | TypeScript | 5.x | `strict: true`, `noUncheckedIndexedAccess: true`; Node tipleri `@types/node` (Node ana sürümüyle aynı, 24.x) |
| Paket yöneticisi | pnpm | 10.x | Workspace (monorepo); `--frozen-lockfile` CI'da |
| Container | Docker + Docker Compose | Güncel | Yerel, staging, production |
| Ters vekil | Caddy | 2.x | Production ve staging |
| Kod deposu ve CI | GitHub + GitHub Actions | — | [environments-cicd.md](../06-operations/environments-cicd.md) |
| Container kayıt | GitHub Container Registry | — | Özel |

## 2. Backend (`apps/api`)

| Amaç | Paket | Sürüm hedefi |
| --- | --- | --- |
| Framework | `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify` | 11.x |
| HTTP adaptörü | Fastify (NestJS üzerinden) | 5.x |
| NestJS zorunlu peer bağımlılıkları | `reflect-metadata`, `rxjs` | 0.2.x, 7.x |
| Veritabanı sürücüsü | `pg` (node-postgres) | 8.x |
| `pg` TypeScript tipleri | `@types/pg` | `pg` ile aynı (8.x); platform sahibi onayı F1.1a, 2026-10-24 |
| ORM ve migration | `drizzle-orm`, `drizzle-kit` | Güncel kararlı |
| Doğrulama ve DTO | `zod` | 4.x |
| OpenAPI üretimi | `@nestjs/swagger` + Zod → OpenAPI dönüştürücüsü | — |
| Kuyruk | `bullmq`, `@nestjs/bullmq` | 5.x |
| Redis istemcisi | `ioredis` | 5.x |
| Arama istemcisi | `meilisearch` | Sunucu sürümüyle uyumlu |
| JWT | `jose` | 6.x |
| TOTP | `otplib` | 12.x |
| Telefon doğrulama | `libphonenumber-js` | 1.x |
| Para hesabı | `decimal.js` | 10.x |
| Tarih / saat dilimi | `date-fns` + `@date-fns/tz` | 4.x |
| Log | `pino`, `nestjs-pino` | 9.x |
| `nestjs-pino` zorunlu peer bağımlılığı | `pino-http` | 10.x; platform sahibi onayı F1.2a, 2026-10-24 |
| Hata izleme | `@sentry/node` | Güncel |
| Dosya (R2, S3 uyumlu) | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | 3.x |
| Görsel küçültme | `sharp` | Güncel |
| Excel okuma/yazma | `exceljs` | 4.x |
| PDF üretimi | `pdfkit` + Noto Sans yazı tipi (Latin, Kiril, Azerbaycan harfleri) | Güncel |
| Push | `expo-server-sdk` | Güncel |
| Hız sınırı | `@nestjs/throttler` + Redis deposu | Güncel |

## 3. Web (`apps/web`)

| Amaç | Paket | Sürüm hedefi |
| --- | --- | --- |
| Framework | `next`, `react`, `react-dom` | Next.js güncel kararlı ana sürüm (App Router), React 19 |
| React tipleri | `@types/react`, `@types/react-dom` | React ile aynı (19.x) |
| Sunucu durumu | `@tanstack/react-query` | 5.x |
| Formlar | `react-hook-form` + `@hookform/resolvers` (Zod) | 7.x |
| Stil | `tailwindcss` | 4.x |
| Bileşenler | shadcn/ui (Radix UI tabanlı; kod depoya kopyalanır) | — |
| Çok dillilik | `next-intl` | Güncel |
| API istemcisi | `openapi-fetch` + `openapi-typescript` (üretim) | Güncel |
| Tablo | `@tanstack/react-table` | 8.x |

## 4. Mobil (`apps/mobile`)

| Amaç | Paket | Sürüm hedefi |
| --- | --- | --- |
| Framework | `expo`, `react-native` | Güncel Expo SDK |
| Yönlendirme | `expo-router` | Expo SDK ile |
| `expo-router` zorunlu peer bağımlılıkları | `react-native-screens`, `react-native-safe-area-context`, `expo-linking`, `expo-constants`, `@expo/metro-runtime` | Expo SDK ile (`bundledNativeModules.json`) |
| React tipleri | `@types/react` | React ile aynı (19.x) |
| Sunucu durumu | `@tanstack/react-query` | 5.x |
| Formlar | `react-hook-form` + Zod | 7.x |
| Çok dillilik | `i18next`, `react-i18next` | Güncel |
| Güvenli depo | `expo-secure-store` | Expo SDK ile |
| Push | `expo-notifications` | Expo SDK ile |
| Konum | `expo-location` | Expo SDK ile |
| Kamera ve barkod | `expo-camera` | Expo SDK ile |
| Fotoğraf seçimi | `expo-image-picker` | Expo SDK ile |
| OTA güncelleme | `expo-updates` | Expo SDK ile |
| Hata izleme | `@sentry/react-native` | Güncel |
| API istemcisi | `openapi-fetch` (web ile aynı üretilmiş tipler) | Güncel |

## 5. Paylaşılan paketler

| Paket | İçerik |
| --- | --- |
| `packages/shared` | Zod şemaları (ortak), hata kodları, izin kodları, ayar anahtarları ve varsayılanları, para ve zaman yardımcıları, `env.ts` |
| `packages/api-client` | `openapi.yaml`'dan üretilen tipler ve istemci; elle düzenlenmez |
| `packages/ui` | Yalnızca web bileşenleri |
| `packages/config` | ESLint, TypeScript, Prettier ortak yapılandırmaları |

## 6. Veri ve altyapı servisleri

| Servis | Sürüm |
| --- | --- |
| PostgreSQL | 16 |
| Redis | 7 |
| Meilisearch | 1.x |
| MinIO (yalnızca yerel, R2 yerine) | ⚠️ Açık karar — 2026-10-24 itibarıyla MinIO'nun açık Docker imajı yok (Docker Hub `minio/minio` kaldırılmış). F0.3a'da compose'a eklenmedi; yerel depolama karşılığı, dosya yükleme adımından önce ayrı kararla seçilir. |

## 7. Test ve kalite

| Amaç | Araç |
| --- | --- |
| Birim ve entegrasyon testi | `vitest`, `supertest`, `@types/supertest`, `@nestjs/testing` (Nest test modülü) |
| Kapsam ölçümü | `@vitest/coverage-v8` (`vitest` ile aynı sürüm); `pnpm test:coverage`, CI'da rapor yazdırılır, eşik F1.5a'da. Platform sahibi onayı F1.2a, 2026-10-24 |
| Test veritabanı | CI servis container'ları; yerelde `@testcontainers/postgresql` |
| Web uçtan uca | `@playwright/test` |
| Mobil uçtan uca | Maestro |
| Yük testi | k6 |
| Lint | `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-boundaries` (modül sınırları), `eslint-config-prettier` (Prettier ile çakışan kuralları kapatır) |
| Biçim | `prettier` |
| Gizli bilgi taraması | gitleaks |
| Bağımlılık taraması | `pnpm audit` |

## 7.1 Kurulu sürümler (F0.3a, 2026-10-24)

Kesin sürümler `package.json` dosyalarında sabittir; bu tablo onların özetidir. Sürüm kontrolü: `npm view <paket>@<ana sürüm> version`.

| Paket / araç | Kurulu sürüm | Not |
| --- | --- | --- |
| Node.js | 24 (`.nvmrc`), `engines: >=24 <25` | Yerelde 24.21.0 ile denendi |
| pnpm | 10.34.8 (`packageManager`) | 12.x mevcut; ana sürüm yükseltmesi ayrı PR |
| `typescript` | 5.9.3 | 7.x mevcut; `typescript-eslint` 8.72 en çok TS < 6.1 destekliyor |
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify`, `@nestjs/testing` | 11.2.8 | 12.x mevcut; ana sürüm yükseltmesi ayrı PR |
| `fastify` | 5.12.7 | `pnpm.overrides` ile; `@nestjs/platform-fastify` 11.2.8 açıklı 5.11.3'ü sabitliyordu (`pnpm audit` yüksek) |
| `reflect-metadata` | 0.2.2 | |
| `rxjs` | 7.8.2 | |
| `vitest` | 4.1.12 | 5.x, `vite`'ı ayrı zorunlu peer bağımlılık olarak istiyor; 4.x kendi içinde getiriyor |
| `supertest` / `@types/supertest` | 7.3.1 / 7.2.1 | |
| `@types/node` | 24.19.2 | |
| `eslint` / `@eslint/js` | 10.13.0 / 10.0.1 | |
| `typescript-eslint` | 8.72.0 | |
| `eslint-plugin-boundaries` | 7.3.0 | `boundaries/dependencies` kuralı (eski `entry-point` kullanımdan kalktı) |
| `eslint-config-prettier` | 10.1.8 | |
| `prettier` | 3.9.10 | |
| PostgreSQL imajı | `postgres:16.15-alpine` | |
| Redis imajı | `redis:7.4.11-alpine` | |
| Meilisearch imajı | `getmeili/meilisearch:v1.55.0` | |
| MinIO imajı | — | Eklenmedi, bkz. §6 |
| gitleaks (CI) | `ghcr.io/gitleaks/gitleaks:v8.30.1` | |
| GitHub Actions | `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `pnpm/action-setup` v6.1.0 | Commit SHA ile sabit |

## 7.2 Kurulu sürümler (F0.3b, 2026-10-24)

Web ve mobil aynı React sürümünü kullanır: Expo SDK 58 `react` 19.3.0'ı sabitler (npm `latest` 19.3.1), web de 19.3.0'da tutulur.

| Paket / araç | Kurulu sürüm | Not |
| --- | --- | --- |
| `next` | 16.4.3 | App Router, Turbopack; `next lint` 16'da kaldırıldı, lint kökteki ESLint ile |
| `react`, `react-dom` | 19.3.0 | Expo SDK 58 ile aynı |
| `@types/react`, `@types/react-dom` | 19.3.0 / 19.3.0 | |
| `expo` | 58.0.19 | SDK 58; Expo Go SDK 58 |
| `react-native` | 0.88.0 | Expo SDK 58 `bundledNativeModules.json` |
| `expo-router` | 58.0.26 | |
| `expo-linking` / `expo-constants` / `@expo/metro-runtime` | 58.0.14 / 58.0.13 / 58.0.15 | `expo-router` peer |
| `react-native-screens` / `react-native-safe-area-context` | 4.30.0 / 5.10.1 | `expo-router` peer |
| `pnpm audit` istisnaları | GHSA-86w9-cpqp-85rv, GHSA-mrhx-c7xc-m3w5 | `@expo/cli` üzerinden; bkz. [environments-cicd.md](../06-operations/environments-cicd.md) §3 |

Eklenmeyenler (ayrı karar): `@next/eslint-plugin-next`, `eslint-plugin-react-hooks` (listede yok), `react-native-web` (mobil web hedefi yok), `expo-status-bar`.

## 7.3 Kurulu sürümler (F1.1a, 2026-10-24)

| Paket / araç | Kurulu sürüm | Not |
| --- | --- | --- |
| `pg` | 8.23.1 | api |
| `@types/pg` | 8.23.1 | api (dev); `drizzle-orm` peer bağımlılığı |
| `drizzle-orm` | 0.45.4 | api; npm `latest` (1.0 henüz rc) |
| `drizzle-kit` | 0.31.11 | api (dev); migration üretimi |
| `zod` | 4.6.7 | shared (`env.ts`) |
| `@testcontainers/postgresql` | 12.2.1 | api (dev); yerelde test veritabanı (Docker gerekir) |

## 7.4 Kurulu sürümler (F1.2a, 2026-10-24)

| Paket / araç | Kurulu sürüm | Not |
| --- | --- | --- |
| `decimal.js` | 10.6.0 | api (`core/money.ts`) |
| `pino` | 9.14.0 | api; `fastify` kendi içinde `pino` 10.x getirir, uygulama logu 9.x |
| `nestjs-pino` | 4.6.1 | api |
| `pino-http` | 10.5.0 | api; `nestjs-pino` zorunlu peer |
| `zod` | 4.6.7 | api (hata filtresi `ZodError`); shared ile aynı sürüm |
| `@vitest/coverage-v8` | 4.1.12 | kök (dev) |

Eklenmeyenler: `pino-pretty` (listede yok), `unplugin-swc` / `@swc/core` (Nest bağımlılıkları `@Inject()` ile açık yazılır).

## 7.5 Kurulu sürümler (F1.4a, 2026-10-24)

| Paket / araç | Kurulu sürüm | Not |
| --- | --- | --- |
| `ioredis` | 5.11.1 | api (`infrastructure/redis`; ayar önbelleği, F1.2b'de BullMQ) |

Eklenmeyenler: `@testcontainers/redis` (Redis entegrasyon testi docker compose / CI servisiyle ve rastgele anahtar önekiyle çalışır).

## 8. Kullanılmayacak teknolojiler

| Kullanılmaz | Yerine | Neden |
| --- | --- | --- |
| Prisma, TypeORM, Sequelize | Drizzle | ADR-0005 |
| GraphQL, tRPC | REST + OpenAPI | ADR-0022 |
| MongoDB veya başka NoSQL ana veritabanı | PostgreSQL | İlişkisel ve işlemsel veri |
| Mikroservis, Kubernetes, serverless fonksiyonlar | Modüler monolit, Docker Compose | ADR-0001 |
| `class-validator`, `class-transformer` | Zod | Tek doğrulama dili (istemci + sunucu) |
| Redux, MobX, Zustand (sunucu verisi için) | React Query | Sunucu durumu önbelleği; yerel UI durumu için React state yeterli |
| `axios` | `fetch` / `openapi-fetch` | Ek bağımlılık gerekmez |
| `moment`, `moment-timezone` | `date-fns` + `@date-fns/tz` | Bakımı bitmiş |
| `number` ile para hesabı, `float` / `double precision` kolon | `decimal.js`, `numeric` | Yuvarlama hataları |
| `lodash` (tüm paket) | Yerel JavaScript | Gereksiz bağımlılık |
| Firebase (veritabanı, auth) | PostgreSQL, kendi kimlik modülü | Veri ve maliyet kontrolü |
| AWS RDS, ECS, NAT gateway, ALB (pilotta) | Lightsail | ADR-0012, bütçe |
| WhatsApp, SMS bildirim kanalı (MVP'de) | Push | D18 |
| Ödeme SDK'ları (MVP'de) | — | ADR-0017 |
