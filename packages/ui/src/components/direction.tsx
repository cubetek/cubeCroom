'use client';

import { DirectionProvider as RadixDirectionProvider } from '@radix-ui/react-direction';
import type { ReactNode } from 'react';

/**
 * اتجاه Radix — **لا يُقرأ من الصفحة، يُمرَّر إليه**.
 *
 * مكوّنات shadcn مبنيّة على Radix، وRadix لا يستنتج الاتجاه من `dir` على
 * الوثيقة: يأخذه من هذا المزوّد. وما يتوقّف عليه ليس شكلاً بل **سلوكاً**:
 *
 *   • القوائم والتلميحات تُحاذى من الجهة الصحيحة بدل أن تخرج عن الشاشة.
 *   • السهم الأيمن في `Tabs` و`RadioGroup` ينتقل إلى ما **قبل** لا ما بعد.
 *   • `ScrollArea` يبدأ من اليمين.
 *
 * وبلاه تبدو الصفحة عربية سليمة ويتحرّك التنقّل فيها بالعكس — وهو أخفى من
 * خللٍ ظاهر وأصعب في التشخيص. وقد وقع هذا بعينه في موقع الدليل: أُعلن
 * `dir="rtl"` على الوثيقة ولم يُمرَّر إلى المزوّد، فبقي منطق التنقّل لاتينياً.
 *
 * والقيمة مثبَّتة `rtl` لا مشتقّة: العربية لغة الواجهة الوحيدة (القرار D1)،
 * ومتغيّرٌ يحتمل قيمتين يدعو إلى فرعٍ ثانٍ لا يُفحص.
 */
export function DirectionProvider({ children }: { children: ReactNode }) {
  return <RadixDirectionProvider dir="rtl">{children}</RadixDirectionProvider>;
}
