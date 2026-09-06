'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  ar,
  formatBytes,
} from '@cubecroom/ui';
import {
  BACKUP_NOTICE,
  RESTORE_ACKNOWLEDGEMENT,
  type BackupRow,
  type BackupState,
  type RestorePreview,
} from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { when } from './Lessons';

/**
 * T20Backup · T20Restore — النسخ الاحتياطي والاستعادة (FR-015).
 *
 * **الاستعادة العملية الوحيدة في هذا المنتج التي تمحو عمل المعلم وطلابه.**
 * ولذلك لا يُعرض زرّها قبل أن يُحسب ما سيُفقد ويُعرض بعدده — ومعلمٌ يقرأ «٣
 * دروس · ١٢ إجابة» يقرّر قراراً، ومعلمٌ يقرأ «ستُستبدل بياناتك» يقامر.
 *
 * والنسخة التالفة **تبقى معروضة** ولا تُخفى: معلمٌ يبحث عن نسخة أمس ولا يجدها
 * يظن أنه لم يأخذها، والحقيقة أنها موجودة وتوقّفت قبل أن تكتمل — وذلك يغيّر ما
 * سيفعله الآن.
 */

/** نصّ الحوار: مقاس الجسم لا مقاس التلميح — الفقرة هنا تُقرأ لا تُلمَح. */
const DIALOG_TEXT = 'text-t-body text-text-2';

