'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Icon, Progress, ar, formatBytes } from '@cubecroom/ui';
import type { FileProgress, StoredFile } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * لوحة المرفقات في محرر الدرس — T13Upload.
 *
 * «تُنسخ إلى مكتبة ملفاتك على هذا الجهاز — لا حاجة لفتح مجلدات النظام»:
 * الملف يُنسخ نسخاً، فحذفُه من مجلد التنزيلات بعدها لا يكسر الدرس.
 *
 * وشريط التقدّم حقيقي لا زخرفة: نسخ مقطع ٢٨ م.ب بلا مؤشّر يبدو تعليقاً، ولذلك
 * تصل نبضات النسخ من العملية الرئيسية عبر قناة أحادية الاتجاه.
 *
 * وإزالة المرفق من الدرس **ليست حذفاً للملف**: يبقى في المكتبة وقد يستعمله
 * درس آخر — والحذف النهائي مكانه T18 بتحذيره.
 */

/**
 * صفّ المرفق — إطارٌ مستقلّ على سطح الصفحة داخل البطاقة.
 *
 * السطح `canvas` لا `surface`: الصفّ يقف **داخل** بطاقة بيضاء، فلو حمل لونها
 * ذاب فيها ولم يُقرأ حدُّه الشعريّ وحده فاصلاً بين مرفقين.
 */
const ROW = 'flex items-center gap-2.5 rounded-sm border border-border bg-canvas px-2.5 py-2';

/** شارة نوع الملفّ — عرضٌ أدنى ثابت فلا يهتزّ عمود الأسماء بين «PDF» و«MP4». */
const KIND_BADGE =
  'flex min-w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-surface px-1.5 py-1 text-t-caption font-bold text-text-2';

export type AttachmentsProps = {
  readonly lessonId: string;
  readonly onChanged?: (() => void) | undefined;
};

export function Attachments({ lessonId, onChanged }: AttachmentsProps) {
  const [attached, setAttached] = useState<StoredFile[] | null>(null);
  const [progress, setProgress] = useState<Map<string, FileProgress>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAttached(await bridge().lessonAttachments({ id: lessonId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة مرفقات الدرس.');
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const stop = bridge().onFileProgress((event) => {
      setProgress((current) => {
        const next = new Map(current);
        next.set(event.name, event);
        return next;
      });
    });
    return stop;
  }, []);

  const add = async () => {
    setBusy(true);
    setError(null);
    setProgress(new Map());
    try {
      const picked = await bridge().filesPick();
      const current = attached ?? [];
      // المُضاف في هذه المرة وحده، وما لم يكن مرفقاً بالفعل.
      const additions = picked.filter((file) => !current.some((one) => one.id === file.id));

      if (additions.length > 0) {
        setAttached(
          await bridge().lessonAttach({
            lessonId,
            fileIds: [...current.map((one) => one.id), ...additions.map((one) => one.id)],
          }),
        );
        onChanged?.();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إضافة المرفق.');
    } finally {
      setBusy(false);
      // النبضات تبقى لحظةً ليرى المعلم «اكتمل» ثم تختفي.
      setTimeout(() => setProgress(new Map()), 1500);
    }
  };

  const detach = async (file: StoredFile) => {
    setError(null);
    try {
      setAttached(
        await bridge().lessonAttach({
          lessonId,
          fileIds: (attached ?? []).filter((one) => one.id !== file.id).map((one) => one.id),
        }),
      );
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إزالة المرفق.');
    }
  };

  const rows = attached ?? [];
  const active = [...progress.values()];

  return (
    /*
     * الحشو الأفقي على البطاقة نفسها لا على `CardContent`: لا صفّ هنا يمتدّ من
     * حافة البطاقة إلى حافتها — كل صفّ مرفق مؤطَّرٌ بحدّه الخاص، فيقف داخل الحشو.
     */
    <Card className="gap-2.5 px-5">
      <h3 className="flex items-center gap-1.5 text-t-body font-semibold">
        المرفقات <span className="font-normal text-text-muted">{ar(rows.length)}</span>
      </h3>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {rows.length === 0 && active.length === 0 ? (
        <p className="text-t-caption text-text-muted">
          لا مرفقات بعد. تُنسخ إلى مكتبة ملفاتك على هذا الجهاز.
        </p>
      ) : null}

      {rows.map((file) => (
        <div key={file.id} className={ROW}>
          <span className={KIND_BADGE}>{file.badge}</span>
          <span className="flex min-w-0 grow flex-col gap-0.5">
            {/*
             * اسم الملفّ يُكسر في أيّ موضع: أسماء التنزيلات تأتي كلمةً واحدة
             * طويلة بلا مسافة، وهي في عمودٍ عرضه ٣٠٠px — فتفيض على حدّ الصفّ.
             */}
            <span className="wrap-anywhere text-t-label font-semibold">{file.name}</span>
            <span className="text-t-caption text-text-muted">
              {file.kind} · {formatBytes(file.sizeBytes)}
            </span>
          </span>
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded-sm p-1.5 text-text-muted transition-colors duration-200 ease-motion hover:bg-error-bg hover:text-error-text"
            onClick={() => void detach(file)}
            aria-label={`إزالة ${file.name} من الدرس`}
            title="يُزال من الدرس ويبقى في مكتبة ملفاتك"
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      ))}

      {active.map((event) => (
        <div key={event.name} className={ROW}>
          <span className={KIND_BADGE}>…</span>
          <span className="flex min-w-0 grow flex-col gap-0.5">
            <span className="wrap-anywhere text-t-label font-semibold">{event.name}</span>
            {event.failed ? (
              <span className="text-t-caption text-error-text">
                توقّف النسخ قبل أن يكتمل. تأكّد أن الملف ما زال في مكانه ثم أعد المحاولة.
              </span>
            ) : event.done ? (
              <span className="text-t-caption text-text-muted">اكتمل</span>
            ) : (
              <>
                <span className="text-t-caption text-text-muted">
                  {formatBytes(event.copied)} من {formatBytes(event.total)}
                </span>
                {/*
                 * شريط محدَّد بنسبة حقيقية — لا يُعرض إلا حين تكون النسبة معلومة:
                 * الحالتان الأخريان أعلاه («اكتمل» و«توقّف») تخرجان قبله.
                 *
                 * واسمه المسموع اسمُ الملفّ نفسه: «٦٠٪» بلا مرجع لا تقول ٦٠٪ من
                 * ماذا، والنسخ يجري على ملفّات عدّة في وقت واحد.
                 */}
                <Progress
                  className="mt-1"
                  value={event.copied}
                  max={event.total}
                  label={event.name}
                />
              </>
            )}
          </span>
        </div>
      ))}

      <p className="text-t-caption text-text-muted">
        المرفقات تُحفظ على هذا الجهاز داخل مكتبة ملفاتك.
      </p>

      {busy ? (
        <Button variant="secondary" size="sm" disabled disabledReason="جارٍ النسخ…">
          إضافة مرفق
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => void add()}>
          إضافة مرفق
        </Button>
      )}
    </Card>
  );
}
