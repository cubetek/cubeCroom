'use client';

import { lazy, type ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';

const GuideSearch = lazy(() => import('./guide-search'));
const translations = {
  search: 'ابحث في الدليل', searchNoResult: 'لا نتائج', toc: 'في هذه الصفحة',
  tocNoHeadings: 'لا عناوين في هذه الصفحة', lastUpdate: 'آخر تحديث', chooseLanguage: 'اختر اللغة',
  nextPage: 'التالي', previousPage: 'السابق', chooseTheme: 'المظهر', editOnGithub: 'تعديل الصفحة',
};

export function GuideProvider({ children }: { children: ReactNode }) {
  return <RootProvider dir="rtl" i18n={{ locale: 'ar', translations }} search={{ SearchDialog: GuideSearch }}>
    {children}
  </RootProvider>;
}
