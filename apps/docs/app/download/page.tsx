import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { BrandSignature } from '@/components/landing/brand-signature';
import { Downloads } from '@/components/landing/downloads';
import type { DownloadSource } from '@/components/landing/downloads-data';
import { RELEASE_CONFIG } from '../../../../scripts/release/config.mjs';

export const metadata: Metadata = {
  title: 'تنزيل CubeCroom — تطبيق المعلم',
  description: 'تنزيل تطبيق CubeCroom للمعلم على Windows وmacOS وLinux، والاطّلاع على الرخصة ودليل المساهمة.',
};

const platforms: Record<string, { name: string; os: string; extension: string }> = {
  win32: { name: 'Windows', os: 'win', extension: 'exe' },
  darwin: { name: 'macOS', os: 'mac', extension: 'dmg' },
  linux: { name: 'Linux', os: 'linux', extension: 'AppImage' },
};

export default function DownloadPage() {
  const { owner, repo } = RELEASE_CONFIG.repository;
  const source: DownloadSource = {
    repositoryUrl: `https://github.com/${owner}/${repo}`,
    apiUrl: `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    targets: RELEASE_CONFIG.targets.map((target) => ({
      id: target.id, platform: target.platform, arch: target.arch,
      label: platforms[target.platform].name,
      architecture: target.platform === 'darwin' ? (target.arch === 'arm64' ? 'Apple Silicon — شرائح M' : 'Intel — معمارية x64') : 'معمارية x64',
      filePattern: RELEASE_CONFIG.artifactName.replace('${os}', platforms[target.platform].os).replace('${arch}', target.arch).replace('${ext}', platforms[target.platform].extension),
    })),
  };
  return (
    <div className="min-h-screen bg-stone-50 text-base leading-relaxed text-slate-900 [color-scheme:light] [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-teal-700">
      <header className="border-b border-stone-200">
        <div className="mx-auto flex min-h-20 max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" aria-label="CubeCroom — الرئيسية"><BrandSignature /></Link>
          <Link href="/docs" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 hover:underline">دليل الاستخدام <BookOpen className="size-4" aria-hidden="true" /></Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-700"><ArrowRight className="size-4" aria-hidden="true" /> العودة للرئيسية</Link>
        <div className="mb-10">
          <p className="mb-3 text-sm font-semibold text-teal-700">تطبيق المعلم</p>
          <h1 className="text-4xl font-bold leading-snug sm:text-5xl">خذ فصلك معك.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-9 text-slate-600">اختر النسخة المناسبة لجهازك. التنزيل دون حساب، وطلابك ينضمون إلى الحصة من المتصفح دون تثبيت تطبيق.</p>
        </div>
        <Downloads source={source} />
      </main>
    </div>
  );
}
