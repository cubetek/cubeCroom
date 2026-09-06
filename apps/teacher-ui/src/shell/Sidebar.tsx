'use client';

import { useCallback, useRef } from 'react';
import { BrandLogo, BrandMark, Icon, Tooltip, TooltipContent, TooltipTrigger, ar, cn } from '@cubecroom/ui';
import type { ClassSummary } from '@cubecroom/contracts';
import type { OpenTarget } from '../screens/Classes';
import { NAV_ICONS, NAV_TITLES, type NavKey, type Tab } from './tabs';

/**
 * الشريط الجانبي — قابل للطيّ ولسحب حافّته.
 *
 * **وترتيبه هو ترتيب D7 حرفياً** (الرئيسية · الفصول · الملفات · الذكاء
 * الاصطناعي · الإعدادات · النسخ الاحتياطي · تشخيص الاتصال). الذي نُقض من
 * القرار هو **التسطيح** لا الترتيب: «الفصول» صارت تُفتح لتُظهر فصول المعلم
 * تحتها، والنقض مسجَّل في `docs/design/06-decisions.md`.
 */

export const MIN_WIDTH = 208;
export const MAX_WIDTH = 420;

/**
 * العتبة التي يطوي عندها الوضعُ التلقائيّ — **رقمٌ مقيس لا مختار**.
 *
 * هو نفسه حدُّ `max-[1180px]` أدناه، ومصدرهما واحد: أضيق سطحٍ يبلغه المعلم
 * بسحب الحافة 1008px (`minWidth: 1024` وللنافذة إطار)، وقياسُ كل ثمانية
 * بكسلات وجد أن اسم الفصل في بطاقة الحصة يبقى سطرين حتى 1144px ولا يعود
 * سطراً واحداً إلّا عند 1152 — فالحدّ يسبق نطاق العطل كلّه ولا يقصّ طرفه.
 *
 * ويُصدَّر ليقرأه `Shell` في `matchMedia`: الرقم في موضعين لأنّ أحدهما CSS
 * والآخر JavaScript، ولا يقرأ استعلامُ Tailwind ثابتاً من وحدة. فمن غيّره
 * غيّرهما — والسطر هنا هو ما يقول ذلك.
 */
export const AUTO_COLLAPSE_BELOW = 1180;

const ORDER: readonly NavKey[] = [
  'home',
  'classes',
  'files',
  'ai',
  'settings',
  'backup',
  'diagnostics',
];

export type SidebarProps = {
  readonly active: Tab;
  readonly classes: readonly ClassSummary[];
  readonly aiConnected: boolean;
  readonly teacherName: string;
  readonly collapsed: boolean;
  readonly width: number;
  readonly expandedClasses: boolean;
  readonly onToggleClasses: () => void;
  readonly onNavigate: (key: NavKey) => void;
  readonly onOpenClass: (classId: string, section: OpenTarget['section'], className: string) => void;
  readonly onResize: (width: number) => void;
  readonly footer: React.ReactNode;
};

