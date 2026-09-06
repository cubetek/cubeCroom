'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  ar,
} from '@cubecroom/ui';
import { ago, when } from '@cubecroom/contracts';
import type { HomeState, RequestRow } from '@cubecroom/contracts';

/**
 * T05 — الرئيسية.
 * المرجع: docs/design/07-sprint-ux-1.md · اللوح Main.dc.html
 *
 * كل ما هنا يأتي من `app:home-state` — نداء واحد يخدم هذه البطاقة والشريط
 * العلوي معاً، فلا تقول الشارة «متاح» والبطاقة «متوقف» في لحظة واحدة.
 *
 * وحالة الحصة تُقرأ من الخادم لا من جدول الحصص: حصة مفتوحة في القاعدة وخادمٌ
 * ساقط تعني طلاباً لا يصلون، وهو ما يهمّ المعلم لا ما في الجدول.
 *
 * **والأسطح هنا `<section>` و`<article>` لا مكوّن `Card`.** ثلاثةٌ منها تحمل
 * `aria-label`، والاسم لا يُعلَن إلّا على عنصرٍ له دورٌ يحمله: `<section>`
 * مسمّاة تصير `region` في شجرة الوصول، و`<div>` مسمّاة لا تصير شيئاً. فأصنافُ
 * `Card` تُكتب على العنصر الصحيح بدل أن يُستبدل العنصر بالمكوّن.
 */

/** سطح البطاقة الواحد — هو نفسه ما يرسمه `Card`: حدٌّ شعريّ وظلٌّ ساكن. */
const CARD = 'rounded-lg border border-hairline bg-surface shadow-1';

export type DashboardProps = {
  readonly home: HomeState;
  readonly onOpenClass: (classId: string, section: 'access' | 'requests') => void;
  readonly onGoToClasses: () => void;
  readonly onOpenBackup: () => void;
  readonly onDecide: (row: RequestRow, decision: 'approve' | 'reject') => void;
  readonly onEndSession: () => void;
  readonly busyRequestId: string | null;
};

