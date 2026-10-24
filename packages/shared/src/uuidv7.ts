// UUIDv7 üretimi (RFC 9562 §5.7; data-model §1 "uygulama üretir"; F1 faz spesifikasyonu S5 = A).
// Düzen: 48 bit milisaniye zamanı | 4 bit sürüm (7) | 12 bit sayaç | 2 bit varyant (10) | 62 bit rastgele.
// Aynı milisaniyede sıra 12 bitlik sayaçla korunur (RFC 9562 §6.2 yöntem 1); sayaç taşarsa
// zaman damgası bir artırılır. Saat geri giderse son zaman damgası kullanılır.
// Zaman dışarıdan verilir (api'de Clock'tan; coding-guidelines §3.10). Rastgelelik Web Crypto
// (`globalThis.crypto`, Node'da `node:crypto` ile aynı kaynak) ile üretilir.

export const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const MAX_TIMESTAMP = 2 ** 48 - 1;
const MAX_COUNTER = 0xfff;

function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/** Sayacın başlangıcı: üst bit 0, böylece aynı milisaniyede en az 2048 kimliğe yer kalır. */
function seedCounter(): number {
  const bytes = randomBytes(2);
  return (((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0)) & 0x7ff;
}

function assertTimestamp(nowMs: number): void {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > MAX_TIMESTAMP) {
    throw new RangeError('uuidv7: zaman 0 ile 2^48-1 arasında tam sayı (ms) olmalı');
  }
}

function format(timestamp: number, counter: number): string {
  const bytes = new Uint8Array(16);
  let ts = timestamp;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes.set(randomBytes(8), 8);
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Kendi sayaç durumunu tutan bir üreteç döndürür (testler ve ayrı süreçler için). */
export function createUuidV7Generator(): (nowMs: number) => string {
  let lastTimestamp = -1;
  let counter = 0;
  return (nowMs: number): string => {
    assertTimestamp(nowMs);
    if (nowMs > lastTimestamp) {
      lastTimestamp = nowMs;
      counter = seedCounter();
    } else if (counter < MAX_COUNTER) {
      counter += 1;
    } else {
      lastTimestamp += 1;
      assertTimestamp(lastTimestamp);
      counter = seedCounter();
    }
    return format(lastTimestamp, counter);
  };
}

/** Süreç genelinde tek üreteç: aynı süreçte üretilen kimlikler sıralıdır. */
export const uuidv7: (nowMs: number) => string = createUuidV7Generator();
