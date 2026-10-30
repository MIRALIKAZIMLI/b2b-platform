import { LoginForm } from '../../../../features/auth/login-form';

/** Giriş: telefon → SMS kodu → (platform rolü) TOTP (US-001, US-002, SF-01; F1.13a). */
export default function LoginPage() {
  return (
    <main>
      <LoginForm />
    </main>
  );
}
