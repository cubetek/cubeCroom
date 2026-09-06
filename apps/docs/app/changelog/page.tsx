import type { Metadata } from 'next';
import { ReleasePage } from '@/components/releases/release-page';
import { ReleaseHistory } from '@/components/releases/release-history';
import { RELEASE_SOURCE } from '@/lib/releases/source';

export const metadata: Metadata = {
  title: 'سجل تغييرات CubeCroom',
  description: 'الإصدارات المنشورة من CubeCroom، وملاحظات التغييرات والتثبيت والتوقيع لكل نسخة.',
};

export default function ChangelogPage() {
  return <ReleasePage active="changelog" title="ما الجديد في CubeCroom؟" description="تعرّف على التغييرات في كل إصدار، واقرأ ملاحظات التثبيت والتوقيع والتحديث الخاصة به قبل التنزيل."><ReleaseHistory source={RELEASE_SOURCE} /></ReleasePage>;
}
