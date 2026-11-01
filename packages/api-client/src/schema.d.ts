/**
 * ÜRETİLDİ — elle düzenleme.
 * Kaynak: docs/03-architecture/api/openapi.yaml · Yeniden üretmek için: pnpm generate:api
 */

export interface paths {
    "/api/v1/auth/otp/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** OTP kodu iste (US-001) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        phone: components["schemas"]["PhoneE164"];
                        /** @enum {string} */
                        purpose: "login" | "register" | "invitation";
                    };
                };
            };
            responses: {
                /** @description Kod gönderildi */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            challengeId: string;
                            /** Format: date-time */
                            expiresAt: string;
                        };
                    };
                };
                429: components["responses"]["Error"];
                503: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/otp/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** OTP kodunu doğrula ve oturum aç (US-001) */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /** @description `web` → yenileme anahtarı yanıt gövdesinde dönmez, `b2b_rt` httpOnly cookie'sine yazılır (ADR-0006 madde 3, TM-04; F1.13a). Mobil başlığı göndermez; davranışı değişmez. */
                    "X-Client"?: components["parameters"]["XClient"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        challengeId: string;
                        code: string;
                        device?: components["schemas"]["DeviceInfo"];
                    };
                };
            };
            responses: {
                /** @description Doğrulandı. Web'de `refreshToken` gövdede yok, cookie'de. */
                200: {
                    headers: {
                        "Set-Cookie": components["headers"]["SetRefreshCookie"];
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AuthResult"];
                    };
                };
                400: components["responses"]["Error"];
                403: components["responses"]["Error"];
                423: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/totp/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** TOTP ikinci adımı (US-002) */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /** @description `web` → yenileme anahtarı yanıt gövdesinde dönmez, `b2b_rt` httpOnly cookie'sine yazılır (ADR-0006 madde 3, TM-04; F1.13a). Mobil başlığı göndermez; davranışı değişmez. */
                    "X-Client"?: components["parameters"]["XClient"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description otp/verify yanıtındaki ön oturum anahtarı (nextStep = totp) */
                        pendingToken: string;
                        /** @description 6 haneli TOTP kodu veya kurtarma kodu (XXXXX-XXXXX, bir kez kullanılır; F1.6). Aynı TOTP kodu ikinci kez kabul edilmez. */
                        code: string;
                        device?: components["schemas"]["DeviceInfo"];
                    };
                };
            };
            responses: {
                /** @description Doğrulandı, oturum açıldı (nextStep = none). Web'de `refreshToken` cookie'de. */
                200: {
                    headers: {
                        "Set-Cookie": components["headers"]["SetRefreshCookie"];
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AuthResult"];
                    };
                };
                401: components["responses"]["Error"];
                423: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/totp/setup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * TOTP kurulumu başlat / tamamla (US-002)
         * @description Yetki Authorization Bearer ile: ön oturum anahtarı (otp/verify yanıtındaki pendingToken, nextStep = totp_setup; F1.6). confirmCode boşsa yeni sır üretilir ve otpauthUri döner; doluysa kod doğrulanır, kurulum etkinleşir ve 10 kurtarma kodu yalnızca bu yanıtta bir kez döner. Kurulu kullanıcı için 409 INVALID_STATE_TRANSITION.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Boşsa kurulum başlatılır */
                        confirmCode?: string;
                    };
                };
            };
            responses: {
                /** @description Kurulum bilgisi veya kurtarma kodları */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            otpauthUri?: string;
                            recoveryCodes?: string[];
                        };
                    };
                };
                400: components["responses"]["Error"];
                401: components["responses"]["Error"];
                409: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Erişim anahtarını yenile (yenileme anahtarı döndürülür)
         * @description Gövdedeki `refreshToken` (mobil) önceliklidir. Gövdede yoksa `b2b_rt` cookie'si okunur (web); bu durumda `X-Requested-With` zorunludur, yoksa anahtar tüketilmeden `401 UNAUTHENTICATED` (TM-21). Cookie ile yenilemede yeni anahtar yine cookie'ye yazılır ve gövdede dönmez; yenileme başarısızsa cookie silinir (F1.13a).
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /** @description `web` → yenileme anahtarı yanıt gövdesinde dönmez, `b2b_rt` httpOnly cookie'sine yazılır (ADR-0006 madde 3, TM-04; F1.13a). Mobil başlığı göndermez; davranışı değişmez. */
                    "X-Client"?: components["parameters"]["XClient"];
                    /** @description Cookie ile yenilemede zorunlu (boş olmayan herhangi bir değer; web `fetch` gönderir); yoksa anahtar tüketilmeden `401 UNAUTHENTICATED` (CSRF, TM-21; F1.13a). */
                    "X-Requested-With"?: components["parameters"]["XRequestedWith"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Mobil. Web'de httpOnly cookie kullanılır. */
                        refreshToken?: string;
                    };
                };
            };
            responses: {
                /** @description Yeni anahtarlar */
                200: {
                    headers: {
                        "Set-Cookie": components["headers"]["SetRefreshCookie"];
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TokenPair"];
                    };
                };
                401: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Bu oturumdan çıkış
         * @description Oturum ailesi kapatılır; web cookie'si (`b2b_rt`) her durumda silinir (F1.13a).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Çıkış yapıldı */
                204: {
                    headers: {
                        "Set-Cookie": components["headers"]["SetRefreshCookie"];
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Açık oturumlarım (US-004) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Oturumlar */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Session"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/sessions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Bir oturumu kapat (US-004) */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Kapatıldı */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kullanıcı, üyelikler ve aktif işletmedeki izinler */
        get: {
            parameters: {
                query?: never;
                header?: {
                    "X-Business-Id"?: components["parameters"]["BusinessIdOptional"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Profil */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Me"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Ad, dil, saat dilimi güncelle
         * @description Yalnızca verilen alanlar değişir. `preferredLanguage` etkin bir dil olmalıdır (US-058 AC1, AC4); pasif dil veya geçersiz saat dilimi `422 VALIDATION_FAILED` (F1.13a).
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        fullName?: string;
                        preferredLanguage?: components["schemas"]["LanguageCode"];
                        /** @example Asia/Baku */
                        timezone?: string;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/buyers/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Perakendeci self-servis kaydı (US-005)
         * @description Kimliksiz uç; yetki `Authorization: Bearer <pendingToken>` ile (otp/verify yanıtında `nextStep = register`; F2.3a K5). Erişim anahtarı veya TOTP ön oturumu kabul edilmez → `401`. Tek işlemde kullanıcı, işletme (`created_via = self_signup`), `buyer` yeteneği (`approved`), perakendeci profili, gizlilik (hepsi kapalı), varsayılan şube (`approval_rule = every_order`, adres boş), işletme admini rolü ve üyeliği, `onboarding.buyer_plan_code` planıyla abonelik ve `buyer.registered` olayı yazılır (R15). Para birimi ve saat dilimi bölgenin ülkesinden; dil `preferredLanguage` veya platform varsayılanı. `consentVersion` güncel veri paylaşım metni sürümü (`legal.data_sharing_version`) olmalı, aksi `422` (`consentVersion: outdated`); onay sürümü ve zamanı işletmeye yazılır (NFR-63). Bilinmeyen bölge, pasif faaliyet türü veya pasif dil `422` (`<alan>: not_found`). Telefon zaten kayıtlıysa `409 PHONE_ALREADY_REGISTERED` (US-005 AC4; istemci girişe yönlendirir). İdempotens kapsamı kayıt anahtarındaki telefondur (R13): aynı `Idempotency-Key` ve aynı gövde saklanan 201 gövdesini döner (oturum alanları olmadan); aynı anahtar farklı gövde `409 IDEMPOTENCY_CONFLICT`. Eşzamanlı ikinci istek ilkinin bitmesini bekler ve aynı yanıtı alır. Yanıt kayıtla aynı işlemde saklanır (R12). Kayıt anahtarı fiilen tek kullanımlıktır. İlk başarılı yanıtta oturum açılır (K6): `accessToken`, `expiresIn` ve mobilde `refreshToken`; `X-Client: web` ise yenileme anahtarı httpOnly cookie'de. IP başına saatte `buyer_registration.ip_max_per_hour` istek; aşılırsa `429 RATE_LIMITED` (`Retry-After`).
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                    "X-Client"?: "web";
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        fullName: string;
                        legalName: string;
                        /** Format: uuid */
                        activityTypeId: string;
                        /** Format: uuid */
                        regionId: string;
                        /** @example v1 */
                        consentVersion: string;
                        preferredLanguage?: components["schemas"]["LanguageCode"];
                        device?: components["schemas"]["DeviceInfo"];
                    };
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            businessId: string;
                            profileCompleteness: number;
                            /** @description Yalnızca ilk başarılı yanıtta */
                            accessToken?: string;
                            /** @description saniye */
                            expiresIn?: number;
                            /** @description Yalnızca mobil */
                            refreshToken?: string;
                        };
                    };
                };
                401: components["responses"]["Error"];
                409: components["responses"]["Error"];
                422: components["responses"]["Error"];
                429: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/seller-applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Toptancı başvuru formu (US-008)
         * @description Kimliksiz. Başvuru `pending` durumunda kaydedilir ve admin başvuru listesine düşer (US-008 AC1). IP başına saatte `seller_application.ip_max_per_hour` başvuru; aşılırsa `429 RATE_LIMITED` (`details.retryAfter`, `Retry-After`). Aynı VÖEN ile `pending` başvuru varsa `409 SELLER_APPLICATION_ALREADY_PENDING` (AC3). Bilinmeyen bölge `422` (`regionId: not_found`).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        legalName: string;
                        voen: components["schemas"]["Voen"];
                        contactName: string;
                        phone: components["schemas"]["PhoneE164"];
                        /** Format: uuid */
                        regionId: string;
                        categoryNote?: string;
                    };
                };
            };
            responses: {
                /** @description Başvuru alındı */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            status: "pending";
                        };
                    };
                };
                409: components["responses"]["Error"];
                422: components["responses"]["Error"];
                429: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/business": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Aktif işletmenin profili
         * @description İzin `business.manage` (F2.3b, Mimar onayı). Perakendeci ana sayfasındaki "Profilinizi tamamlayın" kartı `profileCompleteness`'i buradan okur (US-005 AC2). Logo adresi profil düzenlemesine kadar `null`.
         */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description İşletme */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Business"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * İşletme profilini güncelle (VÖEN dahil, US-006)
         * @description İzin `business.manage` (F2.4). Yalnız gönderilen alanlar değişir; boş gövde `422`. F2.4'te desteklenen alanlar `voen`, `legalName`, `regionId`, `addressLine`, `businessPhone`; `contactName`, `personalPhone`, `email` ve `logoFileId` F2.10'a kadar `422 VALIDATION_FAILED`. Biçimi hatalı VÖEN `422 VALIDATION_FAILED`, `details.voen = [VOEN_INVALID]` (US-006 AC1). Başka işletmede kayıtlı VÖEN `409 VOEN_ALREADY_REGISTERED` (AC3). `legalType` VÖEN'in son hanesinden türetilir; VÖEN değişince `verified` false olur (AC2, R20). VARSAYIM (F2.4 K2): VÖEN yalnız `buyer` yeteneği olan işletmede değişir, aksi `403 CAPABILITY_REQUIRED`. VARSAYIM (K3): VÖEN silinemez; aynı değer değişiklik sayılmaz.
         */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["BusinessUpdate"];
                };
            };
            responses: {
                /** @description Güncellendi; güncel işletme */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Business"];
                    };
                };
                403: components["responses"]["Error"];
                409: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/business/privacy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Görünürlük ayarları (US-007) */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ayarlar */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Privacy"];
                    };
                };
            };
        };
        /** Görünürlük ayarlarını güncelle (US-007) */
        put: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["Privacy"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Şubeler */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Branch"][];
                    };
                };
            };
        };
        put?: never;
        /** Şube oluştur (US-010) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["BranchInput"];
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branches/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Şube güncelle / pasifleştir */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["BranchInput"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        trace?: never;
    };
    "/api/v1/business/seller-profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Satıcı profili (F2.6; yalnız `seller` yeteneği)
         * @description İzin `business.manage`; işletmenin `seller` yeteneği yoksa `403 CAPABILITY_REQUIRED`.
         */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Profil */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SellerProfile"];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Satıcı profilini güncelle (F2.6)
         * @description Yalnız gönderilen alanlar yazılır. `minOrderAmount: null` alt sınırı kaldırır. Stok modu ve düşük stok eşiği stok adımında (F3), varsayılan fiyat listesi F3.6'da; varsayılan depo `PATCH /api/v1/warehouses/{id}` (`isDefault: true`) ile değişir.
         */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["SellerProfileUpdate"];
                };
            };
            responses: {
                /** @description Güncellendi; güncel profil */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SellerProfile"];
                    };
                };
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/business/service-areas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Hizmet bölgeleri (F2.6; yalnız `seller` yeteneği) */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Bölgeler */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ServiceAreas"];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        /**
         * Hizmet bölgelerini değiştir (F2.6)
         * @description Listenin tamamı gönderilir; eski liste bununla değişir (boş liste = hizmet bölgesi yok). Bilinmeyen bölge `422` (`details.regionIds = ['not_found']`).
         */
        put: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ServiceAreas"];
                };
            };
            responses: {
                /** @description Güncellendi; güncel liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ServiceAreas"];
                    };
                };
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/warehouses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Depolar (US-011; yalnız `seller` yeteneği)
         * @description Varsayılan depo önce, sonra ada göre; pasif depolar da döner.
         */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Warehouse"][];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Depo oluştur (US-011)
         * @description İlk depo varsayılan depo olur (AC1). Aktif depo sayısı `warehouses.max` hakkını aşacaksa `403 ENTITLEMENT_LIMIT_REACHED` (AC2; `details.key`, `details.limit`).
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        name: string;
                        addressLine?: string;
                    };
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Warehouse"];
                    };
                };
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/warehouses/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Depo güncelle, varsayılan yap, pasifleştir / etkinleştir (US-011)
         * @description Depo silinmez, yalnızca pasifleştirilir (AC3). Varsayılan depo pasifleştirilemez ve pasif depo varsayılan yapılamaz (`409 INVALID_STATE_TRANSITION`); önce başka depo varsayılan yapılır. `isDefault` yalnız `true` alır. Pasif depoyu etkinleştirmek `warehouses.max` hakkına tabidir (`403 ENTITLEMENT_LIMIT_REACHED`). Başka işletmenin deposu `404`.
         */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        name?: string;
                        addressLine?: string | null;
                        /** @enum {boolean} */
                        isDefault?: true;
                        /** @enum {string} */
                        status?: "active" | "inactive";
                    };
                };
            };
            responses: {
                /** @description Güncellendi; güncel depo */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Warehouse"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                409: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/team/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Üyeler */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/team/members/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Üyenin rolünü / kapsamını değiştir veya çıkar (US-013) */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        roleId?: string;
                        /** Format: uuid */
                        branchId?: string | null;
                        /** Format: uuid */
                        warehouseId?: string | null;
                        regionIds?: string[];
                        /** @enum {string} */
                        status?: "active" | "removed";
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                409: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/team/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Kullanıcı davet et (US-013) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        phone: components["schemas"]["PhoneE164"];
                        /** Format: uuid */
                        jobTitleId: string;
                        /** Format: uuid */
                        roleId: string;
                        /** Format: uuid */
                        branchId?: string;
                        /** Format: uuid */
                        warehouseId?: string;
                    };
                };
            };
            responses: {
                /** @description Davet gönderildi */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/team/invitations/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Daveti kabul et (OTP ile giriş yapmış kullanıcı)
         * @description Yalnızca giriş ister (işletme bağlamı yok). Oturumdaki kullanıcının telefonu davetteki telefonla aynı olmalıdır. Geçersiz, süresi dolmuş, kullanılmış, başka telefona ait davet veya kullanıcının zaten o işletmede üyeliği varsa hepsi aynı `404 NOT_FOUND` döner (F2.1a).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        token: string;
                    };
                };
            };
            responses: {
                /** @description Üyelik aktif */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            businessId: string;
                        };
                    };
                };
                404: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/team/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** İşletme rolleri ve kullanılabilir şablonlar */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** Şablondan özel rol oluştur (US-014) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        templateId: string;
                        name: components["schemas"]["LocalizedText"];
                        permissions: components["schemas"]["RolePermission"][];
                    };
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/directory/buyers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Perakendeci dizini (US-019, US-020) — yalnızca seller */
        get: {
            parameters: {
                query?: {
                    q?: string;
                    /** @description Tam E.164 eşleşme */
                    phone?: components["schemas"]["PhoneE164"];
                    /** @description Tam eşleşme */
                    voen?: components["schemas"]["Voen"];
                    regionId?: string[];
                    activityTypeId?: string;
                    verified?: boolean;
                    history?: "never" | "rejected" | "cancelled" | "cooldown_over" | "pending" | "active";
                    cursor?: components["parameters"]["Cursor"];
                    limit?: number;
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Sonuçlar (yalnızca görünür alanlar) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items?: components["schemas"]["DirectoryBuyer"][];
                            nextCursor?: string | null;
                        };
                    };
                };
                429: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/connection-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Bağlantı isteği gönder (US-021) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        buyerId: string;
                        message?: string;
                        proposedPaymentTermDays?: number;
                    };
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ConnectionRequest"];
                    };
                };
                409: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/connection-requests/outgoing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Gönderilen istekler (seller) */
        get: {
            parameters: {
                query?: {
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                    status?: string;
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/connection-requests/incoming": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Gelen istekler (buyer) — satıcı profil özetiyle (US-023) */
        get: {
            parameters: {
                query?: {
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/connection-requests/{id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** İsteği kabul et (US-023) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Bağlantı oluştu */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Connection"];
                    };
                };
                409: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/connection-requests/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** İsteği reddet (US-023) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Reddedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/connection-requests/{id}/withdraw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** İsteği geri çek (US-022) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Geri çekildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/connections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bağlantılarım (seller veya buyer bakışı) */
        get: {
            parameters: {
                query?: {
                    status?: "active" | "cancelled";
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/connections/{id}/terms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Bağlantı koşulları (US-024) — yalnızca seller */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ConnectionTerms"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        trace?: never;
    };
    "/api/v1/connections/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Bağlantıyı iptal et (US-025) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        reason: "no_longer_working" | "payment_issue" | "quality_issue" | "other";
                        note?: string;
                        /** @constant */
                        confirm: true;
                    };
                };
            };
            responses: {
                /** @description İptal edildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            cancelledOrders?: number;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/blocks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Engellenen toptancılar (buyer) */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** Toptancıyı engelle (US-023) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        sellerId: string;
                    };
                };
            };
            responses: {
                /** @description Engellendi */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/blocks/{sellerId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Engeli kaldır */
        delete: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    sellerId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Kaldırıldı */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/units": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Birim kataloğu */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kategori ağacı */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/brands": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Markalar */
        get: {
            parameters: {
                query?: {
                    q?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** Marka talebi (US-029 AC2) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        name: string;
                    };
                };
            };
            responses: {
                /** @description Talep oluştu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/activity-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Faaliyet alanları (F2.3a; kayıt formu)
         * @description Yalnızca aktif türler, `sortOrder` sırasıyla.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ActivityType"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/regions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Şehir / rayon listesi (F1.3) */
        get: {
            parameters: {
                query?: {
                    /** @description ISO 3166-1 alfa-2 ülke kodu. Bilinmeyen ülke boş liste döner. */
                    country?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste (önce şehirler, sonra rayonlar; az adına göre) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Region"][];
                    };
                };
                422: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kendi ürünlerim (seller) */
        get: {
            parameters: {
                query?: {
                    q?: string;
                    status?: string;
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** Ürün oluştur (US-030) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ProductInput"];
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Product"];
                    };
                };
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ürün detayı (seller) */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ürün */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Product"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Ürün güncelle / yayınla / arşivle */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ProductInput"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        trace?: never;
    };
    "/api/v1/browse/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Perakendecinin ürün listesi — yalnızca aktif bağlantılar (US-032, US-033) */
        get: {
            parameters: {
                query: {
                    branchId: string;
                    q?: string;
                    gtin?: string;
                    sellerId?: string[];
                    categoryId?: string;
                    brandId?: string;
                    priceMin?: string;
                    priceMax?: string;
                    inStock?: boolean;
                    isNew?: boolean;
                    purchasedBefore?: boolean;
                    favorites?: boolean;
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ürünler, alıcıya uygulanacak fiyatla */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items?: components["schemas"]["BrowseProduct"][];
                            nextCursor?: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/favorites/{productId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Favorilere ekle (US-045) */
        put: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    productId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Eklendi */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        /** Favorilerden çıkar */
        delete: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    productId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Çıkarıldı */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/price-lists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Fiyat listeleri */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** Fiyat listesi oluştur (US-034) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["PriceListInput"];
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/price-lists/{id}/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Liste fiyatlarını toplu ayarla (geçerlilik tarihiyle) */
        put: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: date-time */
                        validFrom?: string;
                        items: {
                            /** Format: uuid */
                            packagingId: string;
                            unitPrice: components["schemas"]["Decimal"];
                        }[];
                    };
                };
            };
            responses: {
                /** @description Kaydedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/customer-prices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Müşteri / şube fiyatları */
        get: {
            parameters: {
                query: {
                    buyerId: string;
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /** Müşteri / şube fiyatı ayarla (US-035, US-036) */
        put: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        buyerId: string;
                        /** Format: uuid */
                        branchId?: string | null;
                        /** Format: date-time */
                        validFrom?: string;
                        items: {
                            /** Format: uuid */
                            packagingId: string;
                            unitPrice: components["schemas"]["Decimal"];
                        }[];
                    };
                };
            };
            responses: {
                /** @description Kaydedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Error"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/branch-discounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Şube indirimleri */
        get: {
            parameters: {
                query?: {
                    buyerId?: string;
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** Şube indirimi oluştur (US-036) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["BranchDiscountInput"];
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tier-prices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Kademeli fiyat ayarla (US-037) */
        put: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        packagingId: string;
                        tiers: {
                            minQty: components["schemas"]["Decimal"];
                            discountPercent: components["schemas"]["Decimal"];
                        }[];
                    };
                };
            };
            responses: {
                /** @description Kaydedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/prices/explain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bir alıcı için fiyatın kaynağını göster (US-034 AC5) */
        get: {
            parameters: {
                query: {
                    buyerId: string;
                    branchId?: string;
                    packagingId: string;
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Çözümleme adımları */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ResolvedPrice"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Stok (seller) */
        get: {
            parameters: {
                query?: {
                    warehouseId?: string;
                    low?: boolean;
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stock/movements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mal girişi veya sayım düzeltmesi (US-039) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        warehouseId: string;
                        /** Format: uuid */
                        variantId: string;
                        /** @enum {string} */
                        type: "receipt" | "adjustment";
                        qty: components["schemas"]["Decimal"];
                        lotNo?: string;
                        /** Format: date */
                        expiryDate?: string;
                        note?: string;
                    };
                };
            };
            responses: {
                /** @description Kaydedildi */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/variants/{id}/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Var / yok işaretle (US-038) */
        put: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        isAvailable: boolean;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Şube sepeti (US-040) */
        get: {
            parameters: {
                query: {
                    branchId: string;
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Satıcıya göre gruplu sepet, güncel fiyatlarla */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Cart"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Kalem ekle / miktar güncelle (0 = sil) */
        put: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        branchId: string;
                        /** Format: uuid */
                        packagingId: string;
                        qty: components["schemas"]["Decimal"];
                    };
                };
            };
            responses: {
                /** @description Güncel sepet */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Cart"];
                    };
                };
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sepeti gönder veya onaya gönder (US-041, US-042) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        branchId: string;
                    };
                };
            };
            responses: {
                /** @description Onay gerekmedi; siparişler oluştu */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SubmitResult"];
                    };
                };
                /** @description Şube onayı bekleniyor */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Şube admini onaylar ve gönderir (US-041) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        branchId: string;
                    };
                };
            };
            responses: {
                /** @description Siparişler oluştu */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SubmitResult"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/return": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Şube admini sepeti geri gönderir (US-041 AC3) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        branchId: string;
                        note: string;
                    };
                };
            };
            responses: {
                /** @description Geri gönderildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Siparişler (seller veya buyer bakışı) */
        get: {
            parameters: {
                query?: {
                    status?: components["schemas"]["OrderStatus"][];
                    branchId?: string;
                    counterpartyId?: string;
                    from?: string;
                    to?: string;
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sipariş detayı */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Sipariş */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Order"];
                    };
                };
                404: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tam veya kısmi onay (US-043) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Boşsa tüm satırlar istenen miktarla onaylanır */
                        lines?: {
                            /** Format: uuid */
                            itemId: string;
                            qtyApproved: components["schemas"]["Decimal"];
                            reason?: string;
                            lotNo?: string;
                            /** Format: date */
                            expiryDate?: string;
                        }[];
                    };
                };
            };
            responses: {
                /** @description Onaylandı */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                409: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reddet (US-043) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        reason: string;
                    };
                };
            };
            responses: {
                /** @description Reddedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** İptal (buyer yalnızca submitted; seller approved/preparing) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        reason: string;
                    };
                };
            };
            responses: {
                /** @description İptal edildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                409: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/prepare": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Hazırlanıyor (US-043 AC5) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/confirm-delivery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Perakendeci teslimi onaylar (US-048) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Teslim kesinleşti */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                409: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/dispute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Perakendeci itiraz eder (US-048) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        type: "missing" | "damaged" | "not_received";
                        description: string;
                        /** Format: uuid */
                        fileId?: string;
                    };
                };
            };
            responses: {
                /** @description İtiraz açıldı */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/resolve-dispute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Toptancı itirazı çözer (US-048 AC4) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        decision: "accept" | "reject";
                        note: string;
                        lines?: {
                            /** Format: uuid */
                            itemId: string;
                            qtyDelivered: components["schemas"]["Decimal"];
                        }[];
                    };
                };
            };
            responses: {
                /** @description Çözüldü */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/document": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sipariş belgesi PDF üret / getir (US-044) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Hazır; süreli indirme bağlantısı */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DocumentRef"];
                    };
                };
                /** @description Üretiliyor; tekrar sorgulayın */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/einvoice-number": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** e-qaimə numarasını elle gir (US-053 AC2) */
        put: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        einvoiceNumber: string;
                    };
                };
            };
            responses: {
                /** @description Kaydedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/reorder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tekrar sipariş — kalemleri sepete ekler (US-045) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Eklenen ve eklenemeyen kalemler */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{id}/delivery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Kargocu ata veya dış kargoya ver (US-046, US-049) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @constant */
                        provider: "own_courier";
                        /** Format: uuid */
                        courierMembershipId: string;
                    } | {
                        /** @constant */
                        provider: "manual_carrier";
                        carrierName: string;
                        trackingNo: string;
                    };
                };
            };
            responses: {
                /** @description Teslimat oluştu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deliveries/mine": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kargocunun teslimatları (US-046 AC3) */
        get: {
            parameters: {
                query?: {
                    status?: string;
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deliveries/{id}/depart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Yola çıktım */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deliveries/{id}/delivered": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Teslim ettim (US-047) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        photoFileId?: string;
                        lat?: number;
                        lng?: number;
                        /**
                         * Format: date-time
                         * @description Çevrimdışı gönderimde istemci zamanı
                         */
                        deliveredAt?: string;
                        cashCollected?: {
                            amount?: components["schemas"]["Decimal"];
                            currency?: components["schemas"]["CurrencyCode"];
                        };
                    };
                };
            };
            responses: {
                /** @description Onay bekliyor */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deliveries/{id}/failed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Teslim edilemedi (US-047 AC4) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        reason: "closed" | "not_reachable" | "refused" | "address_wrong" | "other";
                        lat?: number;
                        lng?: number;
                    };
                };
            };
            responses: {
                /** @description Kaydedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/ledger/balances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Karşı taraf bazında bakiyeler (US-050) */
        get: {
            parameters: {
                query?: {
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Bakiyeler (para birimine göre) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items?: components["schemas"]["Balance"][];
                            nextCursor?: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/ledger/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bir karşı tarafla cari hareketleri */
        get: {
            parameters: {
                query: {
                    counterpartyId: string;
                    currency?: components["schemas"]["CurrencyCode"];
                    from?: string;
                    to?: string;
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Hareketler */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tahsilat gir (US-051) — yalnızca seller */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        buyerId: string;
                        amount: components["schemas"]["Decimal"];
                        currency: components["schemas"]["CurrencyCode"];
                        /** @enum {string} */
                        method: "cash" | "bank_transfer" | "card";
                        /** Format: date-time */
                        receivedAt: string;
                        note?: string;
                    };
                };
            };
            responses: {
                /** @description Kaydedildi (posted veya pending_review) */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payments/{id}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Temsilci tahsilatını onayla / reddet (US-051 AC4) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        decision: "post" | "reject";
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier-cash": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kargocularda bekleyen nakit (US-051 AC2) */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courier-cash/{id}/hand-over": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Nakit teslim alındı (US-051 AC3) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Kapandı */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/statements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ekstre PDF iste (US-052) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        counterpartyId: string;
                        /** Format: date */
                        from: string;
                        /** Format: date */
                        to: string;
                    };
                };
            };
            responses: {
                /** @description Üretiliyor */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DocumentRef"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/documents/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Belge durumu ve süreli indirme bağlantısı */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Belge */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DocumentRef"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/exports/einvoice": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** e-qaimə uyumlu .xlsx dışa aktarma (US-053) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: date */
                        from: string;
                        /** Format: date */
                        to: string;
                    };
                };
            };
            responses: {
                /** @description Üretiliyor */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DocumentRef"];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Excel içe aktarma başlat (US-031) */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        type: "products" | "customer_prices" | "stock";
                        /** Format: uuid */
                        fileId: string;
                    };
                };
            };
            responses: {
                /** @description İş oluştu */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportJob"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imports/template": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Şablon .xlsx indirme bağlantısı */
        get: {
            parameters: {
                query: {
                    type: "products" | "customer_prices" | "stock";
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Süreli bağlantı */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imports/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** İş durumu ve önizleme */
        get: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description İş */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportJob"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imports/{id}/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Önizlemeyi uygula */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Uygulanıyor */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/files/upload-url": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Süreli imzalı yükleme URL'si (SF-09, NFR-49)
         * @description İzin `purpose`'a göre (F1.10): product_image → catalog.manage; logo → business.manage;
         *     delivery_photo → delivery.update_own; dispute_photo → orders.confirm_delivery veya
         *     orders.resolve_dispute; import → imports.run. Tür veya boyut sınırı aşılırsa 422 FILE_INVALID.
         *     Platform dosyası yüklemesi bu uçta yok (F1.10 kararı); X-Business-Id zorunlu.
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        purpose: "product_image" | "logo" | "delivery_photo" | "dispute_photo" | "import";
                        contentType: string;
                        sizeBytes: number;
                    };
                };
            };
            responses: {
                /** @description URL */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            fileId: string;
                            /** Format: uri */
                            uploadUrl: string;
                            /** @enum {string} */
                            method: "PUT";
                            headers: {
                                [key: string]: string;
                            };
                            /** Format: date-time */
                            expiresAt: string;
                        };
                    };
                };
                401: components["responses"]["Error"];
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/files/{id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Yüklemeyi tamamla ve doğrula (boyut + ilk 16 bayt imzası)
         * @description Dosyayı oluşturan işletmenin bağlamında çağrılır; başka işletmenin dosyası 404.
         *     Geçersiz dosya → nesne silinir, satır rejected, 422 FILE_INVALID. Aynı dosya için
         *     tekrar çağrı mevcut durumu döner (ready → 200, rejected → 422).
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Hazır */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            fileId: string;
                            /** @enum {string} */
                            status: "ready";
                            contentType: string;
                            sizeBytes: number;
                            /**
                             * Format: uri
                             * @description Yalnızca public dosyada CDN adresi
                             */
                            url?: string;
                        };
                    };
                };
                401: components["responses"]["Error"];
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Uygulama içi bildirimler (US-054 AC1; en yeni önce) */
        get: {
            parameters: {
                query?: {
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: components["schemas"]["Notification"][];
                            nextCursor: string | null;
                        };
                    };
                };
                401: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Okundu işaretle */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        ids?: string[];
                        all?: boolean;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Bildirim tercihleri (US-054 AC2); anahtar bildirim türü, değer push açık mı */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        [key: string]: boolean;
                    };
                };
            };
            responses: {
                /** @description Güncellendi; tüm türlerin güncel tercihi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            [key: string]: boolean;
                        };
                    };
                };
                401: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/push-tokens": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cihaz push anahtarını kaydet (anahtar başka kullanıcıdaysa bu kullanıcıya taşınır) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description ExponentPushToken[...] */
                        token: string;
                        /** @enum {string} */
                        platform: "ios" | "android";
                    };
                };
            };
            responses: {
                /** @description Kaydedildi */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/dashboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Rol bazlı dashboard kartları (US-056) */
        get: {
            parameters: {
                query?: {
                    range?: "today" | "week" | "month" | "custom";
                    from?: string;
                    to?: string;
                };
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Kartlar */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            cards?: components["schemas"]["DashboardCard"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/i18n/{lang}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Arayüz çevirileri (önbelleklenebilir, ETag; US-058, F1.3)
         * @description Dilin bütün arayüz anahtarları. Dilde eksik olan anahtar varsayılan dilin (az) değeriyle
         *     gelir (US-058 AC3). Yanıt `Cache-Control: no-cache` taşır: istemci önbelleğini her
         *     kullanımda `If-None-Match` ile doğrular; değişiklik yoksa `304`.
         */
        get: {
            parameters: {
                query?: never;
                header?: {
                    "If-None-Match"?: string;
                };
                path: {
                    /**
                     * @description Dil kodu. `languages` tablosunda olmayan (ör. `xx`) veya pasif (`is_active = false`)
                     *     dil `404 NOT_FOUND` döner; bu yüzden şema enum değildir.
                     */
                    lang: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Anahtar → metin sözlüğü */
                200: {
                    headers: {
                        /** @description Sözlüğün sürüm özeti (güçlü ETag) */
                        ETag?: string;
                        "Cache-Control"?: string;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            [key: string]: string;
                        };
                    };
                };
                /** @description İstemcideki sürüm güncel (gövde yok) */
                304: {
                    headers: {
                        ETag?: string;
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                404: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/app-config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Mobil minimum sürüm ve genel ayarlar (US-060) — sürümsüz uç nokta */
        get: {
            parameters: {
                query: {
                    platform: "ios" | "android";
                    version: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Yapılandırma */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            minVersion: string;
                            recommendedVersion: string;
                            updateRequired: boolean;
                            /**
                             * Format: uri
                             * @description Mağaza veya test dağıtım bağlantısı; ayarlanmamışsa alan yok (F1.14b)
                             */
                            storeUrl?: string;
                            maintenance: boolean;
                        };
                    };
                };
                422: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sağlık kontrolü (veritabanı ve Redis) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Sağlıklı */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Bağımlılık erişilemiyor */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/sellers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Toptancılar (platform rolü super_admin, operations) */
        get: {
            parameters: {
                query?: {
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste (yeniden eskiye) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: components["schemas"]["AdminSeller"][];
                            nextCursor: string | null;
                        };
                    };
                };
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Toptancı aç (US-009; platform rolü super_admin, operations)
         * @description Tek işlemde işletme (`created_via = admin`, `active`), `seller` yeteneği (`approved`), satıcı profili, hizmet bölgeleri, seçilen planın aboneliği, işletme admin rolü, yetkilinin kullanıcı kaydı (yoksa) ve aktivasyon daveti (`invitation.seller_activation_days`) oluşur. Aktivasyon SMS'i işlemden sonra gider; gönderilemezse işletme yine oluşur ve `activationSmsSent: false` döner. Aynı VÖEN herhangi bir işletmede kayıtlıysa `409`. `applicationId` verilirse (F2.2) başvuru aynı işlemde `approved` olur ve işletmeye bağlanır; başvuru yoksa `404`, `pending` değilse `409 INVALID_STATE_TRANSITION`.
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        legalName: string;
                        voen: components["schemas"]["Voen"];
                        /** Format: uuid */
                        regionId: string;
                        addressLine?: string;
                        ownerPhone: components["schemas"]["PhoneE164"];
                        ownerName: string;
                        /** Format: uuid */
                        planId: string;
                        serviceAreaRegionIds?: string[];
                        currency: components["schemas"]["CurrencyCode"];
                        /** @description IANA saat dilimi adı */
                        timezone: string;
                        /**
                         * Format: uuid
                         * @description Başvurudan açma (F2.2
                         */
                        applicationId?: string;
                    };
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            businessId: string;
                            /** Format: date-time */
                            invitationExpiresAt: string;
                            activationSmsSent: boolean;
                        };
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                409: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/sellers/{id}/activation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Yeni aktivasyon daveti gönder (US-009 AC3)
         * @description İşletmenin açık admin davetleri geçersiz olur, aynı yetkiliye yeni davet ve SMS gider. İşletmede aktif admin üyeliği varsa `409 INVALID_STATE_TRANSITION`; toptancı yoksa `404`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Yeni davet oluşturuldu */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: date-time */
                            invitationExpiresAt: string;
                            activationSmsSent: boolean;
                        };
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                409: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/seller-applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Toptancı başvuruları (US-008 AC1; platform rolü super_admin, operations) */
        get: {
            parameters: {
                query?: {
                    status?: "pending" | "approved" | "rejected";
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste (yeniden eskiye) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: components["schemas"]["SellerApplication"][];
                            nextCursor: string | null;
                        };
                    };
                };
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/seller-applications/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Başvuruyu reddet (platform rolü super_admin, operations)
         * @description Yalnızca `pending` başvuru; değilse `409 INVALID_STATE_TRANSITION`, yoksa `404`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Reddedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SellerApplication"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                409: components["responses"]["Error"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/buyers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Perakendeciler (filtre: moderasyon bekleyen, bağlantısız aşama, askıda) */
        get: {
            parameters: {
                query?: {
                    filter?: "all" | "voen_pending" | "dormant" | "suspended";
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/buyers/{id}/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** VÖEN doğrula / reddet (US-015) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        decision: "verify" | "reject";
                        reason?: string;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/businesses/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Askıya al / kaldır / arşivle (US-016) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        action: "suspend" | "unsuspend" | "archive";
                        reason: string;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/buyers/merge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mükerrer perakendecileri birleştir (US-016 AC4) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        sourceId: string;
                        /** Format: uuid */
                        targetId: string;
                        reason: string;
                    };
                };
            };
            responses: {
                /** @description Birleştirildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ayarlar (kapsam ile) */
        get: {
            parameters: {
                query?: {
                    scope?: "platform" | "plan" | "business";
                    scopeId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ayarlar */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /** Ayar güncelle (US-017) */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        scope: "platform" | "plan" | "business";
                        /** Format: uuid */
                        scopeId?: string | null;
                        key: string;
                        value: unknown;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Error"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Planlar (yalnız okuma; F2.1a'da toptancı formu için öne alındı, yönetim F6.3) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: components["schemas"]["AdminPlan"][];
                        };
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /** Plan oluştur (US-055) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["PlanInput"];
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscriptions/{businessId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Abonelik ata / ödeme işaretle / istisna (US-055) */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    businessId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        planId?: string;
                        markPaid?: boolean;
                        paymentNote?: string;
                        overrides?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/catalog/{kind}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Genel katalog kaydı oluştur (units, categories, brands, activity-types, regions, job-titles, role-templates) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kind: "units" | "categories" | "brands" | "activity-types" | "regions" | "job-titles" | "role-templates";
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": Record<string, never>;
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/catalog/{kind}/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Genel katalog kaydı güncelle / pasifleştir */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kind: string;
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": Record<string, never>;
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        trace?: never;
    };
    "/api/v1/admin/translations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Arayüz çevirileri ve eksik anahtar raporu */
        get: {
            parameters: {
                query?: {
                    missing?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /** Çeviri güncelle (US-058) */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        key: string;
                        lang: components["schemas"]["LanguageCode"];
                        value: string;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/impersonations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Salt-okunur kullanıcı taklidi başlat (US-018) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        targetUserId: string;
                        /** Format: uuid */
                        targetBusinessId: string;
                        reason: string;
                    };
                };
            };
            responses: {
                /** @description Taklit oturumu anahtarları */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/audit-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Audit log (işletme admini kendi işletmesi; platform tümü) (US-057) */
        get: {
            parameters: {
                query?: {
                    action?: string;
                    from?: string;
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
                header?: {
                    "X-Business-Id"?: components["parameters"]["BusinessIdOptional"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/dev/sms-outbox": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Mock SMS kutusu — yalnızca development ve staging (NFR-96). Production'da 404. */
        get: {
            parameters: {
                query?: {
                    phone?: components["schemas"]["PhoneE164"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Son 50 mesaj */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/dev/storage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Yerel dosya deposundan okuma (imzalı, süreli) — production'da yok */
        get: {
            parameters: {
                query: {
                    token: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Dosya içeriği */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/octet-stream": string;
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
            };
        };
        /**
         * Yerel dosya deposuna yükleme (STORAGE_PROVIDER=local, ADR-0023) — production'da yok
         * @description `token` (sorgu parametresi), `local` deposunun ürettiği imzalı (HMAC) ve süreli yükleme bağlantısıdır. İmza veya süre
         *     geçersizse, Content-Type ya da gövde boyutu imzadakinden farklıysa veya nesne zaten yazılmışsa
         *     (tek yazım, R2'de `If-None-Match: *`) 403.
         */
        put: {
            parameters: {
                query: {
                    token: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/octet-stream": string;
                };
            };
            responses: {
                /** @description Yüklendi */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Error"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Error: {
            code: components["schemas"]["ErrorCode"];
            /** @description Accept-Language dilinde */
            message: string;
            requestId: string;
            /** @description Örn. alan hataları { field: [mesaj] }, retryAfter, available */
            details?: {
                [key: string]: unknown;
            };
        };
        /** @enum {string} */
        ErrorCode: "VALIDATION_FAILED" | "UNAUTHENTICATED" | "PERMISSION_DENIED" | "CAPABILITY_REQUIRED" | "NOT_FOUND" | "INVALID_STATE_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "RATE_LIMITED" | "CONFIRMATION_REQUIRED" | "OTP_RATE_LIMITED" | "OTP_INVALID" | "OTP_EXPIRED" | "OTP_LOCKED" | "SMS_UNAVAILABLE" | "TOTP_REQUIRED" | "TOTP_INVALID" | "REFRESH_TOKEN_REUSED" | "USER_DISABLED" | "BUSINESS_SUSPENDED" | "SUBSCRIPTION_READ_ONLY" | "ENTITLEMENT_LIMIT_REACHED" | "VOEN_INVALID" | "VOEN_ALREADY_REGISTERED" | "VOEN_REQUIRED" | "SELLER_APPLICATION_ALREADY_PENDING" | "PHONE_ALREADY_REGISTERED" | "LAST_ADMIN_PROTECTED" | "CONNECTION_ALREADY_ACTIVE" | "CONNECTION_REQUEST_ALREADY_PENDING" | "CONNECTION_REQUEST_EXPIRED" | "CONNECTION_BLOCKED" | "CONNECTION_COOLDOWN_ACTIVE" | "CONNECTION_DAILY_QUOTA_EXCEEDED" | "CONNECTION_NOT_ACTIVE" | "PRICE_NOT_AVAILABLE" | "QTY_NOT_MULTIPLE" | "BELOW_MIN_ORDER_QTY" | "BELOW_MIN_ORDER_AMOUNT" | "VARIANT_UNAVAILABLE" | "CURRENCY_MISMATCH" | "STOCK_INSUFFICIENT" | "ORDER_QTY_INCREASE_NOT_ALLOWED" | "ORDER_EMPTY_USE_REJECT" | "DELIVERY_PHOTO_REQUIRED" | "DELIVERY_TIMESTAMP_TOO_OLD" | "FILE_INVALID" | "IMPORT_TOO_MANY_ROWS" | "SETTING_OUT_OF_RANGE" | "INTERNAL_ERROR";
        /** @example +994501234567 */
        PhoneE164: string;
        Voen: string;
        /** @enum {string} */
        LanguageCode: "az" | "ru" | "tr" | "en";
        /** @example AZN */
        CurrencyCode: string;
        /** @example 12.50 */
        Decimal: string;
        Money: {
            amount: components["schemas"]["Decimal"];
            currency: components["schemas"]["CurrencyCode"];
        };
        ActivityType: {
            /** Format: uuid */
            id: string;
            name: components["schemas"]["LocalizedText"];
            sortOrder: number;
        };
        Region: {
            /** Format: uuid */
            id: string;
            /** @example AZ */
            countryCode: string;
            /**
             * Format: uuid
             * @description Rayonun bağlı olduğu şehir
             */
            parentId: string | null;
            /** @enum {string} */
            type: "city" | "district";
            name: components["schemas"]["LocalizedText"];
        };
        LocalizedText: {
            az?: string;
            ru?: string;
            tr?: string;
            en?: string;
        };
        DeviceInfo: {
            /** @enum {string} */
            type?: "web" | "ios" | "android";
            name?: string;
            appVersion?: string;
        };
        TokenPair: {
            accessToken: string;
            /** @description saniye (900) */
            expiresIn: number;
            /** @description Yalnızca mobil; web'de cookie */
            refreshToken?: string;
        };
        /** @description nextStep = none iken accessToken ve expiresIn dolu (oturum açıldı). nextStep = register iken oturum açılmaz; accessToken yok, pendingToken kayıt için kısa ömürlü anahtardır (F1.5b). */
        AuthResult: {
            accessToken?: string;
            /** @description saniye (900) */
            expiresIn?: number;
            /** @description Yalnızca mobil; web'de cookie */
            refreshToken?: string;
            /** @enum {string} */
            nextStep: "none" | "register" | "totp" | "totp_setup";
            /** @description nextStep = register (kayıt, F2.3; telefonu taşır, 15 dk) veya totp / totp_setup (yalnızca /auth/totp/* uçlarında geçerli ön oturum, F1.6) ise. Erişim anahtarı olarak kabul edilmez. */
            pendingToken?: string;
            memberships: components["schemas"]["MembershipSummary"][];
        };
        Session: {
            /** Format: uuid */
            id?: string;
            deviceType?: string;
            deviceName?: string;
            city?: string;
            /** Format: date-time */
            lastUsedAt?: string;
            current?: boolean;
        };
        MembershipSummary: {
            /**
             * Format: uuid
             * @description F1.8b
             */
            membershipId?: string;
            /** Format: uuid */
            businessId?: string;
            businessName?: string;
            /**
             * @description F1.8b: askıdaki / arşivli işletme listede görünür ama işletme bağlamlı uçlar 403 BUSINESS_SUSPENDED döner
             * @enum {string}
             */
            businessStatus?: "active" | "suspended" | "dormant" | "archived";
            /** @enum {string} */
            capability?: "seller" | "buyer";
            roleName?: string;
        };
        Me: {
            /** Format: uuid */
            id?: string;
            fullName?: string;
            phone?: components["schemas"]["PhoneE164"];
            preferredLanguage?: components["schemas"]["LanguageCode"];
            timezone?: string | null;
            platformRole?: string | null;
            /** @description TOTP kurulu ve etkin mi (F1.6) */
            totpEnabled?: boolean;
            /** @description Kullanıcının aktif bir işletme admini üyeliği var ve TOTP kurulu değil (US-002 AC3, F1.8b) */
            twoFactorRecommended?: boolean;
            memberships?: components["schemas"]["MembershipSummary"][];
            activeBusiness?: {
                /** Format: uuid */
                id?: string;
                /**
                 * @description Rolün yeteneği, işletmede onaylıysa. Yetenek onaylı değilse (beklemede / askıda) null; bu durumda işletme bağlamlı uçlar 403 CAPABILITY_REQUIRED döner (F1.8b).
                 * @enum {string|null}
                 */
                capability?: "seller" | "buyer" | null;
                timezone?: string;
                currency?: components["schemas"]["CurrencyCode"];
                permissions?: components["schemas"]["RolePermission"][];
                subscriptionStatus?: string;
            };
        };
        RolePermission: {
            /** @example orders.approve */
            code: string;
            /** @enum {string} */
            scope: "all" | "branch" | "warehouse" | "assigned";
        };
        Business: {
            /** Format: uuid */
            id?: string;
            legalName?: string;
            voen?: string | null;
            legalType?: string | null;
            /** Format: uuid */
            regionId?: string;
            addressLine?: string | null;
            businessPhone?: string | null;
            logoUrl?: string | null;
            status?: string;
            verified?: boolean;
            profileCompleteness?: number;
            timezone?: string;
            currency?: components["schemas"]["CurrencyCode"];
        };
        BusinessUpdate: {
            legalName?: string;
            voen?: components["schemas"]["Voen"];
            /** Format: uuid */
            regionId?: string;
            addressLine?: string;
            businessPhone?: string;
            /** Format: uuid */
            logoFileId?: string;
            contactName?: string;
            personalPhone?: components["schemas"]["PhoneE164"];
            /** Format: email */
            email?: string;
        };
        Privacy: {
            listedInDirectory?: boolean;
            showLogo?: boolean;
            showAddress?: boolean;
            showBusinessPhone?: boolean;
            showVoen?: boolean;
            showContactName?: boolean;
            showPersonalContact?: boolean;
        };
        Branch: components["schemas"]["BranchInput"] & {
            /** Format: uuid */
            id?: string;
        };
        BranchInput: {
            name: string;
            /** Format: uuid */
            regionId: string;
            addressLine: string;
            lat?: number;
            lng?: number;
            /** @enum {string} */
            approvalRule?: "every_order" | "above_amount" | "none";
            approvalThreshold?: components["schemas"]["Decimal"];
            /** @enum {string} */
            status?: "active" | "inactive";
        };
        Warehouse: {
            /** Format: uuid */
            id: string;
            name: string;
            addressLine: string | null;
            isDefault: boolean;
            /** @enum {string} */
            status: "active" | "inactive";
        };
        SellerProfile: {
            description: components["schemas"]["LocalizedText"] | null;
            /** @description İşletmenin para biriminde; yoksa alt sınır yok. */
            minOrderAmount: components["schemas"]["Decimal"] | null;
            requireDeliveryPhoto: boolean;
            /** Format: uuid */
            defaultWarehouseId: string | null;
        };
        SellerProfileUpdate: {
            /** @description Dil başına en çok 2000 karakter; `null` metni siler. */
            description?: components["schemas"]["LocalizedText"] | null;
            /** @description 0 veya pozitif, en çok 2 ondalık (`numeric(14,2)`); `null` kaldırır. */
            minOrderAmount?: string | null;
            requireDeliveryPhoto?: boolean;
        };
        ServiceAreas: {
            regionIds: string[];
        };
        /** @description Yalnızca görünürlük ayarına göre açık alanlar dolu döner. Diğer bağlantılar asla dönmez. */
        DirectoryBuyer: {
            /** Format: uuid */
            id: string;
            legalName: string;
            activityType: string;
            region: string;
            verified?: boolean;
            logoUrl?: string | null;
            addressLine?: string | null;
            businessPhone?: string | null;
            voen?: string | null;
            contactName?: string | null;
            /** @description Bu satıcıyla ilişki durumu */
            relation?: {
                /** @enum {string} */
                status?: "none" | "pending" | "active" | "rejected" | "cancelled" | "blocked";
                /** Format: date-time */
                cooldownUntil?: string | null;
                canRequest?: boolean;
            };
        };
        ConnectionRequest: {
            /** Format: uuid */
            id?: string;
            /** Format: uuid */
            sellerId?: string;
            /** Format: uuid */
            buyerId?: string;
            /** @enum {string} */
            status?: "pending" | "accepted" | "rejected" | "expired" | "withdrawn";
            message?: string | null;
            proposedPaymentTermDays?: number | null;
            /** Format: date-time */
            expiresAt?: string;
            /** Format: date-time */
            createdAt?: string;
        };
        Connection: {
            /** Format: uuid */
            id?: string;
            /** Format: uuid */
            sellerId?: string;
            /** Format: uuid */
            buyerId?: string;
            counterpartyName?: string;
            /** @enum {string} */
            status?: "active" | "cancelled";
            terms?: components["schemas"]["ConnectionTerms"];
            /** Format: date-time */
            startedAt?: string;
            /** Format: date-time */
            endedAt?: string | null;
            endedBySide?: string | null;
        };
        ConnectionTerms: {
            /** Format: uuid */
            priceListId?: string | null;
            branchPricingEnabled?: boolean;
            creditLimit?: string | null;
            paymentTermDays?: number;
            /** Format: uuid */
            salesRepMembershipId?: string | null;
        };
        Notification: {
            /** Format: uuid */
            id: string;
            type: string;
            /** Format: uuid */
            businessId: string | null;
            title: string;
            body: string;
            data: {
                type: string;
                id: string;
            };
            /** Format: date-time */
            readAt: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        Packaging: {
            /** Format: uuid */
            id?: string;
            /** @enum {string} */
            level: "unit" | "inner" | "case" | "pallet";
            /** @example XCT */
            unitCode: string;
            baseQty: components["schemas"]["Decimal"];
            gtin?: string | null;
            isSalesUnit?: boolean;
            minOrderQty?: components["schemas"]["Decimal"];
            orderMultiple?: components["schemas"]["Decimal"];
            weightG?: number | null;
        };
        Variant: {
            /** Format: uuid */
            id?: string;
            sku?: string;
            attributes?: {
                [key: string]: unknown;
            };
            gtin?: string | null;
            isAvailable?: boolean;
            packaging?: components["schemas"]["Packaging"][];
        };
        ProductInput: {
            sku: string;
            name: components["schemas"]["LocalizedText"];
            description?: components["schemas"]["LocalizedText"];
            /** Format: uuid */
            categoryId: string;
            /** Format: uuid */
            brandId?: string | null;
            baseUnitCode: string;
            hasExpiry?: boolean;
            shelfLifeMonths?: number | null;
            /** @enum {string} */
            status?: "draft" | "active" | "archived";
            imageFileIds?: string[];
            variants: components["schemas"]["Variant"][];
            visibility?: {
                priceListIds?: string[];
                regionIds?: string[];
            };
        };
        Product: components["schemas"]["ProductInput"] & {
            /** Format: uuid */
            id?: string;
            images?: {
                thumb?: string;
                medium?: string;
                large?: string;
            }[];
        };
        BrowseProduct: {
            /** Format: uuid */
            productId?: string;
            /** Format: uuid */
            variantId?: string;
            /** Format: uuid */
            packagingId?: string;
            /** Format: uuid */
            sellerId?: string;
            sellerName?: string;
            /** @description İstek dilinde (geri dönüşlü) */
            name?: string;
            brand?: string | null;
            imageUrl?: string | null;
            salesUnit?: string;
            baseQtyPerUnit?: components["schemas"]["Decimal"];
            minOrderQty?: components["schemas"]["Decimal"];
            orderMultiple?: components["schemas"]["Decimal"];
            price?: components["schemas"]["ResolvedPrice"];
            stock?: {
                /** @enum {string} */
                state?: "untracked" | "in_stock" | "low" | "out_of_stock";
                lowQty?: string | null;
            };
            isFavorite?: boolean;
        };
        ResolvedPrice: {
            unitPrice?: components["schemas"]["Money"];
            /** @enum {string} */
            source?: "branch_price" | "customer_price" | "price_list" | "default_list" | "none";
            tierDiscountPercent?: components["schemas"]["Decimal"];
            branchDiscountPercent?: components["schemas"]["Decimal"];
            finalUnitPrice?: components["schemas"]["Money"];
            vatIncluded?: boolean;
            vatRate?: components["schemas"]["Decimal"];
        };
        PriceListInput: {
            name: string;
            currency: components["schemas"]["CurrencyCode"];
            vatIncluded: boolean;
            vatRate: components["schemas"]["Decimal"];
            isDefault?: boolean;
        };
        BranchDiscountInput: {
            /** Format: uuid */
            buyerId: string;
            /** Format: uuid */
            branchId: string;
            /** @enum {string} */
            target: "all" | "brand" | "category";
            /** Format: uuid */
            brandId?: string;
            /** Format: uuid */
            categoryId?: string;
            percent: components["schemas"]["Decimal"];
            /** Format: date-time */
            validFrom?: string;
            /** Format: date-time */
            validTo?: string | null;
        };
        Cart: {
            /** Format: uuid */
            branchId?: string;
            /** @enum {string} */
            status?: "open" | "pending_approval";
            approvalRequired?: boolean;
            groups?: {
                /** Format: uuid */
                sellerId?: string;
                sellerName?: string;
                connectionActive?: boolean;
                subtotal?: components["schemas"]["Money"];
                minOrderAmount?: components["schemas"]["Money"] | null;
                belowMinimum?: boolean;
                creditLimitWarning?: boolean;
                items?: {
                    /** Format: uuid */
                    packagingId?: string;
                    name?: string;
                    qty?: components["schemas"]["Decimal"];
                    price?: components["schemas"]["ResolvedPrice"];
                    lineTotal?: components["schemas"]["Money"];
                    priceChanged?: boolean;
                    addedBy?: string;
                }[];
            }[];
        };
        SubmitResult: {
            orders?: {
                /** Format: uuid */
                id?: string;
                number?: string;
                /** Format: uuid */
                sellerId?: string;
                total?: components["schemas"]["Money"];
            }[];
            skippedGroups?: {
                /** Format: uuid */
                sellerId?: string;
                reason?: components["schemas"]["ErrorCode"];
            }[];
        };
        /** @enum {string} */
        OrderStatus: "submitted" | "approved" | "rejected" | "cancelled" | "preparing" | "ready_to_ship" | "shipped" | "delivered_pending_confirmation" | "disputed" | "delivered";
        Order: {
            /** Format: uuid */
            id?: string;
            number?: string;
            /** Format: uuid */
            sellerId?: string;
            sellerName?: string;
            /** Format: uuid */
            buyerId?: string;
            buyerName?: string;
            /** Format: uuid */
            branchId?: string;
            status?: components["schemas"]["OrderStatus"];
            currency?: components["schemas"]["CurrencyCode"];
            subtotal?: components["schemas"]["Decimal"];
            discountTotal?: components["schemas"]["Decimal"];
            vatTotal?: components["schemas"]["Decimal"];
            total?: components["schemas"]["Decimal"];
            paymentTermDays?: number;
            /** Format: date-time */
            submittedAt?: string;
            /** Format: date-time */
            approvedAt?: string | null;
            /** Format: date-time */
            deliveredAt?: string | null;
            /** Format: date-time */
            autoConfirmAt?: string | null;
            autoConfirmed?: boolean;
            deliverySnapshot?: {
                [key: string]: unknown;
            };
            items?: {
                /** Format: uuid */
                id?: string;
                name?: string;
                unitCode?: string;
                qtyOrdered?: components["schemas"]["Decimal"];
                qtyApproved?: string | null;
                unitPrice?: components["schemas"]["Decimal"];
                priceSource?: string;
                tierDiscountPercent?: components["schemas"]["Decimal"];
                branchDiscountPercent?: components["schemas"]["Decimal"];
                lineTotal?: components["schemas"]["Decimal"];
                lotNo?: string | null;
                /** Format: date */
                expiryDate?: string | null;
            }[];
            history?: {
                from?: string | null;
                to?: string;
                /** Format: date-time */
                at?: string;
                actor?: string;
                note?: string | null;
            }[];
        };
        Balance: {
            /** Format: uuid */
            counterpartyId?: string;
            counterpartyName?: string;
            /** @enum {string} */
            connectionStatus?: "active" | "cancelled";
            currency?: components["schemas"]["CurrencyCode"];
            balance?: components["schemas"]["Decimal"];
            overdue?: components["schemas"]["Decimal"];
            dueNext7Days?: components["schemas"]["Decimal"];
        };
        DocumentRef: {
            /** Format: uuid */
            id?: string;
            /** @enum {string} */
            status?: "pending" | "ready" | "failed";
            /**
             * Format: uri
             * @description 5 dk geçerli
             */
            downloadUrl?: string | null;
        };
        ImportJob: {
            /** Format: uuid */
            id?: string;
            type?: string;
            /** @enum {string} */
            status?: "uploaded" | "validating" | "preview_ready" | "applying" | "done" | "failed";
            stats?: {
                insert?: number;
                update?: number;
                error?: number;
            };
            /** Format: uri */
            errorReportUrl?: string | null;
        };
        DashboardCard: {
            /** @example orders_pending_approval */
            key?: string;
            title?: string;
            value?: string;
            unit?: string | null;
            compareValue?: string | null;
            /** @description İstemci yönlendirme yolu ve filtre */
            link?: string;
        };
        AdminSeller: {
            /** Format: uuid */
            id: string;
            legalName: string;
            voen: string | null;
            /** Format: uuid */
            regionId: string;
            /** @enum {string} */
            status: "active" | "suspended" | "dormant" | "archived";
            /** Format: date-time */
            createdAt: string;
            /**
             * @description accepted = aktif admin üyeliği var; pending = süresi dolmamış açık davet var
             * @enum {string}
             */
            activation: "pending" | "accepted" | "expired";
        };
        /** @description Toptancı başvurusu (US-008). contactName ve phone kişisel veridir (yalnız platform). */
        SellerApplication: {
            /** Format: uuid */
            id: string;
            legalName: string;
            voen: components["schemas"]["Voen"];
            contactName: string;
            phone: components["schemas"]["PhoneE164"];
            /** Format: uuid */
            regionId: string;
            categoryNote: string | null;
            /** @enum {string} */
            status: "pending" | "approved" | "rejected";
            /**
             * Format: uuid
             * @description Onayda açılan işletme
             */
            businessId: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        AdminPlan: {
            /** Format: uuid */
            id: string;
            code: string;
            name: components["schemas"]["LocalizedText"];
            /** @enum {string} */
            capability: "seller" | "buyer";
            price: components["schemas"]["Decimal"];
            currencyCode: components["schemas"]["CurrencyCode"];
            /** @enum {string} */
            period: "month" | "year";
            isActive: boolean;
        };
        PlanInput: {
            code: string;
            name: components["schemas"]["LocalizedText"];
            /** @enum {string} */
            capability: "seller" | "buyer";
            price: components["schemas"]["Decimal"];
            currency: components["schemas"]["CurrencyCode"];
            /** @enum {string} */
            period: "month" | "year";
            entitlements: {
                [key: string]: unknown;
            };
        };
    };
    responses: {
        /** @description Hata */
        Error: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: {
        BusinessId: string;
        BusinessIdOptional: string;
        /** @description `web` → yenileme anahtarı yanıt gövdesinde dönmez, `b2b_rt` httpOnly cookie'sine yazılır (ADR-0006 madde 3, TM-04; F1.13a). Mobil başlığı göndermez; davranışı değişmez. */
        XClient: "web";
        /** @description Cookie ile yenilemede zorunlu (boş olmayan herhangi bir değer; web `fetch` gönderir); yoksa anahtar tüketilmeden `401 UNAUTHENTICATED` (CSRF, TM-21; F1.13a). */
        XRequestedWith: string;
        IdempotencyKey: string;
        Id: string;
        Cursor: string;
        Limit: number;
    };
    requestBodies: never;
    headers: {
        /** @description Yalnızca web (`X-Client: web` veya cookie ile yenileme): `b2b_rt=<anahtar>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=<auth.refresh_token_days>`. `Domain` yok; web API'yi kendi kökeninden çağırır (Next rewrite). Silme: aynı bayraklarla `b2b_rt=; Max-Age=0`. */
        SetRefreshCookie: string;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
