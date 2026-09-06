'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * اختيار السمة — فاتح · داكن · تبعاً للنظام.
 *
 * **والوضع الداكن نقضٌ للقرار A3** المسجَّل في `docs/design/06-decisions.md`،
 * وقد سُجِّل النقض هناك. أمّا هنا فآليّته: طبقة التوكنز الثانية تعيش في
 * `styles/globals.css` تحت `[data-theme='dark']`، وهذا الملفّ لا يفعل شيئاً
 * سوى وضع تلك السمة على `<html>` وحفظ اختيار المعلم.
 *
 * **ولا `next-themes`:** التطبيق تصديرٌ ثابت داخل Electron — لا خادم ولا
 * مستخدمين ولا كوكيز. وما يلزم فعلاً سطران: قراءةُ اختيارٍ محفوظ، ووضعُ سمة.
 * وحزمةٌ لذلك تُدخل تبعيةً وسلوكاً لا نتحكّم فيهما مقابل ما لا يُختصر.
 */

export type Theme = 'light' | 'dark' | 'system';

/**
 * مفتاح الحفظ — `localStorage` لا إعدادات القاعدة.
 *
 * **وهو إعداد جهازٍ لا إعداد معلم**، كما المنفذ في `config.json`: معلمٌ يستعيد
 * نسخته على جهاز المدرسة لا يجرّ معه سمةً اختارها لشاشة بيته. ولأنه كذلك لا
 * يمرّ بجسر IPC أصلاً — لا شيء في العملية الرئيسية يحتاج أن يعرفه.
 */
const STORAGE_KEY = 'cubecroom.theme';

type ThemeContextValue = {
  /** ما اختاره المعلم — قد يكون `system`. */
  readonly theme: Theme;
  /** ما هو مطبَّق فعلاً بعد حلّ `system` — `light` أو `dark` لا ثالث. */
  readonly resolved: 'light' | 'dark';
  readonly setTheme: (next: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
  } catch {
    // وضع التصفّح الخاص يرمي عند القراءة — والسمة ليست سبباً لإسقاط الواجهة.
    return 'system';
  }
}

/**
 * السكربت الذي يسبق أول رسم.
 *
 * **وبلاه ترتدّ الشاشة من الأبيض إلى الداكن أمام المعلم** عند كل إقلاع:
 * React لا يركّب إلا بعد تحميل الحزمة، فتُرسم الصفحة مرّةً بالتوكنز الفاتحة.
 * فالسمة تُوضع هنا قبل ذلك — قبل أن يُرسم شيء.
 *
 * **وهو مسموح بسياسة المحتوى قصداً لا مصادفةً:** `apps/desktop/src/main.ts`
 * يحسب بصمة كل سكربت مضمّن في المخرَج المبنيّ ويضعها في `script-src`. فما
 * نبنيه نحن يعمل، وما يُحقن لا تطابق بصمته.
 */
export const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var d=s==='dark'||((s===null||s==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  /*
   * `system` مبدئياً على الطرفين — الخادم والعميل.
   *
   * القيمة المحفوظة تُقرأ في `useEffect` لا أثناء أول رسم: قراءة
   * `localStorage` في جسد المكوّن تجعل ما يُصيَّر على الخادم مخالفاً لما
   * يُصيَّر في المتصفّح، فتسقط الترطيب. والسمة الصحيحة موضوعةٌ أصلاً على
   * `<html>` بـ`THEME_SCRIPT` قبل هذا كلّه — فلا وميض ينتظر هذا التأثير.
   */
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setThemeState(readStored());
  }, []);

  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      setResolved(dark ? 'dark' : 'light');
    };
    apply();

    // «تبعاً للنظام» تعني أنها تتبعه وهو يتغيّر، لا عند الإقلاع وحده.
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // يبقى الاختيار في هذه الجلسة ولا يُحفظ — وهذا أهون من سقوط الواجهة.
    }
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * يرمي خارج المزوّد ولا يعيد قيمةً افتراضية.
 *
 * افتراضٌ صامت هنا يعني زرّ سمةٍ يُضغط ولا يحدث شيء — وهو عطلٌ يُبحث عنه في
 * الأنماط لا في شجرة المزوّدات.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme خارج ThemeProvider.');
  return value;
}
