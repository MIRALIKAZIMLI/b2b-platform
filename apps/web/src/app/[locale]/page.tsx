import { HomeRedirect } from '../../features/shell/home-redirect';

/** Ana sayfa: oturuma ve seçili işletmeye göre açılış sayfasına yönlendirir (F1.13b). */
export default function HomePage() {
  return (
    <main>
      <HomeRedirect />
    </main>
  );
}
