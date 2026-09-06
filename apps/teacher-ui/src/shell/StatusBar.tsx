'use client';

import { Icon, ar, cn } from '@cubecroom/ui';
import type { HomeState } from '@cubecroom/contracts';

/**
 * شريط الحالة السفليّ.
 *
 * **ينقل حالة الحصة من الشريط العلوي إلى قاعٍ ثابت** — والفرق ليس موضعاً:
 * الشريط العلوي يحمل عنوان الشاشة وأفعالها، فالحالة فيه تزاحم ما يتغيّر مع كل
 * صفحة. والقاع لا يحمل غيرها، فتبقى في مكان واحد لا يتحرّك مهما تنقّل المعلم —
 * وهو نصّ FR-004: «الحالة مرئية من أي شاشة».
 *
 * ولا يُعرض هنا ما لا نعرفه: `HomeState` لا يحمل رقم المنفذ، فلا يُخترع له
 * مكان. ومن أراده وجده في «تشخيص الاتصال» حيث يُقاس فعلاً.
 */

export type StatusBarProps = {
  readonly home: HomeState;
  readonly aiConnected: boolean;
  readonly onOpenSession: () => void;
  readonly onOpenDiagnostics: () => void;
};

export function StatusBar({ home, aiConnected, onOpenSession, onOpenDiagnostics }: StatusBarProps) {
  const session = home.session;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3.5 border-t border-hairline bg-surface px-3.5 text-t-caption text-text-muted">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-surface-2"
        onClick={onOpenSession}
      >
        {/*
         * نقطةٌ ونصٌّ معاً لا نقطة وحدها — القاعدة نفسها في كل الحالات: اللون
         * لا يحمل المعنى وحده، فمن لا يميّز الأخضر من الأحمر يقرأ الجملة.
         */}
        <span
          className={cn(
            'size-1.75 rounded-full',
            session === null ? 'bg-border-input' : session.reachable ? 'bg-success' : 'bg-danger',
          )}
          aria-hidden
        />
        {session === null
          ? 'لا حصة مفتوحة'
          : session.reachable
            ? `دخول الطلاب متاح — ${session.className}`
            : `الطلاب لا يستطيعون الدخول — ${session.className}`}
      </button>

      {session !== null ? (
        <>
          <span aria-hidden className="h-3 w-px bg-hairline" />
          <span>{`متصلون: ${ar(session.connected)}`}</span>
          {session.pending > 0 ? <span>{`بانتظار الموافقة: ${ar(session.pending)}`}</span> : null}
        </>
      ) : null}

      {/* `ms-auto` لا `ml-auto`: المنطقيّ يضعه في طرف السطر أياً كان الاتجاه. */}
      <button
        type="button"
        className="ms-auto flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-surface-2"
        onClick={onOpenDiagnostics}
      >
        <Icon name="wifi" size={13} />
        تشخيص الاتصال
      </button>

      <span aria-hidden className="h-3 w-px bg-hairline" />
      <span className="flex items-center gap-1.5">
        <span
          className={cn('size-1.75 rounded-full', aiConnected ? 'bg-success' : 'bg-border-input')}
          aria-hidden
        />
        {aiConnected ? 'الذكاء الاصطناعي متصل' : 'الذكاء الاصطناعي غير مرتبط'}
      </span>
    </footer>
  );
}
