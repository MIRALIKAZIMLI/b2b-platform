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
                        /**
                         * Format: uuid
                         * @description Son kullanılan işletme (US-003 AC1, F2.7). Kullanıcının aktif üyeliği olmayan işletme `422 VALIDATION_FAILED`.
                         */
                        lastBusinessId?: string;
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
         * @description İzin `business.manage` (F2.4). Yalnız gönderilen alanlar değişir; boş gövde `422`. F2.4'te desteklenen alanlar `voen`, `legalName`, `regionId`, `addressLine`, `businessPhone`; F2.10b ile 🔒 `contactName`, `personalPhone`, `email` (`person_data`; telefon ve e-posta `null` ile silinir, yetkili adı silinemez) ve `logoFileId` (bu işletmenin hazır `logo` dosyası, aksi `422 details.logoFileId = [invalid_logo]`; `null` kaldırır, ADR-0024). Biçimi hatalı VÖEN `422 VALIDATION_FAILED`, `details.voen = [VOEN_INVALID]` (US-006 AC1). Başka işletmede kayıtlı VÖEN `409 VOEN_ALREADY_REGISTERED` (AC3). `legalType` VÖEN'in son hanesinden türetilir; VÖEN değişince `verified` false olur (AC2, R20). VARSAYIM (F2.4 K2): VÖEN yalnız `buyer` yeteneği olan işletmede değişir, aksi `403 CAPABILITY_REQUIRED`. VARSAYIM (K3): VÖEN silinemez; aynı değer değişiklik sayılmaz.
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
        /**
         * Görünürlük ayarları (US-007)
         * @description İzin `business.manage`, yetenek `buyer` (F2.10; VARSAYIM V1: yeteneği olmayan işletme `403 CAPABILITY_REQUIRED`). Yeni kayıtta `listedInDirectory` true, diğerleri false (AC1). Ünvan, faaliyet alanı ve şehir/rayon her zaman açıktır; anahtarları yoktur (AC3).
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
                /** @description Ayarlar */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Privacy"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
            };
        };
        /**
         * Görünürlük ayarlarını güncelle (US-007)
         * @description İzin `business.manage`, yetenek `buyer` (F2.10). Tam gövde: yedi anahtarın hepsi zorunlu, başka anahtar `422 VALIDATION_FAILED` (VARSAYIM V2; AC3 `showLegalName` gibi alan yok). Değişiklik varsa audit `business.privacy_updated` ve outbox `buyer.privacy_changed` (dizin indeksi, F2.11a). Yanıt güncel ayarlar.
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
            requestBody: {
                content: {
                    "application/json": components["schemas"]["Privacy"];
                };
            };
            responses: {
                /** @description Güncellendi; güncel ayarlar */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Privacy"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
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
    "/api/v1/branches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Şubeler (F2.5; yalnız `buyer` yeteneği)
         * @description İzin `business.manage` (T8; ekip ekranı şube listesini depolardaki gibi bu izinle doldurur). İşletmenin `buyer` yeteneği yoksa `403 CAPABILITY_REQUIRED`. Aktifler önce, sonra ada göre.
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
                        "application/json": components["schemas"]["Branch"][];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Şube oluştur (US-010 AC1, AC3)
         * @description `approvalRule` verilmezse `every_order` (AC3). `approvalThreshold` yalnız `above_amount`'ta ve orada zorunlu; > 0, en çok 2 ondalık. `lat` ve `lng` birlikte verilir. Bilinmeyen bölge 422.
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
                    "application/json": components["schemas"]["BranchInput"];
                };
            };
            responses: {
                /** @description Oluşturuldu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Branch"];
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
    "/api/v1/branches/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Şube */
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
                /** @description Şube */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Branch"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Şube güncelle / pasifleştir (US-010 AC4)
         * @description Kısmi. Silme ucu yoktur; şube `status: inactive` ile pasifleşir. Kural `above_amount` dışına geçince eşik silinir; `above_amount`'ta eşik (gelen ya da mevcut) yoksa 422. `lat`/`lng` birlikte; ikisi `null` konumu siler. Son aktif şube pasifleşemez: `409 INVALID_STATE_TRANSITION` (`reason: last_active_branch`). Aktif üyesi veya açık daveti olan şube pasifleşemez: `409 INVALID_STATE_TRANSITION` (`reason: branch_in_use`, `members`, `invitations`).
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
                    "application/json": components["schemas"]["BranchPatch"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Branch"];
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
        /**
         * Ekibin aktif üyeleri (US-013)
         * @description İzin `team.manage`. Yalnız bağlamdaki işletmenin `active` üyelikleri (F2.7a).
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
                        "application/json": components["schemas"]["TeamMember"][];
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
        /**
         * Üyenin rolünü / kapsamını değiştir veya çıkar (US-013)
         * @description İzin `team.manage`. Yalnız verilen alanlar değişir; boş gövde `422`. Rol işletmenin rolü ve işletmenin yeteneğinde olmalı. Kapsam rolden türetilir (F2.7 K9): rolde `branch` kapsamlı izin varsa üyeliğin şubesi, `warehouse` kapsamlı izin varsa deposu olmalı; gerekmeyen kapsam alanı veya `assigned` kapsamı olmayan rolde `regionIds` `422 VALIDATION_FAILED`. Başka işletmenin şubesi/deposu veya olmayan bölge `404`. `status: removed` üyeliği çıkarır (bölgeleri silinir); tek admin kendi rolünü düşüremez / kendini çıkaramaz → `409 LAST_ADMIN_PROTECTED` (US-013 AC3). Çıkarılmış üye yalnızca yeniden davetle döner (`status: active` gönderilemez). Rol değişikliği audit'e kim, kime, eski ve yeni rol yazar; sonraki istekte geçerli olur (US-013 AC4). Aktif olmayan veya başka işletmenin üyeliği `404`.
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
                        /** Format: uuid */
                        roleId?: string;
                        /** Format: uuid */
                        branchId?: string | null;
                        /** Format: uuid */
                        warehouseId?: string | null;
                        regionIds?: string[];
                        /** @enum {string} */
                        status?: "removed";
                    };
                };
            };
            responses: {
                /** @description Üyeliğin son hâli */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TeamMember"];
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
    "/api/v1/team/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Açık (kabul edilmemiş, süresi dolmamış) davetler */
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
                        "application/json": components["schemas"]["TeamInvitation"][];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Kullanıcı davet et (US-013)
         * @description İzin `team.manage`. Unvan aktif ve işletmenin yeteneğinde, rol işletmenin rolü olmalı; kapsam kuralı `PATCH /team/members/{id}` ile aynı (şube/depo). Telefon kayıtlı değilse kullanıcı satırı `fullName` ile oluşur, kayıtlıysa adı değişmez (F2.7 K1); yanıt iki durumda aynıdır. Telefon işletmede aktif üye → `409 MEMBER_ALREADY_EXISTS`. Aynı telefona açık davet varsa kapanır, yenisi gider (VARSAYIM K3). Planın `users.max` hakkı aktif üye + açık davet sayısıyla denetlenir; doluysa `403 ENTITLEMENT_LIMIT_REACHED` (US-013 AC2, VARSAYIM K2). Geçerlilik `invitation.team_days`. SMS (`WEB_BASE_URL/<dil>/activate?token=`) işlemden sonra gider; gönderilemezse davet kalır, `smsSent: false`. Kabul `POST /team/invitations/accept`.
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
                        phone: components["schemas"]["PhoneE164"];
                        fullName: string;
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
                /** @description Davet oluştu */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            invitationId: string;
                            /** Format: date-time */
                            expiresAt: string;
                            smsSent: boolean;
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
    "/api/v1/team/invitations/{id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Açık daveti geri çek (F2.7)
         * @description İzin `team.manage`. Davetin süresi şimdiye çekilir (`expires_at = now`); bağlantı artık kabul edilmez ve `users.max` sayacından düşer. Kabul edilmiş, süresi dolmuş veya başka işletmenin daveti `404`.
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
                /** @description Geri çekildi */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
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
         * @description Yalnızca giriş ister (işletme bağlamı yok). Oturumdaki kullanıcının telefonu davetteki telefonla aynı olmalıdır. Geçersiz, süresi dolmuş, kullanılmış, başka telefona ait davet veya kullanıcının zaten o işletmede aktif üyeliği varsa hepsi aynı `404 NOT_FOUND` döner (F2.1a). Kullanıcının o işletmede çıkarılmış (`removed`) üyeliği varsa aynı üyelik davetteki rol, unvan ve kapsamla yeniden aktif olur (F2.7a, VARSAYIM K5).
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
        /**
         * İşletme rolleri
         * @description İzin `team.manage`. İşletmenin yeteneğindeki roller, izinleri ve kapsamlarıyla; istemci hangi kapsam alanının gerektiğini buradan bilir. `isCustom` rolleri F2.8 özel rolleridir.
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
                        "application/json": components["schemas"]["TeamRole"][];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Şablondan özel rol oluştur (US-014)
         * @description İzin `team.manage`. Şablon işletmenin yeteneğinde olmalı; izinler rolün yeteneğine ait olmalı ve kapsam iznin kapsam seçeneklerinden biri olmalı (aksi `422`, US-014 AC2). Özel rol işletme admini değildir. İşletme admini olmayan çağıran yalnızca kendisinde aynı kapsamda veya `all` kapsamda olan izinleri ekleyebilir (aksi `403 PERMISSION_DENIED`).
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
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        templateId: string;
                        name: components["schemas"]["RoleName"];
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
                    content: {
                        "application/json": components["schemas"]["TeamRole"];
                    };
                };
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
    "/api/v1/team/roles/{id}": {
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
         * Özel rolü düzenle (US-014)
         * @description İzin `team.manage`. Yalnızca `isCustom` roller (şablon kopyası `422 roleId: not_editable`). `POST` ile aynı izin kuralları. Rol bir aktif üyeye veya açık davete bağlıyken gereken kapsam alanları (şube / depo / bölge) değişemez (`422 permissions: scope_change_in_use`). İzin değişince rolün üyelerinin izin önbelleği temizlenir; değişiklik sonraki istekte geçerlidir.
         */
        patch: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name?: components["schemas"]["RoleName"];
                        permissions?: components["schemas"]["RolePermission"][];
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TeamRole"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/team/role-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Özel rol için kopyalanabilir şablonlar (US-014)
         * @description İzin `team.manage`. İşletmenin yeteneğindeki rol şablonları, varsayılan izin ve kapsamlarıyla.
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
                        "application/json": components["schemas"]["RoleTemplate"][];
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
        patch?: never;
        trace?: never;
    };
    "/api/v1/team/job-titles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Davet formu için unvanlar (F2.7)
         * @description İzin `team.manage`. İşletmenin yeteneğindeki aktif unvanlar; `roleTemplateId` istemcinin önerilen rolü seçmesi içindir (işletme rolü `sourceTemplateId` ile eşleşir).
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
                        "application/json": components["schemas"]["JobTitle"][];
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
        /**
         * Perakendeci dizini (US-019, US-020) — yalnızca seller
         * @description İzin `directory.search` (kapsam `all` / `assigned`). Filtre verilmezse yalnız toptancının
         *     hizmet bölgeleri (US-019 AC2); `assigned` kapsamlı üye yalnız atandığı bölgeleri görür,
         *     tam telefon / VÖEN araması dahil (US-019 AC3; F2.11b K3, kullanıcı değiştirebilir varsayım).
         *     `phone` veya `voen` tek başına verilir (diğer filtrelerle veya birlikte → 422); dizinde
         *     görünme kapalı perakendeciyi de bulur, kısmi değer eşleşmez (US-020). Kullanıcı başına
         *     dakikada `directory.search_max_per_minute` (60) arama; aşınca 429 + `Retry-After`
         *     (US-019 AC5). Dışa aktarma ucu yoktur (US-019 AC4). `history` (F2.12a): çağıran satıcının
         *     ilişki durumuna göre sayfa içinde süzülür (sayfa `limit`'ten kısa olabilir; `nextCursor` indeks sırasıdır).
         */
        get: {
            parameters: {
                query?: {
                    /** @description Ünvanda arama */
                    q?: string;
                    /** @description Tam E.164 eşleşme: işletme, kişisel veya admin giriş telefonu */
                    phone?: components["schemas"]["PhoneE164"];
                    /** @description Tam eşleşme */
                    voen?: components["schemas"]["Voen"];
                    /** @description Şehir verilirse ilçeleri de kapsar */
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
                            items: components["schemas"]["DirectoryBuyer"][];
                            nextCursor: string | null;
                            /**
                             * @description Liste neden boş (istemci hizmet bölgesi / bölge atama ekranına yönlendirir)
                             * @enum {string|null}
                             */
                            emptyReason: "no_service_areas" | "no_assigned_regions" | null;
                        };
                    };
                };
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
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
        /**
         * Bağlantı isteği gönder (US-021)
         * @description İzin `connections.request.send` (F2.12a). Kurallar sırasıyla (SF-03): aktif bağlantı (`409 CONNECTION_ALREADY_ACTIVE`),
         *     bekleyen istek (`409 CONNECTION_REQUEST_ALREADY_PENDING`), engel (`409 CONNECTION_BLOCKED`), bekleme süresi
         *     (`409 CONNECTION_COOLDOWN_ACTIVE`, `details.cooldownUntil`), günlük kota (`429 CONNECTION_DAILY_QUOTA_EXCEEDED`,
         *     `details.retryAfter` + `Retry-After` = satıcının saat diliminde gece yarısına kalan saniye). Etkin kota =
         *     `connection.daily_request_quota` ayarı ile plan hakkı `connection_requests.daily`'nin küçüğü (hak `null` = ayar).
         *     İstek alamayan perakendeci (yok, askıda/arşivde, `buyer` onaysız, çağıranın kendisi) veya temsilcinin
         *     (`assigned`) bölgesi dışındaki perakendeci `404 NOT_FOUND`. Salt-okunur abonelik `403 SUBSCRIPTION_READ_ONLY`.
         */
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
                        /** @description Baştaki/sondaki boşluk atılır; boş mesaj gönderilmemiş sayılır */
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
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
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
    "/api/v1/connection-requests/outgoing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Gönderilen istekler (seller), yeniden eskiye
         * @description İzin `connections.request.send`; temsilci (`assigned`) yalnız kendi gönderdiklerini görür (F2.12a). `limit` en fazla 50.
         */
        get: {
            parameters: {
                query?: {
                    cursor?: components["parameters"]["Cursor"];
                    limit?: number;
                    status?: "pending" | "accepted" | "rejected" | "expired" | "withdrawn";
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
                    content: {
                        "application/json": {
                            items: (components["schemas"]["ConnectionRequest"] & {
                                /** @description Perakendecinin ünvanı; artık istek alamıyorsa null */
                                buyerName: string | null;
                            })[];
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
    "/api/v1/connection-requests/incoming": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Gelen bekleyen istekler (buyer) — satıcı profil özetiyle (US-023 AC1, AC6)
         * @description İzin `connections.view` (satın alma sorumlusu da görür, US-023 AC6). Yalnız `pending` ve süresi geçmemiş
         *     istekler (US-022 AC1, US-023 AC3), yeniden eskiye. Satıcı özeti yalnız ünvan, logo, tanıtım metni;
         *     ürün, fiyat, başka bağlantı bilgisi yok (F2.13a, R19). `limit` en fazla 50.
         */
        get: {
            parameters: {
                query?: {
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
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: (components["schemas"]["ConnectionRequest"] & {
                                seller: components["schemas"]["ConnectionSellerSummary"];
                            })[];
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
    "/api/v1/connection-requests/{id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * İsteği kabul et (US-023 AC2)
         * @description İzin `connections.request.respond` (yalnız `buyer`). Gövde veri paylaşım uyarısının onayıdır
         *     (`confirmDataSharing: true`, yoksa `422`); onay audit'e yazılır. İstek `accepted`, yeni `active` bağlantı;
         *     bağlantı vadesi 0 (önerilen vade yazılmaz, satıcı koşul ekranında öneri olarak görür; kullanıcı kararı
         *     2026-11-10). Başka perakendecinin isteği `404`; `pending` değilse
         *     `409 INVALID_STATE_TRANSITION`; süresi geçmişse `409 CONNECTION_REQUEST_EXPIRED`. Satıcı askıda veya
         *     salt-okunur olsa da kabul yapılır (SF-03).
         */
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
            requestBody: {
                content: {
                    "application/json": {
                        /** @constant */
                        confirmDataSharing: true;
                    };
                };
            };
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
    "/api/v1/connection-requests/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * İsteği reddet (US-023 AC3)
         * @description İzin `connections.request.respond`. Bekleme süresi başlar. Başka perakendecinin isteği `404`; `pending` değilse `409 INVALID_STATE_TRANSITION`; süresi geçmişse `409 CONNECTION_REQUEST_EXPIRED`.
         */
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
                /** @description Reddedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ConnectionRequest"];
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
    "/api/v1/connection-requests/{id}/withdraw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * İsteği geri çek (US-022 AC1)
         * @description İzin `connections.request.send`. Temsilci (`assigned`) yalnız kendi gönderdiğini çeker; başkasınınki ve başka
         *     satıcının isteği `404`; `pending` değilse `409 INVALID_STATE_TRANSITION`. Kota iadesi yok (US-022 AC2).
         */
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
                /** @description Geri çekildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ConnectionRequest"];
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
    "/api/v1/connections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Bağlantılarım (seller veya buyer bakışı) (US-024 AC1, AC3)
         * @description İzin `connections.view`. Bakış işletmenin yeteneğinden: satıcıda karşı taraf perakendeci, alıcıda toptancı.
         *     Satıcıda `assigned` kapsamlı üye (temsilci) yalnız kendisine atanmış bağlantıları görür. Alıcı bakışında
         *     koşullardan yalnız `creditLimit` ve `paymentTermDays` döner; `suggestedTerms` yalnız satıcı bakışında ve
         *     koşul atanmamış aktif bağlantıda (önce önceki iptal edilmiş bağlantının atanmış koşulları, yoksa isteğin
         *     önerilen vadesi; F2.14a). Yeniden eskiye; `limit` en fazla 50.
         */
        get: {
            parameters: {
                query?: {
                    status?: "active" | "cancelled";
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
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ConnectionPage"];
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
    "/api/v1/connections/sales-reps": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Koşul ekranı için temsilci seçenekleri (US-024 AC2) — yalnızca seller
         * @description İzin `connections.terms.manage`. Satıcının satış temsilcisi rolündeki (`seller_sales_rep` şablonundan
         *     kopyalanan veya türetilen rol) aktif üyeleri; yalnız üyelik kimliği ve ad (telefon, rol yok).
         *     `PATCH .../terms` temsilci kuralıyla aynı küme (F2.14b; kullanıcı kararı 2026-11-10, B).
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
                        "application/json": {
                            items: {
                                /** Format: uuid */
                                membershipId: string;
                                fullName: string;
                            }[];
                        };
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
        /**
         * Bağlantı koşulları (US-024 AC2) — yalnızca seller
         * @description İzin `connections.terms.manage` (yalnız `seller`, kapsam `all`; temsilci yalnız görür). Kısmi güncelleme,
         *     en az bir alan. Alıcı bu koşulları hiçbir yoldan değiştiremez (veritabanı bekçisi de reddeder). F3.6a:
         *     `priceListId` satıcının aktif fiyat listesi veya `null` (varsayılan liste); başka satıcının veya arşivli
         *     liste `422` (`priceListId: [invalid_price_list]`). Şube fiyatı F3.8'e kadar kapalı: `branchPricingEnabled`
         *     yalnız `false`. Temsilci satıcının aktif üyesi olmalı (`422`). Başka işletmenin bağlantısı `404`; iptal edilmiş
         *     bağlantı `409 INVALID_STATE_TRANSITION`. Audit `connection.terms_updated`. Idempotency-Key gerekmez (PATCH).
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
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ConnectionTermsUpdate"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Connection"];
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
    "/api/v1/connections/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Bağlantıyı iptal et (US-025)
         * @description İzin `connections.cancel` (satıcı veya alıcı, kapsam `all`). Yalnız `active` bağlantı; çağıran tarafın
         *     gerekçesi ve ikinci onayı (`confirm: true`, yoksa `422 CONFIRMATION_REQUIRED`). Tek işlemde (F2.15a, SF-07):
         *     bağlantı `cancelled` (`ended_by_side` = çağıranın tarafı, `end_reason` = `reason`, `ended_at`,
         *     `ended_by_user_id`), `ConnectionCancelledHandler` kancaları (sepet kalemleri, `submitted` siparişler; F4.5),
         *     olay `connection.cancelled`, karşı tarafın aktif adminlerine bildirim, audit `connection.cancelled`
         *     (`note` yalnız audit'te, Mimar K1). Alıcı iptali bekleme süresi başlatır, satıcı iptali başlatmaz.
         *     Karşı taraf gerekçeyi görmez, yalnız `endedBySide` (K2). Başka çiftin bağlantısı `404`; iptal edilmiş
         *     bağlantı `409 INVALID_STATE_TRANSITION`.
         */
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
            requestBody: {
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
                            /** @description İptal edilen `submitted` sipariş sayısı (F4.5 öncesi 0) */
                            cancelledOrders: number;
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
    "/api/v1/blocks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Engellenen toptancılar (buyer), yeniden eskiye
         * @description İzin `connections.block` (F2.13a).
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
                        "application/json": {
                            items: components["schemas"]["BlockedSeller"][];
                        };
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Toptancıyı engelle (US-023 AC4)
         * @description İzin `connections.block`. Tek işlemde: engel kaydı, çiftin bekleyen isteği `rejected`, aktif bağlantısı
         *     `cancelled` (`ended_by_side = buyer`, `end_reason = blocked`, olay `connection.cancelled`). Yalnız çağıranla
         *     isteği, bağlantısı veya engeli olan satıcı; değilse `404`. Tekrar çağrı aynı kaydı döner (`201`).
         */
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
                    content: {
                        "application/json": components["schemas"]["BlockedSeller"];
                    };
                };
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
        /**
         * Engeli kaldır (US-023 AC5)
         * @description İzin `connections.block`. Engel yoksa da `204`. Satıcı yeniden istek gönderebilir (bekleme süresi kurallarıyla).
         */
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
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
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
        /**
         * Birim kataloğu (F3.1, US-028 AC1)
         * @description Giriş yapmış her kullanıcı (`@Authenticated`, işletme bağlamı gerekmez). Yalnız aktif birimler (kod sırasıyla) ve iki ucu da aktif olan dönüşümler. Ürün formu (F3.3) bu listeden seçer.
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
                        "application/json": components["schemas"]["UnitCatalog"];
                    };
                };
                401: components["responses"]["Error"];
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
        /**
         * Kategori ağacı (F3.2a, US-029)
         * @description Giriş yapmış her kullanıcı (`@Authenticated`). Düz liste (seviye, sıra); yalnız kendisi ve bütün üstleri aktif düğümler (pasif üstün altı da gizlenir, AC4). Ağaç istemcide `parentId` ile kurulur; en çok 3 seviye.
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
                        "application/json": components["schemas"]["Category"][];
                    };
                };
                401: components["responses"]["Error"];
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
        /**
         * Markalar (F3.2a)
         * @description Giriş yapmış her kullanıcı. Yalnız onaylı (`active`) ve aktif markalar, ada göre; onay bekleyen talepler dönmez (V5; toptancı kendi taleplerini `GET /catalog/brand-requests` ile görür). `q` adın içinde büyük/küçük harf duyarsız arar.
         */
        get: {
            parameters: {
                query?: {
                    q?: string;
                    limit?: number;
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
                        "application/json": components["schemas"]["BrandOption"][];
                    };
                };
                401: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Marka talebi (US-029 AC2)
         * @description İzin `catalog.manage` (yetenek `seller`). Talep `requested` durumunda açılır, admin onayına düşer; onaylanana kadar yalnız talep eden toptancı görür (V5). Ad büyük/küçük harf ve kenar boşluğu duyarsız tektir: aktif marka veya bekleyen başka bir talep aynı adı taşıyorsa 422 `name: [taken]` (kimin talep ettiği söylenmez; reddedilen ad yeniden talep edilebilir, K1). İşletme başına kayan 24 saatte en çok `catalog.brand_request_daily_limit` talep (varsayılan 10, K2); aşılırsa 429 `RATE_LIMITED`.
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
            requestBody: {
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
                    content: {
                        "application/json": components["schemas"]["BrandRequest"];
                    };
                };
                403: components["responses"]["Error"];
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
    "/api/v1/catalog/brand-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Toptancının kendi marka talepleri (F3.2a)
         * @description İzin `catalog.view` (yetenek `seller`). Bekleyen, onaylanan ve reddedilen talepler, yeniden eskiye (en çok 500).
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
                        "application/json": components["schemas"]["BrandRequest"][];
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
        /**
         * Kendi ürünlerim (seller; F3.3a)
         * @description İzin `catalog.view` (yetenek `seller`); perakendeci 403. Yeniden eskiye, imleçli. `q`: SKU öneki veya herhangi bir dildeki ad (içerir, büyük/küçük harf duyarsız). Ad bütün dilleriyle döner; gösterim dili istemcide (`pickLocalizedText`, US-030 AC4).
         */
        get: {
            parameters: {
                query?: {
                    q?: string;
                    status?: "draft" | "active" | "archived";
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
                    content: {
                        "application/json": {
                            items: components["schemas"]["ProductListItem"][];
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
         * Ürün oluştur (US-030 AC1, AC2, AC5)
         * @description İzin `catalog.manage` (yetenek `seller`). Ürün her zaman `draft` açılır. Kategori görünür (kendisi ve üstleri aktif) olmalı; marka aktif veya toptancının kendi bekleyen talebi (V5); birimler aktif. Ambalaj kuralları (F3.3a K4): varyantta seviye tek; seviye sırasıyla (`unit` < `inner` < `case` < `pallet`) `baseQty` kesin artar; `unit` seviyesinde `baseQty = 1` ve `unitCode = baseUnitCode`; ondalığa izin vermeyen birimde tam sayı; en az bir satış birimi; `minOrderQty` `orderMultiple`'ın katı. Ürün ve varyant SKU'su satıcı içinde tek (422 `sku: [taken]` / `variants.sku: [taken]`). `hasExpiry` ise `shelfLifeMonths` zorunlu (US-030 AC5). Görünürlük F3.3a'da yalnız bölge.
         */
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
            requestBody: {
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
                403: components["responses"]["Error"];
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
    "/api/v1/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ürün detayı (seller)
         * @description İzin `catalog.view`. Arşivli varyantlar durumuyla döner. Başka kiracının ürünü 404.
         */
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
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Ürün güncelle / yayınla / arşivle / geri al (US-030 AC6)
         * @description İzin `catalog.manage`. Kısmi. `variants` verilirse tam listedir: `id`'li varyant güncellenir (arşivliyse yeniden etkinleşir), `id`'siz eklenir, listede olmayan arşivlenir (silinmez; arşivli SKU yeniden kullanılamaz). Ambalaj seviyeye göre eşlenir: var olan seviye kimliğini korur. `visibility` verilirse tam liste. `status` geçişleri state-machines §14: `draft → active` (marka boş veya onaylı, aksi 422 `brandId: [not_approved]`), `draft|active → archived`, `archived → draft`; başka geçiş 409 `INVALID_STATE_TRANSITION`. Arşivdeki ürün düzenlenmez (409). Daha önce kaydedilmiş, sonradan pasifleşen kategori, marka veya birim üründe kalabilir; yeni seçilen kayıt aktif olmalı (422 `inactive`).
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
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ProductUpdate"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Product"];
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
    "/api/v1/products/{id}/images": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ürüne görsel ekle (US-030 AC3, F3.4a)
         * @description İzin `catalog.manage`. `fileId`, F1.10 akışıyla (`/files/upload-url` → yükleme → `/files/{id}/complete`) `ready` olmuş `product_image` dosyasıdır. Görsel `processing` döner; worker 200/800/1600 px WebP üretir, sonra `ready` (ürün yanıtında `urls`). İşlenemeyen görsel `failed` kalır, ürün etkilenmez. Ürün başına en çok `catalog.product_images_max` (8) görsel (işlenen ve başarısız dahil) → 422 `fileId: [limit]`. Başka amaçlı veya `ready` olmayan dosya 422 `fileId: [invalid]`; başka görsele bağlı dosya 422 `fileId: [in_use]`; başka işletmenin dosyası veya ürünü 404. Arşivdeki ürün 409 `INVALID_STATE_TRANSITION`.
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
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        fileId: string;
                    };
                };
            };
            responses: {
                /** @description Eklendi (`processing`) */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProductImage"];
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
    "/api/v1/products/{id}/images/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Görsel sırasını değiştir (F3.4a)
         * @description İzin `catalog.manage`. `imageIds` ürünün bütün görselleridir, her biri bir kez; ilk görsel kapak. Eksik, fazla veya tekrarlı liste 422 `imageIds: [mismatch]`. Arşivdeki ürün 409.
         */
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
            requestBody: {
                content: {
                    "application/json": {
                        imageIds: string[];
                    };
                };
            };
            responses: {
                /** @description Sıra kaydedildi */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                409: components["responses"]["Error"];
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
    "/api/v1/products/{id}/images/{imageId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Görseli üründen kaldır (F3.4a)
         * @description İzin `catalog.manage`. Başka ürünün veya kiracının görseli 404. Arşivdeki ürün 409.
         */
        delete: {
            parameters: {
                query?: never;
                header: {
                    "X-Business-Id": components["parameters"]["BusinessId"];
                };
                path: {
                    id: components["parameters"]["Id"];
                    imageId: string;
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
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                409: components["responses"]["Error"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
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
        /**
         * Fiyat listeleri (US-034)
         * @description F3.6a. İzin `pricing.view` (yetenek `seller`). Aktif ve arşivli listeler; önce varsayılan, sonra ada göre.
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
                        "application/json": {
                            items: components["schemas"]["PriceList"][];
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Fiyat listesi oluştur (US-034 AC1)
         * @description F3.6a. İzin `pricing.manage`. Satıcının ilk listesi `isDefault` verilmese de varsayılan olur; `isDefault: true`
         *     önceki varsayılanı düşürür (satıcı başına tek varsayılan, K1). Para birimi satıcının para birimi olmalı,
         *     değilse `422 CURRENCY_MISMATCH` (K6). Audit `price_list.created`.
         */
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
            requestBody: {
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
                    content: {
                        "application/json": components["schemas"]["PriceList"];
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
    "/api/v1/price-lists/{id}": {
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
         * Fiyat listesini düzenle, varsayılan yap, arşivle veya geri al
         * @description F3.6a. İzin `pricing.manage`. Kısmi, en az bir alan. Para birimi değişmez. Varsayılanlık yalnız başka liste
         *     `isDefault: true` yapılarak devredilir; varsayılan liste arşivlenemez: `409 PRICE_LIST_DEFAULT_PROTECTED` (K3).
         *     Aktif bir bağlantıya atanmış liste arşivlenemez: `409 PRICE_LIST_IN_USE` (K2 = A, kullanıcı kararı).
         *     Durum geçişleri state-machines §15; arşivli liste varsayılan yapılamaz (`409 INVALID_STATE_TRANSITION`).
         *     Başka satıcının listesi `404`. Audit `price_list.updated`, `price_list.archived`, `price_list.restored`.
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
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PriceListUpdate"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PriceList"];
                    };
                };
                404: components["responses"]["Error"];
                409: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/price-lists/{id}/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listedeki fiyatlar (geçerli ve ileri tarihli)
         * @description F3.6a. İzin `pricing.view`. Fiyatı olan her ambalaj seviyesi için şu an geçerli fiyat ve henüz geçerli
         *     olmayan fiyatlar. Sayfalama ambalaj kimliğine göre (`cursor` = son `packagingId`).
         */
        get: {
            parameters: {
                query?: {
                    cursor?: components["parameters"]["Cursor"];
                    limit?: components["parameters"]["Limit"];
                };
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
                /** @description Liste */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: components["schemas"]["PriceListItem"][];
                            nextCursor: string | null;
                        };
                    };
                };
                404: components["responses"]["Error"];
            };
        };
        /**
         * Liste fiyatlarını toplu ayarla (geçerlilik tarihiyle; US-034 AC6)
         * @description F3.6a. İzin `pricing.manage`. Fiyat satış birimi (ambalaj seviyesi) başınadır. `validFrom` verilmezse fiyat
         *     hemen geçerli olur; verilirse yarın veya sonraki bir gündür ve o gün toptancının saat diliminde
         *     (`businesses.timezone`) 00:00'da geçerli olur (K4); bugün veya geçmiş gün `422`. Henüz geçerli olmayan bir
         *     fiyat aynı günle yeniden gönderilirse güncellenir; geçerli olmuş fiyat değişmez, yeni satır eklenir (K5).
         *     Ambalaj seviyesi aynı satıcının olmalı (`422`, `items.<i>.packagingId: [not_found]`). Arşivli listeye
         *     yazılamaz (`409 INVALID_STATE_TRANSITION`). Tek işlem; audit `price_list.items_set` (satır sayısı, gün).
         */
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
            requestBody: {
                content: {
                    "application/json": {
                        /**
                         * Format: date
                         * @description Toptancının takvim günü (YYYY-MM-DD)
                         */
                        validFrom?: string;
                        items: {
                            /** Format: uuid */
                            packagingId: string;
                            unitPrice: string;
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
                    content: {
                        "application/json": {
                            count: number;
                            /** Format: date-time */
                            validFrom: string;
                        };
                    };
                };
                404: components["responses"]["Error"];
                409: components["responses"]["Error"];
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
        /**
         * Bir alıcı için fiyatın kaynağını göster (US-034 AC5)
         * @description F3.6a. İzin `pricing.view`; `assigned` kapsamlı üye (temsilci) yalnız kendisine atanmış müşteriyi görür.
         *     Alıcıyla aktif bağlantı yoksa `404`. Sıra ADR-0019; F3.6a'da kaynaklar atanmış liste ve varsayılan liste
         *     (müşteri fiyatı F3.7, şube fiyatı ve indirimi F3.8, kademe F3.9). `branchId` F3.8'e kadar yok sayılır.
         */
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
                /** @description Çözümlenen fiyat ve kaynağı */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PriceExplanation"];
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
        /**
         * Perakendeciler (F2.18, US-015 AC1; platform rolü super_admin, operations, support)
         * @description Filtre: `all` (arşivliler hariç), `voen_pending` (VÖEN girilmiş, doğrulanmamış; moderasyon kuyruğu), `dormant` (bağlantısız hesap aşaması, F2.17 doldurur), `suspended`. Yeniden eskiye.
         */
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
                    content: {
                        "application/json": {
                            items: components["schemas"]["AdminBuyer"][];
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
    "/api/v1/admin/buyers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Perakendeci kaydı (F2.18, US-015 AC1; super_admin, operations, support)
         * @description Toptancı, arşivli veya olmayan kayıt `404`. e-taxes.gov.az bağlantısı istemcide.
         */
        get: {
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
                /** @description Kayıt */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminBuyer"];
                    };
                };
                403: components["responses"]["Error"];
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
    "/api/v1/admin/buyers/{id}/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * VÖEN doğrula / reddet (F2.18, US-015 AC2; super_admin, operations)
         * @description `verify`: `verified_at`, `verified_by` yazılır; dizinde rozet ve üstte sıralama. `reject`: VÖEN (ve türetilen hukuki tip) temizlenir; perakendecinin aktif adminlerine `voen_rejected` bildirimi (metin gerekçe koduna göre). Gerekçe sabit kod listesidir (outbox yükü ve bildirim serbest metin taşımaz, ADR-0010 §3); `note` yalnız audit'e yazılır. VÖEN yoksa `422 VOEN_REQUIRED`; zaten doğrulanmışsa `409 INVALID_STATE_TRANSITION`.
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
            requestBody: {
                content: {
                    "application/json": {
                        /** @constant */
                        decision: "verify";
                    } | {
                        /** @constant */
                        decision: "reject";
                        /** @enum {string} */
                        reason: "voen_not_found" | "name_mismatch" | "voen_inactive" | "other";
                        /** @description Yalnız audit; perakendeciye gitmez */
                        note?: string;
                    };
                };
            };
            responses: {
                /** @description Güncel kayıt */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminBuyer"];
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
    "/api/v1/admin/businesses/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Askıya al / kaldır / sil (F2.18, US-016 AC1–AC3; super_admin, operations)
         * @description Geçişler `BusinessStateMachine` ile (state-machines §9); tablo dışı `409 INVALID_STATE_TRANSITION`. `suspend` / `unsuspend` her işletmede: kullanıcıları işletme bağlamlı uçlarda `403 BUSINESS_SUSPENDED` alır, dizinden düşer; bağlantı, istek ve siparişler değişmez (AC1). `archive` (= admin "sil") yalnız perakendecide (değilse `422`): geçmişi (bağlantı, bağlantı isteği, engel; sipariş/belge/cari F3–F5) yoksa kayıt ve kişisel veri kalıcı silinir (`outcome: deleted`, AC3); varsa arşivlenir, `person_data` silinir, açık davetler kapanır, aktif bağlantılar platformca kapanır (`ended_by_side = platform`, `end_reason = business_archived`; toptancı adminlerine "bağlantı iptal edildi") (AC2). Arşivli veya olmayan işletme `404`. `reason` yalnız audit'te.
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
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        action: "suspend" | "unsuspend" | "archive";
                        reason: string;
                    };
                };
            };
            responses: {
                /** @description Sonuç */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            outcome: "updated" | "archived" | "deleted";
                            /**
                             * @description Kalıcı silmede null
                             * @enum {string|null}
                             */
                            status: "active" | "suspended" | "archived" | null;
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
        /**
         * Ayarlar (kapsam ile; US-017, F2.19; platform rolü super_admin)
         * @description Kayıttaki (`packages/shared/src/settings.ts`) her anahtar için bu kapsamdaki değer (yoksa `null`) ve bu kapsamda değer olmasaydı geçerli olacak miras değer ile kaynağı döner. Miras: platform kapsamında kod varsayılanı; plan kapsamında platform → varsayılan; işletme kapsamında işletmenin güncel aboneliğinin planı → platform → varsayılan. `scope=platform` iken `scopeId` verilmez; `plan` ve `business` için zorunludur. Olmayan plan veya işletme `404`.
         */
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
                /** @description Ayarlar (kayıt sırasıyla) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            scope: "platform" | "plan" | "business";
                            /** Format: uuid */
                            scopeId: string | null;
                            items: components["schemas"]["AdminSettingItem"][];
                        };
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        /**
         * Ayar güncelle (US-017; platform rolü super_admin)
         * @description Değer anahtarın tipine, alt/üst sınırına ve çapraz kuralına (`dormant.*`) uymazsa `422 SETTING_OUT_OF_RANGE` (US-017 AC3). Anahtar bu kapsamda yazılamıyorsa (`scopes`, US-017 "Kapsam") `422 SETTING_SCOPE_NOT_ALLOWED`. Eski ve yeni değer aynı işlemde audit'e yazılır (`setting.updated`, US-017 AC2). Olmayan plan veya işletme `404`. Yanıt, güncellenen anahtarın bu kapsamdaki güncel hâlidir.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
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
                    content: {
                        "application/json": components["schemas"]["AdminSettingItem"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
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
        /**
         * Genel katalog kaydı oluştur (regions)
         * @description Unvan ve rol şablonu (`job-titles`, `role-templates`, F2.9), birimler (`units`, `unit-conversions`, F3.1), kategori, marka ve faaliyet alanı (`categories`, `brands`, `activity-types`, F3.2a) kendi yollarında tanımlıdır.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kind: "regions";
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
    "/api/v1/admin/catalog/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Kategoriler, pasifler dahil (F3.2a, US-029)
         * @description Platform rolü `super_admin` veya `content` (F2.9 V1 ile aynı). Düz liste (seviye, sıra).
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
                        "application/json": components["schemas"]["Category"][];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Kategori oluştur (US-029 AC1)
         * @description `parentId` yoksa üst kategori (seviye 1). Üst yoksa 422 `parentId: [not_found]`, pasifse `parentId: [inactive]`, 3. seviyedeyse `parentId: [max_depth]` (ağaç ≤ 3). Aynı üst altında herhangi bir dilde aynı ad 422 `name: [taken]` (K3). Üst kategori sonradan değişmez (K4).
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
                        /** Format: uuid */
                        parentId?: string | null;
                        name: components["schemas"]["CatalogName"];
                        sortOrder?: components["schemas"]["SortOrder"];
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
                        "application/json": components["schemas"]["Category"];
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
    "/api/v1/admin/catalog/categories/{id}": {
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
         * Kategoriyi güncelle / pasifleştir
         * @description Silme ucu yoktur (R38): kategori yalnız pasifleşir. Pasif kategori ve altı ürün formu listesinde görünmez; onu kullanan kayıtlar etkilenmez.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CatalogEntryPatch"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Category"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/admin/catalog/brands": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Markalar ve marka talepleri (F3.2a, US-029 AC2)
         * @description Platform rolü `super_admin` veya `content`. Yeniden eskiye, en çok 500; `status=requested` onay kuyruğudur. Talep eden işletme `requestedBy` alanında.
         */
        get: {
            parameters: {
                query?: {
                    status?: "requested" | "active" | "rejected";
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
                    content: {
                        "application/json": components["schemas"]["AdminBrand"][];
                    };
                };
                403: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Marka oluştur (US-029 AC1)
         * @description Admin markası doğrudan `active` açılır. Ad tekliği `POST /catalog/brands` ile aynı (422 `name: [taken]`).
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
                        name: string;
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
                        "application/json": components["schemas"]["AdminBrand"];
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
    "/api/v1/admin/catalog/brands/{id}": {
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
         * Marka talebini onayla / reddet, adı düzelt, pasifleştir
         * @description `status`: `requested → active` (onay) veya `requested → rejected` (red); başka geçiş 409 `INVALID_STATE_TRANSITION` (state-machines §13). Karar talebi gönderen (hâlâ aktif üyeyse) ve toptancının aktif adminlerine bildirilir (`brand_request_approved` / `brand_request_rejected`). `isActive` yalnız `active` markada değişir (aksi 409). Silme ucu yoktur (R38).
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name?: string;
                        /** @enum {string} */
                        status?: "active" | "rejected";
                        isActive?: boolean;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminBrand"];
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
    "/api/v1/admin/catalog/activity-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Faaliyet alanları, pasifler dahil (F3.2a)
         * @description Platform rolü `super_admin` veya `content`. Kayıt formu listesi `GET /catalog/activity-types` (yalnız aktifler).
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
                        "application/json": components["schemas"]["ActivityTypeAdmin"][];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Faaliyet alanı oluştur (US-029 AC1)
         * @description Herhangi bir dilde var olan bir adla 422 `name: [taken]`.
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
                        name: components["schemas"]["CatalogName"];
                        sortOrder?: components["schemas"]["SortOrder"];
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
                        "application/json": components["schemas"]["ActivityTypeAdmin"];
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
    "/api/v1/admin/catalog/activity-types/{id}": {
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
         * Faaliyet alanını güncelle / pasifleştir
         * @description Silme ucu yoktur (R38). Pasif tür kayıt formunda görünmez; onu seçmiş perakendeciler etkilenmez.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CatalogEntryPatch"];
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ActivityTypeAdmin"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/admin/catalog/units": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Birimler (pasifler dahil) ve dönüşümler (F3.1, US-028)
         * @description Platform rolü `super_admin` veya `content` (F2.9 V1 ile aynı).
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
                        "application/json": components["schemas"]["UnitCatalog"];
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Birim oluştur (US-028 AC1)
         * @description Aktif açılır ve ürün formunda hemen seçilebilir. `code` benzersiz (aksi 422 `code: [taken]`); `code` ve `kind` sonradan değişmez. Toptancı kullanıcısının birim açma yolu yoktur (AC4).
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
                        code: components["schemas"]["UnitCode"];
                        kind: components["schemas"]["UnitKind"];
                        name: components["schemas"]["CatalogName"];
                        abbreviation: components["schemas"]["UnitAbbreviation"];
                        allowsDecimal: boolean;
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
                        "application/json": components["schemas"]["Unit"];
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
    "/api/v1/admin/catalog/units/{code}": {
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
         * Birimi güncelle / pasifleştir (US-028 AC3)
         * @description Silme ucu yoktur: birim yalnız pasifleştirilir (AC3, R38). Pasif birim `GET /catalog/units`'te görünmez; onu kullanan kayıtlar etkilenmez.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    code: components["schemas"]["UnitCode"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name?: components["schemas"]["CatalogName"];
                        abbreviation?: components["schemas"]["UnitAbbreviation"];
                        allowsDecimal?: boolean;
                        isActive?: boolean;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Unit"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/admin/catalog/unit-conversions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Dönüşüm oranı kaydet (US-028 AC2)
         * @description `1 fromCode = factor toCode` (ör. 1 KGM = 1000 GRM). Varsa oran güncellenir. İki birim var olmalı (aksi 422 `fromCode|toCode: [not_found]`), aynı türde olmalı (`toCode: [kind_mismatch]`), farklı olmalı (`toCode: [same_unit]`); ters yön kayıtlıysa `toCode: [reverse_exists]`.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        fromCode: components["schemas"]["UnitCode"];
                        toCode: components["schemas"]["UnitCode"];
                        factor: components["schemas"]["UnitFactor"];
                    };
                };
            };
            responses: {
                /** @description Kaydedildi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UnitConversion"];
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
    "/api/v1/admin/catalog/unit-conversions/{fromCode}/{toCode}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Dönüşüm oranını sil */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fromCode: components["schemas"]["UnitCode"];
                    toCode: components["schemas"]["UnitCode"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Silindi */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/catalog/role-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Rol şablonları, izinleri ve sürümleriyle (US-012)
         * @description Platform rolü `super_admin` veya `content` (F2.9 V1).
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
                        "application/json": {
                            items: components["schemas"]["AdminRoleTemplate"][];
                        };
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Rol şablonu oluştur (US-012 AC1)
         * @description Şablon hiçbir zaman işletme admini değildir. İzinler şablonun yeteneğine ait olmalı ve kapsam iznin seçeneklerinden biri olmalı (aksi 422). Aynı işlemde yeteneğin var olan tüm işletmelerine rol olarak kopyalanır (F2.9 V4). `code` benzersiz (aksi 422 `code: [taken]`).
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
                        code: components["schemas"]["CatalogCode"];
                        name: components["schemas"]["CatalogName"];
                        /** @enum {string} */
                        capability: "seller" | "buyer";
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
                    content: {
                        "application/json": components["schemas"]["AdminRoleTemplate"];
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
    "/api/v1/admin/catalog/role-templates/{id}": {
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
         * Rol şablonunu güncelle (US-012 AC2)
         * @description İzin listesi değişirse `version` 1 artar, işletmelerin kopyaları değişmez ve şablondan rolü olan her arşivlenmemiş işletmenin aktif adminlerine "yeni şablon sürümü" bildirimi gider (outbox `role_template.version_published`). Yalnız ad değişikliği sürüm artırmaz (F2.9 V2). İşletme admin şablonunun izinleri değişmez (422 `permissions: [admin_template_locked]`, V6). `code` ve `capability` değişmez.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name?: components["schemas"]["CatalogName"];
                        permissions?: components["schemas"]["RolePermission"][];
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminRoleTemplate"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                422: components["responses"]["Error"];
            };
        };
        trace?: never;
    };
    "/api/v1/admin/catalog/job-titles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Unvanlar, pasifler dahil (US-012)
         * @description Platform rolü `super_admin` veya `content` (F2.9 V1). `inUse` silinebilirliği gösterir (AC3).
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
                        "application/json": {
                            items: components["schemas"]["AdminJobTitle"][];
                        };
                    };
                };
                403: components["responses"]["Error"];
            };
        };
        put?: never;
        /**
         * Unvan oluştur (US-012 AC1)
         * @description Şablon unvanla aynı yetenekte olmalı (aksi 422 `roleTemplateId: [capability]`). Aktif unvan işletmelerin davet ekranında (`GET /team/job-titles`) hemen görünür.
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
                        code: components["schemas"]["CatalogCode"];
                        name: components["schemas"]["CatalogName"];
                        /** @enum {string} */
                        capability: "seller" | "buyer";
                        /** Format: uuid */
                        roleTemplateId: string;
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
                        "application/json": components["schemas"]["AdminJobTitle"];
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
    "/api/v1/admin/catalog/job-titles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Kullanılmayan unvanı sil (US-012 AC3)
         * @description Bir üyelik (`removed` dahil) veya davet unvanı gösteriyorsa `409 JOB_TITLE_IN_USE`; yalnız pasifleştirilebilir (F2.9 V7).
         */
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
                /** @description Silindi */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                409: components["responses"]["Error"];
            };
        };
        options?: never;
        head?: never;
        /**
         * Unvanı güncelle / pasifleştir (US-012 AC3)
         * @description Pasif unvan davet ekranında görünmez; var olan üyelikler etkilenmez. `code` ve `capability` değişmez.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: components["parameters"]["Id"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name?: components["schemas"]["CatalogName"];
                        /** Format: uuid */
                        roleTemplateId?: string;
                        isActive?: boolean;
                    };
                };
            };
            responses: {
                /** @description Güncellendi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminJobTitle"];
                    };
                };
                403: components["responses"]["Error"];
                404: components["responses"]["Error"];
                422: components["responses"]["Error"];
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
        ErrorCode: "VALIDATION_FAILED" | "UNAUTHENTICATED" | "PERMISSION_DENIED" | "CAPABILITY_REQUIRED" | "NOT_FOUND" | "INVALID_STATE_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "RATE_LIMITED" | "CONFIRMATION_REQUIRED" | "OTP_RATE_LIMITED" | "OTP_INVALID" | "OTP_EXPIRED" | "OTP_LOCKED" | "SMS_UNAVAILABLE" | "TOTP_REQUIRED" | "TOTP_INVALID" | "REFRESH_TOKEN_REUSED" | "USER_DISABLED" | "BUSINESS_SUSPENDED" | "SUBSCRIPTION_READ_ONLY" | "ENTITLEMENT_LIMIT_REACHED" | "VOEN_INVALID" | "VOEN_ALREADY_REGISTERED" | "VOEN_REQUIRED" | "SELLER_APPLICATION_ALREADY_PENDING" | "PHONE_ALREADY_REGISTERED" | "LAST_ADMIN_PROTECTED" | "MEMBER_ALREADY_EXISTS" | "CONNECTION_ALREADY_ACTIVE" | "CONNECTION_REQUEST_ALREADY_PENDING" | "CONNECTION_REQUEST_EXPIRED" | "CONNECTION_BLOCKED" | "CONNECTION_COOLDOWN_ACTIVE" | "CONNECTION_DAILY_QUOTA_EXCEEDED" | "CONNECTION_NOT_ACTIVE" | "PRICE_NOT_AVAILABLE" | "QTY_NOT_MULTIPLE" | "BELOW_MIN_ORDER_QTY" | "BELOW_MIN_ORDER_AMOUNT" | "VARIANT_UNAVAILABLE" | "CURRENCY_MISMATCH" | "STOCK_INSUFFICIENT" | "ORDER_QTY_INCREASE_NOT_ALLOWED" | "ORDER_EMPTY_USE_REJECT" | "DELIVERY_PHOTO_REQUIRED" | "DELIVERY_TIMESTAMP_TOO_OLD" | "FILE_INVALID" | "IMPORT_TOO_MANY_ROWS" | "SETTING_OUT_OF_RANGE" | "SETTING_SCOPE_NOT_ALLOWED" | "JOB_TITLE_IN_USE" | "PRICE_LIST_IN_USE" | "PRICE_LIST_DEFAULT_PROTECTED" | "INTERNAL_ERROR";
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
            /**
             * Format: uuid
             * @description Son kullanılan işletme; aktif üyeliği kalmadıysa null (US-003 AC1, F2.7). İstemci işletme seçicide varsayılan alır.
             */
            lastBusinessId?: string | null;
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
        TeamMember: {
            /**
             * Format: uuid
             * @description Üyelik kimliği
             */
            id: string;
            /** Format: uuid */
            userId: string;
            fullName: string;
            phone: components["schemas"]["PhoneE164"];
            /** Format: uuid */
            roleId: string;
            /** Format: uuid */
            jobTitleId: string;
            /** Format: uuid */
            branchId: string | null;
            /** Format: uuid */
            warehouseId: string | null;
            regionIds: string[];
            isBusinessAdmin: boolean;
            isSelf: boolean;
            /** Format: date-time */
            joinedAt: string | null;
        };
        TeamInvitation: {
            /** Format: uuid */
            id: string;
            phone: components["schemas"]["PhoneE164"];
            /** Format: uuid */
            roleId: string;
            /** Format: uuid */
            jobTitleId: string;
            /** Format: uuid */
            branchId: string | null;
            /** Format: uuid */
            warehouseId: string | null;
            /** Format: date-time */
            expiresAt: string;
            /** Format: date-time */
            createdAt: string;
        };
        TeamRole: {
            /** Format: uuid */
            id: string;
            name: components["schemas"]["LocalizedText"];
            /** @enum {string} */
            capability: "seller" | "buyer";
            isBusinessAdmin: boolean;
            /** Format: uuid */
            sourceTemplateId: string | null;
            isCustom: boolean;
            permissions: components["schemas"]["RolePermission"][];
        };
        RoleTemplate: {
            /** Format: uuid */
            id: string;
            code: string;
            name: components["schemas"]["LocalizedText"];
            /** @enum {string} */
            capability: "seller" | "buyer";
            permissions: components["schemas"]["RolePermission"][];
        };
        /** @description Özel rol adı; en az bir dil, her biri 1–80 karakter. */
        RoleName: {
            az?: string;
            ru?: string;
            tr?: string;
        };
        JobTitle: {
            /** Format: uuid */
            id: string;
            code: string;
            name: components["schemas"]["LocalizedText"];
            /** @enum {string} */
            capability: "seller" | "buyer";
            /** Format: uuid */
            roleTemplateId: string | null;
        };
        /** @description Benzersiz kod (seed eşleşme anahtarı); sonradan değişmez (F2.9 V5). */
        CatalogCode: string;
        /** @description Katalog adı; az, ru, tr zorunlu, en isteğe bağlı (ADR-0007); her biri 1–80 karakter. */
        CatalogName: {
            az: string;
            ru: string;
            tr: string;
            en?: string;
        };
        /** @description UN/ECE Rec 20 kodu (ör. `KGM`, `XCT`); sonradan değişmez (F3.1 K1). */
        UnitCode: string;
        /** @enum {string} */
        UnitKind: "count" | "weight" | "volume" | "length" | "area" | "package";
        /** @description Kısaltma; az, ru, tr zorunlu, en isteğe bağlı; her biri 1–16 karakter. */
        UnitAbbreviation: {
            az: string;
            ru: string;
            tr: string;
            en?: string;
        };
        /**
         * @description Dönüşüm oranı; `> 0`, en çok 12 tam ve 6 ondalık hane (`numeric(18,6)`).
         * @example 1000
         */
        UnitFactor: string;
        Unit: {
            code: components["schemas"]["UnitCode"];
            kind: components["schemas"]["UnitKind"];
            name: components["schemas"]["LocalizedText"];
            abbreviation: components["schemas"]["LocalizedText"];
            allowsDecimal: boolean;
            isActive: boolean;
        };
        UnitConversion: {
            fromCode: components["schemas"]["UnitCode"];
            toCode: components["schemas"]["UnitCode"];
            factor: components["schemas"]["UnitFactor"];
        };
        UnitCatalog: {
            items: components["schemas"]["Unit"][];
            conversions: components["schemas"]["UnitConversion"][];
        };
        /** @description Listede sıra (küçük önce). */
        SortOrder: number;
        /** @description Kategori / faaliyet alanı güncellemesi (F3.2a); en az bir alan. */
        CatalogEntryPatch: {
            name?: components["schemas"]["CatalogName"];
            sortOrder?: components["schemas"]["SortOrder"];
            isActive?: boolean;
        };
        Category: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            parentId: string | null;
            name: components["schemas"]["LocalizedText"];
            depth: number;
            sortOrder: number;
            isActive: boolean;
        };
        BrandOption: {
            /** Format: uuid */
            id: string;
            /** @description Marka adı tek metin (F3 V4) */
            name: string;
        };
        BrandRequest: {
            /** Format: uuid */
            id: string;
            name: string;
            /** @enum {string} */
            status: "requested" | "active" | "rejected";
            isActive: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            decidedAt: string | null;
        };
        AdminBrand: components["schemas"]["BrandRequest"] & {
            /** @description Talep eden toptancı; admin markasında null */
            requestedBy: {
                /** Format: uuid */
                businessId: string;
                legalName: string | null;
            } | null;
        };
        ActivityTypeAdmin: {
            /** Format: uuid */
            id: string;
            name: components["schemas"]["LocalizedText"];
            sortOrder: number;
            isActive: boolean;
        };
        AdminRoleTemplate: {
            /** Format: uuid */
            id: string;
            code: string;
            name: components["schemas"]["LocalizedText"];
            /** @enum {string} */
            capability: "seller" | "buyer";
            /** @description true ise izinleri değişmez (V6) */
            isBusinessAdmin: boolean;
            version: number;
            permissions: components["schemas"]["RolePermission"][];
            /** Format: date-time */
            updatedAt: string;
        };
        AdminJobTitle: {
            /** Format: uuid */
            id: string;
            code: string;
            name: components["schemas"]["LocalizedText"];
            /** @enum {string} */
            capability: "seller" | "buyer";
            /** Format: uuid */
            roleTemplateId: string | null;
            isActive: boolean;
            /** @description Üyelik veya davet gösteriyor; silinemez (AC3) */
            inUse: boolean;
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
            /** Format: uuid */
            logoFileId?: string | null;
            /** @description 🔒 Yalnız `GET|PATCH /business` (kendi işletmesi, `business.manage`). */
            contactName?: string | null;
            /** @description 🔒 */
            personalPhone?: string | null;
            /** @description 🔒 */
            email?: string | null;
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
            /**
             * Format: uuid
             * @description Bu işletmenin hazır `logo` dosyası (`/files` akışı); `null` logoyu kaldırır (F2.10b).
             */
            logoFileId?: string | null;
            contactName?: string;
            /** @description 🔒 `null` siler (F2.10b V5). */
            personalPhone?: components["schemas"]["PhoneE164"] | null;
            /**
             * Format: email
             * @description 🔒 `null` siler (F2.10b V5).
             */
            email?: string | null;
        };
        /** @description US-007, ADR-0014. `showPersonalContact` kişisel telefon ve e-postayı birlikte açar. */
        Privacy: {
            listedInDirectory: boolean;
            showLogo: boolean;
            showAddress: boolean;
            showBusinessPhone: boolean;
            showVoen: boolean;
            showContactName: boolean;
            showPersonalContact: boolean;
        };
        Branch: {
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: uuid */
            regionId: string | null;
            /** @description Kayıtta açılan varsayılan şubede boş (F2.3a) */
            addressLine: string | null;
            lat: number | null;
            lng: number | null;
            /** @enum {string} */
            approvalRule: "every_order" | "above_amount" | "none";
            approvalThreshold: components["schemas"]["Decimal"] | null;
            /** @enum {string} */
            status: "active" | "inactive";
        };
        BranchInput: {
            name: string;
            /** Format: uuid */
            regionId: string;
            addressLine: string;
            lat?: number;
            lng?: number;
            /**
             * @default every_order
             * @enum {string}
             */
            approvalRule: "every_order" | "above_amount" | "none";
            approvalThreshold?: string | null;
        };
        BranchPatch: {
            name?: string;
            /** Format: uuid */
            regionId?: string;
            addressLine?: string;
            lat?: number | null;
            lng?: number | null;
            /** @enum {string} */
            approvalRule?: "every_order" | "above_amount" | "none";
            approvalThreshold?: string | null;
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
        /**
         * @description Yalnızca görünürlük ayarına göre açık alanlar dolu döner, kapalı alan `null` (US-007 AC1–AC2).
         *     Kişisel telefon ve e-posta yalnız `showPersonalContact` açıkken dolu. Diğer bağlantılar ve
         *     alım hacmi asla dönmez (US-007 AC6). Alanlar her istekte veritabanından taze okunur.
         */
        DirectoryBuyer: {
            /** Format: uuid */
            id: string;
            legalName: string;
            /** Format: uuid */
            activityTypeId: string;
            activityType: components["schemas"]["LocalizedText"];
            /** Format: uuid */
            regionId: string;
            /**
             * Format: uuid
             * @description Bölge ilçeyse üst şehri
             */
            cityId: string;
            region: components["schemas"]["LocalizedText"];
            verified: boolean;
            logoUrl: string | null;
            addressLine: string | null;
            businessPhone: string | null;
            voen: string | null;
            contactName: string | null;
            personalPhone: string | null;
            email: string | null;
            /** @description Bu satıcıyla ilişki durumu; yalnız çağıran satıcının istek/bağlantı satırlarından (F2.12a). `canRequest` kota hariç çift kurallarıdır */
            relation: {
                /** @enum {string} */
                status: "none" | "pending" | "active" | "rejected" | "cancelled" | "blocked";
                /** Format: date-time */
                cooldownUntil: string | null;
                canRequest: boolean;
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
            id: string;
            /** Format: uuid */
            sellerId: string;
            /** Format: uuid */
            buyerId: string;
            /** @description Karşı tarafın ünvanı; artık görünmüyorsa null. */
            counterpartyName: string | null;
            /** @enum {string} */
            status: "active" | "cancelled";
            /** @description Satıcı koşulları en az bir kez kaydetti mi (US-024 AC1 "koşul atanmadı"). */
            termsAssigned: boolean;
            terms: components["schemas"]["ConnectionTerms"];
            /** @description Yalnız satıcı bakışında; koşul atanmamış aktif bağlantıda öneri, yoksa null (US-024 AC3). */
            suggestedTerms?: components["schemas"]["ConnectionTermsSuggestion"] | null;
            /** Format: date-time */
            startedAt: string;
            /** Format: date-time */
            endedAt: string | null;
            /**
             * @description `platform` = perakendecinin hesabı platformca kapatıldı (F2.18, US-016 AC2).
             * @enum {string|null}
             */
            endedBySide: "seller" | "buyer" | "platform" | null;
        };
        ConnectionPage: {
            items: components["schemas"]["Connection"][];
            nextCursor: string | null;
        };
        ConnectionTermsSuggestion: {
            /** @enum {string} */
            source: "previous_connection" | "request";
            creditLimit: string | null;
            paymentTermDays: number;
            /**
             * Format: uuid
             * @description Önceki temsilci hâlâ aktif üyeyse.
             */
            salesRepMembershipId: string | null;
        };
        /** @description Perakendecinin gördüğü toptancı özeti (US-023 AC1); ürün, fiyat, başka bağlantı yok. */
        ConnectionSellerSummary: {
            /** Format: uuid */
            id: string;
            name: string;
            logoUrl: string | null;
            description: components["schemas"]["LocalizedText"] | null;
            /** @description Toptancının kategorileri (US-023 AC1; F3.3a, S3 = A): `active` ürünlerinin aktif kök kategorileri, sıra numarasıyla. Ürünü olmayan toptancıda boş. */
            categories: {
                /** Format: uuid */
                id: string;
                name: components["schemas"]["CatalogName"];
            }[];
        };
        BlockedSeller: {
            /** Format: uuid */
            sellerId: string;
            sellerName: string;
            logoUrl: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        /** @description Alıcı bakışında yalnız `creditLimit` ve `paymentTermDays` döner. */
        ConnectionTerms: {
            /**
             * Format: uuid
             * @description null = satıcının varsayılan listesi
             */
            priceListId?: string | null;
            branchPricingEnabled?: boolean;
            /** @description AZN, 2 ondalık; MVP'de yalnız uyarı */
            creditLimit: string | null;
            paymentTermDays: number;
            /** Format: uuid */
            salesRepMembershipId?: string | null;
        };
        ConnectionTermsUpdate: {
            /**
             * Format: uuid
             * @description F3.6a: satıcının aktif listesi; null = varsayılan liste
             */
            priceListId?: string | null;
            /**
             * @description F3.8'e kadar yalnız false
             * @constant
             */
            branchPricingEnabled?: false;
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
        /**
         * @description Miktar (`numeric(14,3)`), pozitif, en çok 3 ondalık
         * @example 24
         */
        Quantity: string;
        /** @description GTIN-8/12/13/14, GS1 kontrol hanesi doğrulanır */
        Gtin: string;
        PackagingInput: {
            /** @enum {string} */
            level: "unit" | "inner" | "case" | "pallet";
            /** @example XCT */
            unitCode: string;
            baseQty: components["schemas"]["Quantity"];
            gtin?: components["schemas"]["Gtin"] | null;
            weightG?: number | null;
            dimensionsMm?: {
                l: number;
                w: number;
                h: number;
            } | null;
            /** @default false */
            isSalesUnit: boolean;
            minOrderQty?: components["schemas"]["Quantity"];
            orderMultiple?: components["schemas"]["Quantity"];
        };
        Packaging: components["schemas"]["PackagingInput"] & {
            /** Format: uuid */
            id: string;
        };
        VariantInput: {
            /**
             * Format: uuid
             * @description Yalnız PATCH'te var olan varyant
             */
            id?: string;
            sku: string;
            /**
             * @example {
             *       "volume_ml": 400
             *     }
             */
            attributes?: {
                [key: string]: string | number | boolean;
            };
            gtin?: components["schemas"]["Gtin"] | null;
            packaging: components["schemas"]["PackagingInput"][];
        };
        Variant: {
            /** Format: uuid */
            id: string;
            sku: string;
            attributes: {
                [key: string]: unknown;
            };
            gtin: string | null;
            /** @description Stok modu `availability` (uç F3.10) */
            isAvailable: boolean;
            /** @enum {string} */
            status: "active" | "archived";
            packaging: components["schemas"]["Packaging"][];
        };
        /** @description En az bir dilde dolu (US-030 AC1); boş diller atılır */
        ProductName: {
            az?: string;
            ru?: string;
            tr?: string;
            en?: string;
        };
        /** @description Bölge kuralı (F3.3a K5): boş liste = bütün bağlı perakendecilere görünür; dolu liste = perakendecinin bölgesi (`businesses.region_id`, V8) listedeyse. Fiyat listesi kuralı F3.6a. */
        ProductVisibilityInput: {
            regionIds?: string[];
        };
        ProductInput: {
            sku: string;
            name: components["schemas"]["ProductName"];
            description?: components["schemas"]["LocalizedText"] | null;
            /** Format: uuid */
            categoryId: string;
            /** Format: uuid */
            brandId?: string | null;
            baseUnitCode: string;
            /** @default false */
            hasExpiry: boolean;
            shelfLifeMonths?: number | null;
            variants: components["schemas"]["VariantInput"][];
            visibility?: components["schemas"]["ProductVisibilityInput"];
        };
        ProductUpdate: {
            sku?: string;
            name?: components["schemas"]["ProductName"];
            description?: components["schemas"]["LocalizedText"] | null;
            /** Format: uuid */
            categoryId?: string;
            /** Format: uuid */
            brandId?: string | null;
            baseUnitCode?: string;
            hasExpiry?: boolean;
            shelfLifeMonths?: number | null;
            /** @enum {string} */
            status?: "draft" | "active" | "archived";
            variants?: components["schemas"]["VariantInput"][];
            visibility?: components["schemas"]["ProductVisibilityInput"];
        };
        /** @description Toptancı bakışı. Görseller sırayla, ilki kapak (F3.4a). */
        Product: {
            /** Format: uuid */
            id: string;
            sku: string;
            name: components["schemas"]["LocalizedText"];
            description: components["schemas"]["LocalizedText"] | null;
            /** Format: uuid */
            categoryId: string;
            /** Format: uuid */
            brandId: string | null;
            brand: {
                /** Format: uuid */
                id: string;
                name: string;
                /** @enum {string} */
                status: "requested" | "active";
            } | null;
            baseUnitCode: string;
            hasExpiry: boolean;
            shelfLifeMonths: number | null;
            /** @enum {string} */
            status: "draft" | "active" | "archived";
            /** Format: date-time */
            publishedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            variants: components["schemas"]["Variant"][];
            visibility: {
                regionIds: string[];
            };
            images: components["schemas"]["ProductImage"][];
        };
        /** @description F3.4a. `urls` yalnız `ready` iken; uzun kenar 200 (thumb), 800 (medium), 1600 (large) px, WebP, küçük görsel büyütülmez. Orijinal dosyanın adresi dönmez. */
        ProductImage: {
            /** Format: uuid */
            id: string;
            sortOrder: number;
            /** @enum {string} */
            status: "processing" | "ready" | "failed";
            urls: {
                thumb: string;
                medium: string;
                large: string;
            } | null;
        };
        ProductListItem: {
            /** Format: uuid */
            id: string;
            sku: string;
            name: components["schemas"]["LocalizedText"];
            /** @enum {string} */
            status: "draft" | "active" | "archived";
            /** Format: uuid */
            categoryId: string;
            brand: {
                /** Format: uuid */
                id: string;
                name: string;
            } | null;
            activeVariantCount: number;
            /** @description İlk `ready` görselin 200 px adresi (F3.4a) */
            thumbUrl: string | null;
            /** Format: date-time */
            updatedAt: string;
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
        /** @description `PriceResolver` sonucu (ADR-0019). `source: none` iken fiyat alanları `null` (US-034 AC4). */
        ResolvedPrice: {
            unitPrice: components["schemas"]["Money"] | null;
            /** @enum {string} */
            source: "branch_price" | "customer_price" | "price_list" | "default_list" | "none";
            tierDiscountPercent: components["schemas"]["Decimal"] | null;
            branchDiscountPercent: components["schemas"]["Decimal"] | null;
            finalUnitPrice: components["schemas"]["Money"] | null;
            vatIncluded: boolean | null;
            vatRate: components["schemas"]["Decimal"] | null;
        };
        /** @description Yalnız satıcı bakışı; alıcıya giden `BrowseProduct.price` liste adını taşımaz. */
        PriceExplanation: components["schemas"]["ResolvedPrice"] & {
            priceList: {
                /** Format: uuid */
                id: string;
                name: string;
            } | null;
            /** Format: date-time */
            validFrom: string | null;
        };
        PriceListInput: {
            name: string;
            currency: components["schemas"]["CurrencyCode"];
            vatIncluded: boolean;
            /** @description 0–100 */
            vatRate: string;
            isDefault?: boolean;
        };
        PriceListUpdate: {
            name?: string;
            vatIncluded?: boolean;
            vatRate?: string;
            /** @constant */
            isDefault?: true;
            /** @enum {string} */
            status?: "active" | "archived";
        };
        PriceList: {
            /** Format: uuid */
            id: string;
            name: string;
            currency: components["schemas"]["CurrencyCode"];
            vatIncluded: boolean;
            vatRate: components["schemas"]["Decimal"];
            isDefault: boolean;
            /** @enum {string} */
            status: "active" | "archived";
            /** @description Fiyatı girilmiş ambalaj seviyesi sayısı */
            itemCount: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        PricePoint: {
            unitPrice: components["schemas"]["Decimal"];
            /** Format: date-time */
            validFrom: string;
        };
        PriceListItem: {
            /** Format: uuid */
            packagingId: string;
            current: components["schemas"]["PricePoint"] | null;
            scheduled: components["schemas"]["PricePoint"][];
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
        /** @description Platform admininin gördüğü perakendeci kaydı (F2.18). Kişisel veri yok. */
        AdminBuyer: {
            /** Format: uuid */
            id: string;
            legalName: string;
            voen: string | null;
            /** @enum {string|null} */
            legalType: "legal_entity" | "individual_entrepreneur" | null;
            /** Format: uuid */
            regionId: string;
            /** @enum {string} */
            status: "active" | "suspended" | "dormant";
            /** Format: date-time */
            verifiedAt: string | null;
            profileCompleteness: number;
            /** Format: date-time */
            createdAt: string;
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
        /** @description Ayar ekranı satırı (F2.19). `value` bu kapsamdaki kayıt; `inheritedValue` kayıt yokken geçerli değer. */
        AdminSettingItem: {
            key: string;
            /** @enum {string} */
            kind: "int" | "int_list" | "bool" | "enum" | "version" | "url" | "country_codes";
            min?: number;
            max?: number;
            options?: string[];
            scopes: ("platform" | "plan" | "business")[];
            /** @description Bu kapsamdaki değer; yoksa null */
            value: unknown;
            /** @description Bu kapsamda değer yokken geçerli olan değer */
            inheritedValue: unknown;
            /** @enum {string} */
            inheritedFrom: "plan" | "platform" | "default";
            /** Format: date-time */
            updatedAt: string | null;
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