export function Dashboard({
  home,
  onOpenClass,
  onGoToClasses,
  onOpenBackup,
  onDecide,
  onEndSession,
  busyRequestId,
}: DashboardProps) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { session, requests, classes, lastBackupAt } = home;

  return (
    <>
      {session ? (
        /*
         * ── ما دون 1180px ─────────────────────────────────────
         *
         * لوحة الطلبات تأخذ 348px ثابتة بلا انكماش، فعند أضيق سطح يبلغه
         * المعلّم بالسحب (1008px — main.ts: minWidth 1024، وللنافذة إطار)
         * لا يبقى لبطاقة الحصة إلّا 336px: أضيقُ من اللوحة الثانوية نفسها.
         * المقيس أن اسم الفصل يقفز إلى سطرين وترتفع البطاقة من 279 إلى 329px،
         * ولا مخرج بلا التفاف.
         *
         * والحدّ 1180 لا 1024 لأن العطل لا ينتهي عند 1024: بمسح كل ثمانية
         * بكسلات يبقى الاسم في سطرين حتى 1144px ولا يعود سطراً واحداً إلّا
         * عند 1152.
         *
         * فتنزل اللوحة تحت البطاقة وتأخذ العرض كاملاً. ترتيب DOM لم يتغيّر،
         * فلا يتغيّر ترتيب القراءة ولا مسار Tab.
         */
        <div className="flex items-stretch gap-5 max-[1180px]:flex-wrap">
          {/* أهم بطاقة هي حالة الحصة الحالية — الحدّ الملوّن يميّزها وحدها. */}
          <section
            className="flex min-w-0 grow flex-col gap-4 rounded-lg border border-ok-border bg-surface p-5 shadow-1"
            aria-label="الحصة الحالية"
          >
            <div className="flex items-center gap-3">
              <span className="text-t-caption font-medium text-text-muted">الحصة الحالية</span>
              {session.reachable ? (
                <Badge tone="ok" className="ms-auto">
                  دخول الطلاب متاح
                </Badge>
              ) : (
                <Badge tone="error" className="ms-auto">
                  الطلاب لا يستطيعون الدخول
                </Badge>
              )}
            </div>

            <div className="flex items-end gap-5">
              <div className="grow">
                <div className="text-t-h1">{session.className}</div>
                <div className="text-t-label text-text-muted">
                  بدأت منذ {elapsed(session.startedAt)}
                </div>
              </div>
              <div className="flex shrink-0 gap-6.5">
                <div>
                  <div className="text-t-caption text-text-muted">متصلون الآن</div>
                  <div className="text-t-display">{ar(session.connected)}</div>
                </div>
                {/* الرقم المعلّق ولافتته بلون الانتظار معاً — لا اللافتة وحدها. */}
                <div>
                  <div className="text-t-caption text-pending-text">بانتظار الموافقة</div>
                  <div className="text-t-display text-pending-text">{ar(session.pending)}</div>
                </div>
              </div>
            </div>

            <p className="flex items-center gap-2 rounded-md bg-ok-bg px-3 py-2.5 text-t-label text-ok-text">
              <Icon name="wifi" size={16} />
              {session.reachable
                ? 'جاهز — الطلاب على نفس شبكة Wi-Fi يستطيعون الدخول.'
                : 'شغّلنا الدخول، لكن الشبكة لا توصل طلابك إلى جهازك.'}
            </p>

            {/*
             * ارتفاع الزرّ مثبَّت 40px (--height-control) بينما نصّه حرّ. فحين
             * تضيق البطاقة ينكسر «فتح شاشة المشاركة» إلى سطرين (23.8px ⇦
             * 47.6px) فيفيض 3.8px فوق الزرّ ومثلها تحته — على الزرّ الأساسي
             * والمدمّر معاً. الالتفاف يُنزل الزرّ الثاني إلى سطر بدل أن ينكسر
             * النصّ داخل الأربعين. ولا أثر له حين يتّسعان.
             */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="primary" onClick={() => onOpenClass(session.classId, 'access')}>
                فتح شاشة المشاركة
              </Button>
              {/*
               * حشوةٌ نامية لا `ms-auto` على الزرّ المدمّر: مع الالتفاف تبقى
               * الحشوة في السطر الأول، فينزل الزرّ إلى بداية السطر الثاني لا
               * إلى آخره — وهو ما كان.
               */}
              <div className="grow" />
              {/* CTA مدمّر: بحدّ لا بملء، ومُبعَد عن الأزرار الأخرى */}
              <Button
                variant="secondary"
                onClick={() => setConfirmEnd(true)}
                className="border-error-border text-error-text"
              >
                إنهاء دخول الطلاب
              </Button>
            </div>
          </section>

          <section
            className={`${CARD} flex w-87 shrink-0 flex-col max-[1180px]:w-full`}
            aria-label="طلبات بانتظار الموافقة"
          >
            <div className="flex items-center gap-2 px-4.5 pt-4 pb-3">
              <Icon name="clock" size={16} className="text-pending-text" />
              <span className="text-t-body font-semibold">طلبات بانتظار الموافقة</span>
              <span className="flex h-5 min-w-5.5 items-center justify-center rounded-full border border-pending-border bg-pending-bg px-1.5 text-t-caption font-bold text-pending-text">
                {ar(requests.length)}
              </span>
            </div>

            {requests.length === 0 ? (
              <p className="text-t-label text-text-muted">تظهر الطلبات هنا فور وصولها.</p>
            ) : null}

            {/* الصفّ خارج حشو البطاقة الأفقي: فاصله يمتدّ من حافةٍ إلى حافة. */}
            {requests.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2.5 border-t border-hairline px-4.5 py-2.25"
              >
                <div
                  className="flex size-7.5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-t-label font-semibold text-text-2"
                  aria-hidden
                >
                  {row.name.trim().charAt(0)}
                </div>
                <div className="min-w-0 grow">
                  <div className="truncate text-t-label font-medium">{row.name}</div>
                  <div className="text-t-caption text-text-muted">{ago(row.createdAt)}</div>
                </div>
                {/* US-T05: القبول بنقرة واحدة — لا حوار تأكيد */}
                {busyRequestId === row.id ? (
                  <Button variant="primary" size="sm" disabled disabledReason="جارٍ التنفيذ…">
                    قبول
                  </Button>
                ) : (
                  <>
                    {/*
                     * الأخضر الصلب لا `primary`: القبول فعلٌ يُنهي طلباً، وهو
                     * الأخضر نفسه في شارة «دخول الطلاب متاح». و`hover` يُثبَّت
                     * عليه وإلّا عاد الزرّ إلى الفيروزي عند المرور.
                     */}
                    <Button
                      variant="primary"
                      size="sm"
                      className="bg-success hover:bg-success"
                      onClick={() => onDecide(row, 'approve')}
                    >
                      قبول
                    </Button>
                    {/* مربّعٌ بحجم --height-control-sm: هدفُ نقرٍ لا حجمُ أيقونة. */}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="size-(--height-control-sm) px-0 text-error-text"
                      aria-label={`رفض ${row.name}`}
                      icon={<Icon name="x" size={15} />}
                      onClick={() => onDecide(row, 'reject')}
                    />
                  </>
                )}
              </div>
            ))}

            {/* `mt-auto` تُلصق الذيل بقاع اللوحة مهما قلّت الصفوف. */}
            <button
              type="button"
              className="mt-auto cursor-pointer border-t border-hairline px-4.5 py-2.5 text-start text-t-label font-semibold text-primary"
              onClick={() => onOpenClass(session.classId, 'requests')}
            >
              عرض كل الطلبات
            </button>
          </section>
        </div>
      ) : null}

      <section className="flex flex-col gap-2.5" aria-label="الفصول الأخيرة">
        <div className="flex items-center gap-3">
          <h2 className="text-t-h3">{session ? 'الفصول الأخيرة' : 'فصولك'}</h2>
          <div className="grow" />
          <button
            type="button"
            className="cursor-pointer text-t-label font-semibold text-primary"
            onClick={onGoToClasses}
          >
            كل الفصول
          </button>
          <Button
            variant="primary"
            size="sm"
            icon={<Icon name="plus" size={15} />}
            onClick={onGoToClasses}
          >
            إنشاء فصل
          </Button>
        </div>

        {classes.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 rounded-lg border border-dashed border-input bg-surface p-7.5 text-center">
            <div className="text-t-h2 font-bold">لم تُنشئ فصلاً بعد</div>
            <p className="text-t-label text-text-muted">
              الفصل هو المكان الذي تضع فيه دروسك وأنشطتك، ومنه تفتح دخول الطلاب في بداية كل حصة.
              إنشاؤه يستغرق أقل من دقيقة.
            </p>
            <Button variant="primary" onClick={onGoToClasses} icon={<Icon name="plus" size={16} />}>
              إنشاء أول فصل
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {classes.slice(0, 6).map((row) => (
              <article key={row.id} className={`${CARD} flex flex-col gap-2.5 p-4`}>
                <div className="flex items-center gap-3">
                  <div className="grow">
                    <div className="text-t-h3">{row.name}</div>
                    <div className="text-t-label text-text-muted">
                      {[row.subject, row.level].filter((part) => part !== null && part !== '').join(' · ') ||
                        'بلا مادة أو مستوى'}
                    </div>
                  </div>
                  {session?.classId === row.id ? (
                    <Badge tone="ok" size="sm">
                      جلسة نشطة
                    </Badge>
                  ) : row.hasDraft ? (
                    <Badge tone="draft" size="sm">
                      درس مسودة
                    </Badge>
                  ) : null}
                </div>
                {/*
                 * خمسة أبناء وأربع فجوات ×16px = 64px، أي أن الفجوات وحدها
                 * تلتهم ثلث الشريط، فيعجز عن الداخل المتاح للبطاقة عند الضيق.
                 * وبلا التفاف ينكمش كلّ <span> إلى أعرض كلمة فيه فينكسر النصّ
                 * **داخله** لا بينه: «٢٤» في سطر و«طالباً» تحتها — فينفصل
                 * العدد عن معدوده وتبقى «·» وحدها.
                 *
                 * و`[&>span]` تمنع الالتفاف داخل الأبناء — هذا ما يُبقي العدد
                 * ملتصقاً بمعدوده.
                 */}
                <div className="flex flex-wrap gap-4 text-t-caption text-text-2 [&>span]:whitespace-nowrap">
                  <span>{ar(row.students)} طالباً</span>
                  <span className="text-draft-border">·</span>
                  <span>{ar(row.lessons)} دروس</span>
                  <span className="text-draft-border">·</span>
                  <span>{ar(row.activities)} أنشطة</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        className={`${CARD} flex items-center gap-3 px-4.5 py-3.5`}
        aria-label="النسخ الاحتياطي"
      >
        <Icon name="database" size={18} className="text-ok-text" />
        {lastBackupAt !== null ? (
          <>
            <span className="text-t-label">
              <strong>آخر نسخة احتياطية:</strong> {when(lastBackupAt, { time: 'always' })}
            </span>
            <span className="text-t-label text-text-muted">بياناتك محفوظة على هذا الجهاز.</span>
          </>
        ) : (
          <span className="text-t-label">
            لا توجد نسخة احتياطية بعد — بياناتك على هذا الجهاز وحده.
          </span>
        )}
        <div className="grow" />
        <Button variant="secondary" size="sm" onClick={onOpenBackup}>
          إنشاء نسخة احتياطية الآن
        </Button>
      </section>

      {confirmEnd ? (
        /* العنوان نصّ لا عنصر، فاسم الفصل الغائب يصير فراغاً لا كلمة «undefined». */
        <Dialog open onOpenChange={setConfirmEnd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{`إنهاء دخول الطلاب إلى ${session?.className ?? ''}؟`}</DialogTitle>
              {/*
               * النصّ في `DialogDescription` لا في فقرةٍ حرّة: Radix يربطه
               * بـ`aria-describedby` فيُقرأ بعد العنوان عند الفتح، ويحذّر إن
               * غاب.
               */}
              <DialogDescription>
                سيتوقف الرابط والرمز عن العمل فوراً، ولن يستطيع أحد الدخول حتى تشغّله من جديد. دروس
                الفصل وإجابات طلابه لا تتأثر.
              </DialogDescription>
            </DialogHeader>
            {/* التذييل يحاذي النهاية بنفسه — فسقطت الحشوة الفارغة التي كانت تدفعه. */}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
                إبقاء الدخول مفتوحاً
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmEnd(false);
                  onEndSession();
                }}
              >
                إنهاء الدخول
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function elapsed(startedAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 1) return 'لحظات';
  if (minutes === 1) return 'دقيقة';
  if (minutes === 2) return 'دقيقتين';
  if (minutes < 60) return `${ar(minutes)} دقيقة`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? 'ساعة' : `${ar(hours)} ساعات`;
}
