'use client';
// Perakendecinin bağlı toptancıları (F2.15b; US-025). Toptancı müşteri ekranının alıcı bakışı:
// koşullardan yalnız kredi limiti ve vade, temsilci ve koşul eylemi yok, iptal `connections.cancel`.
import { CustomersPage } from './customers-page';

export function SuppliersPage() {
  return <CustomersPage side="buyer" />;
}