export function Backup() {
  const [state, setState] = useState<BackupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<BackupRow | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [restored, setRestored] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await bridge().backupState());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة النسخ الاحتياطية.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await bridge().backupCreate());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إنشاء النسخة.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: BackupRow) => {
    setBusy(true);
    try {
      setState(await bridge().backupDelete({ path: row.path }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر حذف النسخة.');
    } finally {
      setBusy(false);
    }
  };

  // الفحص العميق يجري هنا لا في القائمة: هو ما يسبق الاستبدال لا ما يزيّن جدولاً.
  const ask = async (row: BackupRow) => {
    setTarget(row);
    setPreview(null);
    setAcknowledged(false);
    setPreview(await bridge().restorePreview({ path: row.path }));
  };

  const restore = async () => {
    if (target === null) return;
    setBusy(true);
    try {
      const result = await bridge().restoreRun({ path: target.path });
      if (result.status === 'refused') {
        setError(result.message);
        setTarget(null);
      } else {
        setRestored(result.safetyBackupPath);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّرت الاستعادة.');
      setTarget(null);
    } finally {
      setBusy(false);
    }
  };

  if (state === null) {
    return <div className="m-auto text-text-muted">{error ?? 'نقرأ النسخ الاحتياطية…'}</div>;
  }

  const complete = state.backups.filter((row) => row.status === 'complete');

  /*
   * العنوان والأزرار يتبعان حال الاستعادة — فحصٌ، ثم رفضٌ أو تأكيد، ثم تمام —
   * فيُحسبان هنا لأن الحوار يرسم كلاً منهما في موضع واحد مهما تغيّر الحال.
   */
  const restoreTitle =
    restored !== null
      ? 'تمت الاستعادة'
      : preview === null
        ? 'استعادة نسخة احتياطية'
        : preview.status === 'refused'
          ? 'لا يمكن الاستعادة من هذه النسخة'
          : `استعادة نسخة ${when(preview.createdAt)}؟`;

  /* حالتا الفحص والتمام بلا أزرار: الأولى تنتظر، والثانية يليها إغلاق التطبيق. */
  const restoreFooter =
    restored !== null || preview === null ? undefined : preview.status === 'refused' ? (
      <Button variant="secondary" onClick={() => setTarget(null)}>
        إغلاق
      </Button>
    ) : (
      <>
        <Button variant="secondary" onClick={() => setTarget(null)}>
          إبقاء الوضع الحالي
        </Button>
        {/* لا يُفعَّل قبل الإقرار: هذا آخر ما يقف بين المعلم وبين محو عمله. */}
        {acknowledged && !busy ? (
          <Button variant="danger" onClick={() => void restore()}>
            استعادة هذه النسخة
          </Button>
        ) : (
          <Button
            variant="danger"
            disabled
            disabledReason={busy ? 'جارٍ التنفيذ…' : 'علّم الإقرار أولاً.'}
          >
            استعادة هذه النسخة
          </Button>
        )}
      </>
    );

  return (
    <div className="flex min-h-0 grow flex-col gap-3.5 overflow-auto">
      {/* الترويسة تلتفّ: زرّاها لا ينكمشان دون كلمتيهما، والتاريخ لا ينكسر. */}
      <Card className="flex-row flex-wrap items-center gap-4 px-5 py-4.5">
        <div className="min-w-[220px] grow">
          <div className="text-t-label font-semibold text-text-muted">آخر نسخة احتياطية</div>
          <div className="mt-0.5 text-t-h1 tabular-nums">
            {state.lastBackupAt === null ? 'لم تأخذ نسخة بعد' : when(state.lastBackupAt)}
          </div>
          <div className="mt-1 text-t-label tabular-nums text-text-2">{contentsLine(state)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void bridge().backupOpenFolder()}>
            فتح مجلد النسخ
          </Button>
          {busy ? (
            <Button variant="primary" disabled disabledReason="جارٍ التنفيذ…">
              جارٍ الإنشاء…
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void create()}>
              إنشاء نسخة احتياطية الآن
            </Button>
          )}
        </div>
      </Card>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {/*
        التنبيه دائم لا عارض: ليس تحذيراً من عطل بل وصفٌ للمنتج — لا خادم يحتفظ
        بنسخة ثانية، ومجلد النسخ هو كل ما بين المعلم وبين فقدان سنة عمل. ولذلك
        بلا `live`: قارئ الشاشة لا يُقاطَع به عند كل دخول للشاشة.
      */}
      <Alert tone="pending">{BACKUP_NOTICE}</Alert>

      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-t-h3 font-bold">
          النسخ المحفوظة{' '}
          <span className="text-t-label tabular-nums text-text-muted">
            {ar(state.backups.length)}
          </span>
        </h3>
        {/* المسار كلمة واحدة بلا مسافة: بلا كسرها يفيض السطر. */}
        <div className="ltr-island wrap-anywhere text-t-caption text-text-muted" dir="ltr">
          {state.directory}
        </div>
      </div>

      {state.backups.length === 0 ? (
        <div className="text-t-label text-text-muted">
          لا نسخة بعد. أنشئ واحدة الآن — الأمر يستغرق ثوانيَ.
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-hairline bg-surface">
          {state.backups.map((row) => (
            <li
              key={row.path}
              className="flex items-center gap-3 border-b border-hairline px-4.5 py-3.5 last:border-b-0"
            >
              <div className="min-w-0 grow">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-t-body font-semibold tabular-nums">
                    {row.createdAt === null ? row.name : when(row.createdAt)}
                  </span>
                  {row === complete[0] ? <Badge tone="ok">الأحدث</Badge> : null}
                  {row.status === 'damaged' ? <Badge tone="error">لا تصلح</Badge> : null}
                </div>
                <div className="mt-0.5 text-t-label tabular-nums text-text-muted">
                  {formatBytes(row.sizeBytes)}
                  {row.status === 'complete' ? ' · اكتملت' : ''}
                </div>
                {/* التالفة تبقى معروضة بسببها: إخفاؤها يجعل المعلم يظن أنه لم يأخذها. */}
                {row.reason === undefined ? null : (
                  <div className="mt-1 text-t-caption text-error-text">{row.reason}</div>
                )}
              </div>
              {row.status === 'complete' ? (
                <Button variant="secondary" size="sm" onClick={() => void ask(row)}>
                  استعادة
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => void remove(row)}>
                  حذف
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {target !== null ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{restoreTitle}</DialogTitle>
            </DialogHeader>

            {restored !== null ? (
              <>
                <DialogDescription className={DIALOG_TEXT}>
                  سيُغلق التطبيق ويُعاد فتحه الآن ببيانات تلك النسخة.
                </DialogDescription>
                <p className={DIALOG_TEXT}>
                  ووضعك السابق محفوظ كاملاً — إن ندمت فاستعده من هذه النسخة:
                </p>
                <div className="ltr-island wrap-anywhere text-t-caption text-text-muted" dir="ltr">
                  {restored}
                </div>
              </>
            ) : preview === null ? (
              <DialogDescription className={DIALOG_TEXT}>
                نفحص النسخة فحصاً كاملاً…
              </DialogDescription>
            ) : preview.status === 'refused' ? (
              <DialogDescription className={DIALOG_TEXT}>{preview.message}</DialogDescription>
            ) : (
              <>
                <DialogDescription className={DIALOG_TEXT}>
                  سيُستبدل كل ما على هذا الجهاز الآن بمحتوى تلك النسخة.
                </DialogDescription>

                {lossLines(preview).length > 0 ? (
                  <>
                    <div className="text-t-label font-semibold text-text-muted">
                      سيُفقد كل ما أُنشئ بعد ذلك الوقت:
                    </div>
                    <ul className="ps-5 text-t-label tabular-nums text-error-text">
                      {lossLines(preview).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className={DIALOG_TEXT}>
                    لم نجد شيئاً أُنشئ بعد تلك النسخة — ومع ذلك سيُستبدل كل شيء بمحتواها.
                  </p>
                )}

                <Alert tone="ok">
                  سنحفظ الوضع الحالي أولاً. قبل بدء الاستعادة تُؤخذ نسخة احتياطية كاملة تلقائياً
                  لما على جهازك الآن — فإن ندمت، استعدها منها.
                </Alert>

                {/*
                  هدف نقر واسع: هذا آخر ما يقف بين المعلم وبين محو عمله. والصندوق
                  على العنوان نفسه لا على غلافٍ حوله، فيبلغ النقرُ المربّعَ من أيّ
                  موضع في الحشو.
                */}
                <Label className="cursor-pointer items-start gap-2.5 rounded-md border border-input bg-canvas px-3.5 py-3">
                  <Checkbox
                    checked={acknowledged}
                    onCheckedChange={(next) => setAcknowledged(next === true)}
                  />
                  <span>{RESTORE_ACKNOWLEDGEMENT}</span>
                </Label>

                <p className="text-t-caption text-text-muted">
                  سيُغلق التطبيق ويُعاد فتحه بعد الاستعادة. أنهِ أي جلسة دخول مفتوحة أولاً.
                </p>
              </>
            )}

            {restoreFooter === undefined ? null : <DialogFooter>{restoreFooter}</DialogFooter>}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/** سطر «تشمل ٦ فصول · ٢٤ درساً…» — من محتوى الجهاز الآن لا من آخر نسخة. */
function contentsLine(state: BackupState): string {
  const { classes, lessons, activities, submissions, files, fileBytes } = state.current;
  const parts = [
    `${ar(classes)} فصلاً`,
    `${ar(lessons)} درساً`,
    `${ar(activities)} نشاطاً`,
    `${ar(submissions)} إجابة`,
    `${ar(files)} ملفاً`,
  ];
  /*
   * الفاصل فاصلةٌ عربية لا نقطة وسطى.
   *
   * النقطة بين رقمين عربيَّين تنهار بصرياً في الاتجاه من اليمين: «١ · ٠ درساً»
   * تُقرأ «١٠ درساً». ومعلمٌ بلا دروس يقرأ أن له عشرة.
   */
  return `تشمل ${parts.join('، ')} — ${formatBytes(fileBytes)}`;
}

/** لا يُذكر بابٌ لن يُفقد منه شيء: صفرٌ في القائمة ضجيج يُخفي ما يهمّ. */
function lossLines(preview: Extract<RestorePreview, { status: 'ready' }>): string[] {
  const { classes, lessons, activities, submissions, files } = preview.loss;
  const lines: string[] = [];
  if (classes > 0) lines.push(`${ar(classes)} فصلاً`);
  if (lessons > 0) lines.push(`${ar(lessons)} درساً`);
  if (activities > 0) lines.push(`${ar(activities)} نشاطاً`);
  if (submissions > 0) lines.push(`${ar(submissions)} إجابة طالب`);
  if (files > 0) lines.push(`${ar(files)} ملفاً`);
  return lines;
}
