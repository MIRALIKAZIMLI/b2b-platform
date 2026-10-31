# Arayüz (UI/UX) kuralları

| Alan | Değer |
| --- | --- |
| Sürüm | 1.0 |
| Tarih | 2026-10-31 |
| Kaynak | Platform sahibinin kararı (2026-10-31): tüm web ve mobil ekranlarda zorunlu |
| İlgili belgeler | [tech-stack.md](tech-stack.md) §3–§4 · [coding-guidelines.md](coding-guidelines.md) · `AGENTS.md` |

Bu kurallar web (`apps/web`) ve mobil (`apps/mobile`) için yazılan her ekran ve bileşende uygulanır. Tasarım felsefesi: **minimalist, derinlikli, modern ve kusursuz işlevsellik** (Linear, Vercel, Apple, Stripe çizgisi). Standart, şablon görünümlü ("bootstrap benzeri") arayüz kabul edilmez.

## 1. Çalışma şekli

1. Bir ekran veya bileşen yazmadan önce **kısa UX kararları** yazılır (PR açıklamasında "UX kararları" bölümü): bilgi hiyerarşisi, ana eylem, boş / yükleniyor / hata durumları, mobilde dokunma alanları.
2. Ardından üretime hazır kod: erişilebilir (etiketli alanlar, odak halkası, yeterli kontrast), çeviri anahtarlı (AGENTS.md kural 8), durumları eksiksiz.
3. Bu belgeye uymayan ekran incelemede bulgu sayılır (Müfettiş).

## 2. Görsel hiyerarşi ve tipografi

- Düz gri başlık yok. Metin kontrastı güçlü: web'de başlık `text-slate-900`, açıklama `text-slate-500`; mobilde aynı renklerden türetilmiş opaklıklar (başlık tam opak, açıklama ~%60).
- Font ağırlıkları bilinçli: başlıklar `font-semibold` / `font-bold`, açıklama ve gövde `font-normal`.
- Sayılar ve tutarlar hizalı (`tabular-nums`); VÖEN, telefon gibi kodlar okunaklı aralıkla.

## 3. Derinlik, gölge ve boşluk

- Düz ("flat") tasarım yok. Katmanlı yumuşak gölgeler (`shadow-sm`, `shadow-md`, `shadow-xl` veya özel yumuşak `box-shadow`) ve ince kenarlıklar (`border border-slate-200/80`) ile derinlik.
- Boşluk cömert: `p-6`, `gap-4`, `space-y-6`. Elemanlar birbirine sıkışmaz.

## 4. Renk paleti ve vurgular

- Zemin: Slate, Zinc veya Neutral tonları. Vurgu: Indigo, Violet, Emerald veya Zinc. Düz mavi / kırmızı ana renk olarak kullanılmaz (hata durumunda kırmızı tonu yalnızca hata mesajında).
- Kartlarda ve arka plan vurgularında ölçülü cam efekti (glassmorphism: yarı saydam zemin + `backdrop-blur`) ve yumuşak geçişler (`bg-gradient-to-br from-… to-…`).

## 5. Web

- Bileşenler hover ile canlanır: `transition-all duration-200 hover:border-slate-300 hover:shadow-md`.
- Odak görünür: `focus-visible:ring-2 focus-visible:ring-indigo-500/40`.
- Stil aracı: `tailwindcss` 4.x ve shadcn/ui ([tech-stack.md](tech-stack.md) §3). Kurulum ilk ekran adımında yapılır; listede olmayan yardımcı paket gerekiyorsa önce sorulur (AGENTS.md "Yapma").

## 6. Mobil (React Native / Expo)

- Dokunma hissi güçlü: `Pressable` ile basılı durumda belirgin geri bildirim (opaklık / ölçek), dokunma alanı en az 44×44.
- Köşeler modern oranda yuvarlak: kartlarda 16–24 (`rounded-2xl` / `rounded-3xl` karşılığı).
- Taşma yok: uzun metin satır sonu veya `numberOfLines`, klavye açıkken form kaydırılabilir, güvenli alan (`SafeAreaView`) gözetilir.
- Kart tabanlı yapı: içerik gruplanmış kartlarda, kartlar arası boşluk 16.
- Stil `StyleSheet` ile; renk ve boşluk değerleri tek bir tema dosyasından (yeni paket yok).
