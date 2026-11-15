// Giriş etkinliği kancası (F2.17, US-027 AC3; state-machines §9 "girişte none'a döner").
// Oturum açılınca veya yenilenince kimlik modülü bu kancayı çağırır; bağlantısız hesap sayacını
// `businesses` sıfırlar. c4 yönü `businesses → identity` olduğundan identity businesses'ı içe
// aktaramaz: bu soyut sınıf Nest belirtecidir, uygulamasını businesses sağlar
// (`LoginActivityHookModule`, global; BranchUsageGate kalıbı).
export abstract class LoginActivityHook {
  /**
   * Kullanıcı kimliği doğrulanmış bir oturum açtı veya yeniledi. Kendi işlemini açar; hatası
   * çağıranda yutulur (giriş/yenileme asla bu yüzden düşmez).
   */
  abstract onActivity(userId: string, now: Date): Promise<void>;
}
