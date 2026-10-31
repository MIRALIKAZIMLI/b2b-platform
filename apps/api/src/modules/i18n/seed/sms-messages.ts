// SMS şablonlarının başlangıç çevirileri (`ui_translations`, F1.5a; integrations.md §2).
// Yer tutucular: {code} = 6 haneli kod, {minutes} = geçerlilik süresi (`otp.code_ttl_minutes`),
// {link} = toptancı aktivasyon bağlantısı, {days} = geçerlilik (`invitation.seller_activation_days`).
// Taslak AI tarafından yazıldı; platform sahibi PR'da gözden geçirir.
import type { ErrorMessageText } from './error-messages';

export const SMS_MESSAGES: Readonly<Record<string, ErrorMessageText>> = {
  'sms.otp_body': {
    az: '{code} — B2B giriş kodunuz. {minutes} dəqiqə etibarlıdır. Heç kimlə paylaşmayın.',
    ru: '{code} — ваш код входа в B2B. Действует {minutes} мин. Никому не сообщайте.',
    tr: '{code} — B2B giriş kodunuz. {minutes} dakika geçerlidir. Kimseyle paylaşmayın.',
  },
  'sms.seller_activation_body': {
    az: 'B2B platformunda toptan satıcı hesabınız açıldı. Aktivləşdirmək üçün {days} gün ərzində keçid edin: {link}',
    ru: 'Ваш оптовый аккаунт на платформе B2B открыт. Активируйте в течение {days} дн.: {link}',
    tr: 'B2B platformunda toptancı hesabınız açıldı. Etkinleştirmek için {days} gün içinde girin: {link}',
  },
};
