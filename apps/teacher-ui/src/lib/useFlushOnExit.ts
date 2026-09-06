'use client';

import { useEffect, useMemo } from 'react';
import { registerUpdateFlush } from './update-flush';

/**
 * حفظ ما لم يُحفظ قبل أن تختفي الشاشة — §22 «لا فقد بيانات عند إغلاق طبيعي».
 *
 * محرّرا الدرس والنشاط يحفظان بعد سكوت المعلم ثانيةً واحدة. وتلك الثانية هي
 * الثغرة: معلمٌ يكتب جملةً ثم **يغلق التطبيق فوراً** يفقدها — لا لأن الحفظ
 * معطّل، بل لأنه لم يحن بعد.
 *
 * فيُستدعى الحفظ عند ثلاث لحظات، وكلها تسبق الاختفاء:
 *   • `blur` على النافذة — يقع قبل الإغلاق، وقبل الانتقال إلى تطبيق آخر.
 *   • `visibilitychange` إلى مخفيّ — الحالة التي يعتمدها المتصفح للإغلاق.
 *   • تفكيك المكوّن — مغادرة الشاشة إلى غيرها داخل التطبيق.
 *
 * والدالة تُقرأ من `ref` لا من الإغلاق: مستمعٌ يُركَّب مرة ويقرأ حالةً قديمة
 * يحفظ ما كان لا ما صار — وهو أسوأ من ألّا يحفظ.
 */
export function useFlushOnExit(flush: () => void | Promise<void>, documentKey: string, label: string): void {
  // Each document gets its own cell. The previous effect cleanup must not read
  // the next document's callback if React reuses the editor component.
  const latest = useMemo(() => ({ flush, label }), [documentKey]);
  latest.flush = flush;
  latest.label = label;

  useEffect(() => {
    const saver = registerUpdateFlush({ documentKey, label: () => latest.label, flush: () => latest.flush() });
    const run = () => { void saver.flush().catch(() => undefined); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') run();
    };

    window.addEventListener('blur', run);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('blur', run);
      document.removeEventListener('visibilitychange', onVisibility);
      // المغادرة إلى شاشة أخرى داخل التطبيق — لا حدث نافذة لها.
      run();
      saver.unregister();
    };
  }, [documentKey, latest]);
}
