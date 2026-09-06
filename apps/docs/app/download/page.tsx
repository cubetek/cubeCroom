import type { Metadata } from 'next';
import { Downloads } from '@/components/landing/downloads';
import { ReleasePage } from '@/components/releases/release-page';
import { RELEASE_SOURCE } from '@/lib/releases/source';

export const metadata: Metadata = {
  title: 'تنزيل CubeCroom — تطبيق المعلم',
  description: 'تنزيل تطبيق CubeCroom للمعلم على Windows وmacOS وLinux، والاطّلاع على الرخصة ودليل المساهمة.',
};

export default function DownloadPage() {
  return <ReleasePage active="download" title="خذ فصلك معك." description="اختر النسخة المناسبة لجهازك. التنزيل دون حساب، وطلابك ينضمون إلى الحصة من المتصفح دون تثبيت تطبيق."><Downloads source={RELEASE_SOURCE} /></ReleasePage>;
}