export function Sidebar({
  active,
  classes,
  aiConnected,
  teacherName,
  collapsed,
  width,
  expandedClasses,
  onToggleClasses,
  onNavigate,
  onOpenClass,
  onResize,
  footer,
}: SidebarProps) {
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null);

  /**
   * السحب بأحداث المؤشّر لا الفأرة، و`setPointerCapture` معها.
   *
   * بلا الالتقاط يفلت السحب حين يعبر المؤشّرُ إطارَ المحتوى بسرعة، فيتوقّف
   * العرض في منتصف حركةٍ لم تنتهِ.
   */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      dragging.current = { startX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const from = dragging.current;
      if (from === null) return;
      /*
       * **الطرح لا الجمع** — والواجهة RTL.
       *
       * الشريط على اليمين ومقبضه على حافته اليسرى، فسحبُ المقبض يساراً
       * (نقصانُ `clientX`) يوسّعه. والجمع هنا كان سيجعل السحب يعمل معكوساً:
       * تسحب لتوسّع فيضيق.
       */
      onResize(from.startWidth + (from.startX - event.clientX));
    },
    [onResize],
  );

  const endDrag = useCallback(() => {
    dragging.current = null;
  }, []);

  return (
    <nav
      className={cn(
        'relative flex shrink-0 flex-col bg-canvas',
        /*
         * سقفٌ للعرض دون 1180px — **وهو حارسُ مقاسٍ قائم لا تحسين.**
         *
         * القشرة القديمة كانت تضيق إلى 208px هنا بقياسٍ مكتوب: أضيق سطحٍ
         * يبلغه المعلم بسحب الحافة 1008px (`minWidth: 1024` وللنافذة إطار)،
         * فشريطٌ بـ256px يترك للمحتوى 704px — و`responsive.e2e.mjs` يسقط على
         * الفيضان الناتج.
         *
         * والعرض الآن يأتي من `style` (يسحبه المعلم ويُحفظ)، والسطر المضمّن
         * يتقدّم على الصنف — فيُحدّ بـ`max-width` لا بـ`width`: العرض المحفوظ
         * يبقى كما اختاره، ويُقصّ عرضُه المرسوم عند المقاس الضيّق وحده.
         */
        'max-[1180px]:max-w-52',
        // الطيّ لا يُحرَّك عرضُه بانتقال: السحب يغيّر العرض كل إطار، والانتقال
        // يجعله يتأخّر خلف الإصبع.
        collapsed && 'transition-[width] duration-150 ease-motion',
      )}
      style={{ width: collapsed ? 'var(--width-sidebar-collapsed)' : `${width}px` }}
      aria-label="التنقّل الرئيسي"
    >
      <div className={cn('flex h-14 shrink-0 items-center border-b border-hairline', collapsed ? 'justify-center px-2' : 'px-4')}>
        {collapsed ? <BrandMark /> : <BrandLogo wordmarkClassName="text-t-h3" />}
      </div>

      <div className="flex min-h-0 grow flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
        {ORDER.map((key) => {
          const isClasses = key === 'classes';
          const isActive = active.nav === key && (!isClasses || active.target === null);

          return (
            <div key={key}>
              <NavRow
                icon={key}
                label={NAV_TITLES[key]}
                collapsed={collapsed}
                active={isActive}
                onClick={() => onNavigate(key)}
                trailing={
                  isClasses && !collapsed ? (
                    <>
                      <span className="text-t-caption text-text-muted">{ar(classes.length)}</span>
                      {/*
                       * زرّ الطيّ منفصل عن صفّ التنقّل ولا يلفّه.
                       *
                       * زرٌّ داخل زرّ HTML غير صالح، ويجعل قارئ الشاشة يعلن
                       * عنصراً واحداً بفعلين. والفصل هنا يجعل «افتح الفصول»
                       * و«اعرض فصولي» فعلين مستقلّين كما هما في الواقع.
                       */}
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={expandedClasses ? 'إخفاء قائمة الفصول' : 'إظهار قائمة الفصول'}
                        aria-expanded={expandedClasses}
                        className="grid size-5 cursor-pointer place-items-center rounded hover:bg-surface-2"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleClasses();
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          event.stopPropagation();
                          onToggleClasses();
                        }}
                      >
                        <Icon
                          name="chevron-down"
                          size={15}
                          className={cn(
                            'transition-transform duration-150',
                            !expandedClasses && 'rtl:rotate-90 ltr:-rotate-90',
                          )}
                        />
                      </span>
                    </>
                  ) : key === 'ai' && !collapsed ? (
                    <span
                      className={cn('size-1.75 rounded-full', aiConnected ? 'bg-success' : 'bg-border-input')}
                      role="img"
                      aria-label={aiConnected ? 'الذكاء الاصطناعي متصل' : 'الذكاء الاصطناعي غير مرتبط'}
                    />
                  ) : null
                }
              />

              {isClasses && expandedClasses && !collapsed ? (
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {classes.length === 0 ? (
                    <li className="px-3 py-1.5 ps-9 text-t-caption text-text-muted">لا فصول بعد</li>
                  ) : (
                    classes.map((one) => {
                      const open = active.target?.classId === one.id;
                      return (
                        <li key={one.id}>
                          <button
                            type="button"
                            className={cn(
                              'flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pe-3 ps-9',
                              'text-start text-t-label text-text-2 hover:bg-surface-2',
                              open && 'bg-primary-soft font-semibold text-primary-on-soft',
                            )}
                            onClick={() => onOpenClass(one.id, 'lessons', one.name)}
                          >
                            <span className="truncate">{one.name}</span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-auto shrink-0 border-t border-hairline p-2.5">
        {collapsed ? (
          <div
            className="mx-auto grid size-8 place-items-center rounded-full bg-surface-2 font-semibold text-text-2"
            aria-hidden
          >
            {teacherName.trim().charAt(0)}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div
              className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-text-2"
              aria-hidden
            >
              {teacherName.trim().charAt(0)}
            </div>
            <div className="min-w-0 grow">
              <div className="truncate text-t-label font-semibold">{teacherName}</div>
              <div className="text-t-caption text-text-muted">هذا الجهاز</div>
            </div>
            {footer}
          </div>
        )}
      </div>

      {/*
       * مقبض السحب — `separator` بقيمةٍ ومدى، لا `<div>` يُسحب.
       *
       * فمن لا يستعمل فأرة يغيّر العرض بالأسهم، ويسمع قارئُ الشاشة القيمة
       * الحالية بدل أن يجد عنصراً بلا معنى. والقياسات هي حدود `onResize` نفسها.
       */}
      {!collapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="عرض الشريط الجانبي"
          aria-valuenow={width}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          tabIndex={0}
          className={cn(
            'absolute inset-y-0 start-0 w-1.5 cursor-col-resize',
            'hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none',
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(event) => {
            // في RTL يوسّع السهم الأيسر ويضيّق الأيمن — كاتّجاه السحب نفسه.
            if (event.key === 'ArrowLeft') onResize(width + 16);
            else if (event.key === 'ArrowRight') onResize(width - 16);
            else return;
            event.preventDefault();
          }}
        />
      ) : null}
    </nav>
  );
}

function NavRow({
  icon,
  label,
  collapsed,
  active,
  onClick,
  trailing,
}: {
  icon: NavKey;
  label: string;
  collapsed: boolean;
  active: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  const row = (
    <button
      type="button"
      className={cn(
        'flex h-(--height-control) w-full cursor-pointer items-center gap-2.5 rounded-md px-3',
        'text-start text-t-body text-text-2 hover:bg-surface-2',
        collapsed && 'justify-center px-0',
        // الحالة النشطة: خلفية ولون ووزن معاً — فلا يحمل اللون المعنى وحده.
        active && 'bg-primary-soft font-semibold text-primary-on-soft hover:bg-primary-soft',
      )}
      aria-current={active ? 'page' : undefined}
      /*
       * الاسم المقروء يُعلن دائماً — **وهذا شرطُ عملِ فحصٍ قائم لا تحسين.**
       *
       * `responsive.e2e.mjs` و`flow.e2e.mjs` ينقران عناصر التنقّل بنصّها
       * المرئي (`clickText` يقرأ `innerText`). وعند الطيّ يختفي الملصق،
       * فيصير الزرّ بلا اسمٍ لقارئ الشاشة **وبلا هدفٍ للفحص**. فيُحمل الاسم
       * في `aria-label` أيضاً — يعمل مطويّاً ومبسوطاً.
       */
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={NAV_ICONS[icon]} size={19} className="shrink-0" />
      {!collapsed ? <span className="grow truncate">{label}</span> : null}
      {trailing}
    </button>
  );

  // مطويّاً يبقى الاسم مرئياً بطريقةٍ أخرى: تلميحٌ عند الوقوف.
  if (!collapsed) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}
