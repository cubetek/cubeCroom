'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, ar, formatBytes } from '@cubecroom/ui';
import { when } from '@cubecroom/contracts';
import type { BackupRow } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * الاستعادة من مسار الاسترجاع — `T01States/٣` · §22.
 *
 * **هذه الشاشة تعمل والقاعدة لا تُفتح** — وهو ما يميّزها عن `T20`. لا محتوى
 * يُقارَن ولا «سيُفقد كذا»: لا شيء يُقرأ منه ذلك. فالمعلم يختار نسخةً بتاريخها
 * وحجمها، ويُقال له صراحةً أين تذهب بياناته الحالية.
 *
 * والأمان لا يسقط لأن القاعدة تالفة — **يتغيّر شكله**: بدل نسخة احتياطية
 * منها، تُعزَل ملفاته إلى مجلد مؤرَّخ ولا تُحذف. فإن كان التلف في مكان آخر،
 * أو كانت النسخة أسوأ، فعمله باقٍ.
 */

/**
 * اللوح عرضه ثابت لأنه يقف وحده وسط شاشة فارغة لا في عمود محتوى، و`max-w-full`
 * تردّه داخل الشاشة الضيّقة بدل أن يدفع التمرير الأفقيّ.
 */
const PANEL = 'flex w-140 max-w-full flex-col gap-3 text-start';

/** مسارُ ملفّ — قيمة تقنية: لاتينية ومونو ومعزولة عن اتجاه النصّ حولها. */
const PATH =
  'ltr-island rounded-sm border border-hairline bg-canvas px-3 py-2 text-t-mono text-text-2 wrap-anywhere';

export type RecoveryProps = {
  readonly onCancel: () => void;
};

export function Recovery({ onCancel }: RecoveryProps) {
  const [rows, setRows] = useState<BackupRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const list = await bridge().recoveryList();
        if (alive) setRows(list);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'تعذّرت قراءة النسخ.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const restore = async (row: BackupRow) => {
    setBusy(true);
    setError(null);
    try {
      const result = await bridge().recoveryRestore({ path: row.path });
      if (result.status === 'refused') setError(result.message);
      else setDone(result.safetyBackupPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّرت الاستعادة.');
    } finally {
      setBusy(false);
    }
  };

  if (done !== null) {
    return (
      <div className={PANEL}>
        <h2 className="text-t-h1">تمت الاستعادة</h2>
        <p className="text-t-body text-text-2">سيُغلق التطبيق ويُعاد فتحه الآن ببيانات تلك النسخة.</p>
        <p className="text-t-body text-text-2">وبياناتك السابقة لم تُحذف — نُقلت كما هي إلى:</p>
        <div className={PATH} dir="ltr">
          {done}
        </div>
      </div>
    );
  }

  const usable = (rows ?? []).filter((row) => row.status === 'complete');

  return (
    <div className={PANEL}>
      <h2 className="text-t-h1">استعادة نسخة احتياطية</h2>

      {/* `live` لأن هذا اللوح جوابُ فعلٍ للتوّ — لا وصفٌ دائم للشاشة. */}
      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {/*
       * الطمأنة بلون تنبيه لا خطر: المعلم هنا خائف على عمله، والجملة الوحيدة التي
       * تهمّه أن بياناته لن تُحذف — فتُعرض قبل القائمة لا بعدها.
       */}
      <Alert tone="pending">
        بياناتك الحالية <strong>لن تُحذف</strong>: ستُنقل كما هي إلى مجلد مؤرَّخ بجانبها قبل أن
        تحلّ النسخة محلها — فإن كان العطل في مكان آخر بقي عملك حيث تجده.
      </Alert>

      {rows === null ? (
        <p className="text-t-body text-text-2">نقرأ النسخ…</p>
      ) : usable.length === 0 ? (
        <p className="text-t-body text-text-2">
          لا نسخة صالحة في مجلد النسخ. إن كانت لديك نسخة على قرص خارجي فانسخها إلى مجلد النسخ
          بجانب بياناتك، ثم أعد فتح التطبيق.
        </p>
      ) : (
        /*
         * `max-h-65` سقفٌ لا ارتفاع: عشرون نسخة تدفع زرّ «رجوع» خارج الشاشة،
         * وثلاثٌ تترك فراغاً لو ثُبّت الارتفاع. و`overflow-x-hidden` تقصّ ما يخرج
         * من الأركان المدوّرة — الصفّ الأول والأخير بلا حدّ ظاهر عندها.
         */
        <ul className="max-h-65 overflow-x-hidden overflow-y-auto rounded-lg border border-hairline bg-surface">
          {usable.map((row) => (
            <li
              key={row.path}
              className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 grow">
                <div className="text-t-body font-semibold">
                  {row.createdAt === null ? row.name : when(row.createdAt, { time: 'always' })}
                </div>
                <div className="mt-0.5 text-t-label text-text-muted">
                  {formatBytes(row.sizeBytes)}
                  {row.contents === undefined
                    ? ''
                    : ` · ${ar(row.contents.lessons)} درساً · ${ar(row.contents.submissions)} إجابة`}
                </div>
              </div>
              {busy ? (
                <Badge tone="pending">جارٍ التنفيذ…</Badge>
              ) : (
                <Button variant="danger" size="sm" onClick={() => void restore(row)}>
                  استعادة هذه
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end pt-2">
        {busy ? (
          <Button variant="secondary" disabled disabledReason="جارٍ التنفيذ…">
            رجوع
          </Button>
        ) : (
          <Button variant="secondary" onClick={onCancel}>
            رجوع
          </Button>
        )}
      </div>
    </div>
  );
}
