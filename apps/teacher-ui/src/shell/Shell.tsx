'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  TooltipProvider,
  cn,
  useTheme,
  type Theme,
} from '@cubecroom/ui';
import type { HomeState } from '@cubecroom/contracts';
import type { OpenTarget } from '../screens/Classes';
import { CommandPalette } from './CommandPalette';
import { AUTO_COLLAPSE_BELOW, MAX_WIDTH, MIN_WIDTH, Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import type { NavKey, TabsApi } from './tabs';

export type { NavKey } from './tabs';

/**
 * قشرة واجهة المعلم.
 *
 * التخطيط: شريطٌ جانبيّ يُطوى ويُسحب · كسرُ مسار بدل عنوانٍ مفرد · تبويبات
 * لما هو مفتوح · عمودُ محتوى محدود العرض · شريطُ حالةٍ في القاع.
 *
 * **وما يخالف قراراً مسجَّلاً موضعُه `docs/design/06-decisions.md`** — بندان:
 * تداخلُ الفصول تحت «الفصول» (نقضُ تسطيح D7)، والوضعُ الداكن (نقضُ A3).
 * والترتيب السباعيّ نفسه لم يُمسّ.
 */

/**
 * تفضيلات القشرة تعيش في `localStorage` لا في القاعدة.
 *
 * **إعدادُ جهازٍ لا إعدادُ معلم** — كما المنفذ في `config.json` والسمة في
 * `theme.tsx`: شاشةُ الحاسوب المحمول تُطوى وشاشةُ المكتب تُبسط، ومعلمٌ يستعيد
 * نسخته على جهاز المدرسة لا يجرّ معه عرضَ شريطٍ ضبطه لشاشةٍ أخرى.
 */
const KEYS = {
  /** الاسم جديد لأن القيمة تغيّرت من `boolean` إلى ثلاثة أوضاع. */
  sidebar: 'cubecroom.shell.sidebar',
  /** المفتاح القديم — يُقرأ مرّةً للترقية ثمّ لا يُكتب. */
  legacyCollapsed: 'cubecroom.shell.collapsed',
  width: 'cubecroom.shell.width',
  classes: 'cubecroom.shell.classesOpen',
} as const;

/**
 * أوضاع الشريط الثلاثة.
 *
 * `auto` ليس وضعاً ثالثاً بين الاثنين، بل **قاعدةٌ تقرّر بينهما**: يُطوى دون
 * `AUTO_COLLAPSE_BELOW` ويُبسط فوقها. ومن اختار `expanded` أو `collapsed` فقد
 * قرّر بنفسه، فلا يُنقض قراره حين يُغيَّر مقاس النافذة.
 */
export type SidebarMode = 'expanded' | 'collapsed' | 'auto';

/**
 * الافتراضي `expanded` لا `auto` — **وهذا قيدُ فحصٍ قائم لا تفضيل**.
 *
 * `responsive.e2e.mjs` يقيس عند 1024px، وهي دون العتبة: فـ`auto` تطوي الشريط
 * هناك. و`clickText` في `e2e/helpers.mjs` يطابق على `innerText` وحده — لا على
 * الاسم المُعلن — والطيّ يُخفي الملصق. فيصير الحارس يبحث عن «الفصول» ولا يجدها،
 * ويسقط على تغييرٍ في الافتراضات لا على عطلٍ في الواجهة.
 *
 * فمن أراد `auto` افتراضاً فليجعل `clickText` يقرأ `aria-label` أيضاً — وهو
 * الأصحّ على أي حال: الاسم المُعلن هو عقد الزرّ، والنصّ المرئي إحدى صوره.
 */
const DEFAULT_MODE: SidebarMode = 'expanded';

function readMode(): SidebarMode {
  try {
    const raw = localStorage.getItem(KEYS.sidebar);
    if (raw === 'expanded' || raw === 'collapsed' || raw === 'auto') return raw;
    // ترقيةُ التفضيل القديم: من طوى الشريط أمس يجده مطويّاً اليوم.
    const legacy = localStorage.getItem(KEYS.legacyCollapsed);
    if (legacy !== null) return legacy === '1' ? 'collapsed' : 'expanded';
    return DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // يبقى الاختيار في هذه الجلسة — ولا تسقط القشرة لأن الحفظ ممنوع.
  }
}

/** الحدّ يُفرض هنا لا عند المستدعي: السحب والأسهم كلاهما يمرّ من هذا الباب. */
function clampWidth(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

export type ShellProps = {
  readonly tabs: TabsApi;
  readonly home: HomeState;
  readonly teacherName: string;
  readonly aiConnected?: boolean | undefined;
  readonly topbarExtra?: ReactNode;
  readonly children: ReactNode;
};

export function Shell({
  tabs,
  home,
  teacherName,
  aiConnected = false,
  topbarExtra,
  children,
}: ShellProps) {
  /*
   * القيم الافتراضية أولاً ثمّ المحفوظة في `useEffect`.
   *
   * قراءةُ `localStorage` أثناء أول رسم تجعل ما يُصيَّر على الخادم مخالفاً لما
   * يُصيَّر في المتصفّح فيسقط الترطيب — والواجهة تصدير ثابت، فأول رسمٍ يجري
   * وقت البناء لا على جهاز المعلم.
   */
  const [mode, setMode] = useState<SidebarMode>(DEFAULT_MODE);
  /** هل النافذة ضيّقة الآن؟ — لا معنى لها إلّا في الوضع التلقائيّ. */
  const [narrow, setNarrow] = useState(false);
  const [width, setWidth] = useState(256);
  const [classesOpen, setClassesOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setMode(readMode());
    setClassesOpen(readBool(KEYS.classes, true));
    try {
      const raw = localStorage.getItem(KEYS.width);
      if (raw !== null) setWidth(clampWidth(Number(raw)));
    } catch {
      // العرض الافتراضي يكفي.
    }
  }, []);

  /*
   * الضيق يُتابَع بـ`matchMedia` لا بـ`resize`.
   *
   * `resize` يُطلق عشرات المرّات في الثانية أثناء سحب حافة النافذة، وكلٌّ منها
   * إعادةُ رسمٍ للقشرة كلّها. و`matchMedia` يُطلق مرّتين لا غير: عند عبور
   * العتبة ذهاباً وإياباً — وهو ما يُسأل عنه فعلاً.
   */
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${AUTO_COLLAPSE_BELOW - 1}px)`);
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  /** ما هو مطبَّق فعلاً بعد حلّ `auto` — الشريط لا يعرف الأوضاع، يعرف هذه. */
  const collapsed = mode === 'collapsed' || (mode === 'auto' && narrow);

  const chooseMode = useCallback((next: SidebarMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEYS.sidebar, next);
    } catch {
      // يبقى الاختيار في هذه الجلسة — ولا تسقط القشرة لأن الحفظ ممنوع.
    }
  }, []);

  /*
   * الطيّ السريع يخرج من `auto` إلى قرارٍ صريح.
   *
   * ومن ضغط `ctrl+B` وهو في `auto` يقصد **عكسَ ما يراه الآن** لا الرجوع إلى
   * قاعدة: فتُقلب الحالة المحسوبة، ويصير الاختيار صريحاً.
   */
  const toggleCollapsed = useCallback(() => {
    chooseMode(collapsed ? 'expanded' : 'collapsed');
  }, [chooseMode, collapsed]);

  const resize = useCallback((next: number) => {
    const value = clampWidth(next);
    setWidth(value);
    try {
      localStorage.setItem(KEYS.width, String(value));
    } catch {
      // كما أعلاه.
    }
  }, []);

  const toggleClasses = useCallback(() => {
    setClassesOpen((current) => {
      writeBool(KEYS.classes, !current);
      return !current;
    });
  }, []);

  // ctrl/⌘ + B — الاصطلاح نفسه في VS Code، ولا يُخترع له بديل.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'b' || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, [role="textbox"]'))) return;
      event.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  const openClass = (classId: string, section: OpenTarget['section'], className: string) =>
    tabs.openClass(classId, section, className);

  return (
    <TooltipProvider delayDuration={300}>
      {/*
         * `h-dvh` لا `h-full`: ارتفاعُ النافذة نفسها لا نسبةٌ من الأب.
         *
         * فلا يتوقّف امتلاءُ الشاشة على سلسلةِ آباءَ كلٌّ منهم يعلن ارتفاعه —
         * وهي السلسلة التي انكسرت أصلاً. و`dvh` لا `vh` لأن الأولى تتبع
         * الارتفاع الفعليّ حين يتغيّر.
         */}
      <div className="flex h-full overflow-hidden bg-canvas">
        <Sidebar
          active={tabs.active}
          classes={home.classes}
          aiConnected={aiConnected}
          teacherName={teacherName}
          collapsed={collapsed}
          width={width}
          expandedClasses={classesOpen}
          onToggleClasses={toggleClasses}
          onNavigate={(key: NavKey) => tabs.openNav(key)}
          onOpenClass={openClass}
          onResize={resize}
          footer={<ThemeToggle />}
        />

        <div className="mb-1 me-1 flex min-w-0 grow flex-col overflow-hidden rounded-xl border border-hairline bg-surface">
          <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline bg-surface px-3.5">
            {/*
             * زرّان لا زرّ واحد: النقر يطوي ويبسط، والقائمة تختار الوضع.
             *
             * وجمعُهما في زرٍّ يدور على ثلاث حالات يجعل الفعلَ الشائع — طيٌّ
             * وبسطٌ — رهناً بعدد الضغطات، ويخفي أيّ وضعٍ نحن فيه أصلاً.
             */}
            <div className="flex shrink-0 items-center rounded-md text-text-2">
              <button
                type="button"
                className="grid size-8 cursor-pointer place-items-center rounded-s-md hover:bg-surface-2"
                aria-label={collapsed ? 'إظهار الشريط الجانبي' : 'إخفاء الشريط الجانبي'}
                aria-expanded={!collapsed}
                onClick={toggleCollapsed}
              >
                <Icon name="sidebar" size={18} />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  className="grid h-8 w-5 cursor-pointer place-items-center rounded-e-md hover:bg-surface-2"
                  aria-label="وضع الشريط الجانبي"
                >
                  <Icon name="chevron-down" size={14} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-52">
                  <DropdownMenuLabel>الشريط الجانبي</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={mode}
                    onValueChange={(next) => chooseMode(next as SidebarMode)}
                  >
                    <DropdownMenuRadioItem value="expanded">مبسوط دائماً</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="collapsed">مطويّ دائماً</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="auto">
                      تلقائيّ
                      {/*
                       * الوصف داخل الخيار لا في تلميح: «تلقائيّ» وحدها لا تقول
                       * تلقائيّ تبعاً لماذا — والعتبة هي جوابُ السؤال.
                       */}
                      <span className="block text-t-caption text-text-muted">
                        يُطوى حين تضيق النافذة
                      </span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Breadcrumbs crumbs={tabs.active.crumbs} />

            <div className="grow" />

            <button
              type="button"
              className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-hairline px-2.5 text-t-caption text-text-muted hover:bg-surface-2"
              onClick={() => setPaletteOpen(true)}
            >
              <Icon name="search" size={15} />
              <span>بحث</span>
              {/*
               * الاختصار مكتوب لاتينياً وأرقامُه ليست أرقاماً — D6 يخصّ ما
               * يُقرأ عدداً، و`Ctrl K` اسمُ مفتاحين على لوحة المفاتيح نفسها.
               */}
              <kbd className="rounded border border-hairline bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
                Ctrl K
              </kbd>
            </button>

            {topbarExtra}
          </header>

          <TabBar
            tabs={tabs.tabs}
            activeId={tabs.activeId}
            onFocus={tabs.focus}
            onClose={tabs.close}
          />

          {/*
           * عمودٌ محدود العرض في وسط الشاشة.
           *
           * سطرٌ يمتدّ عبر شاشةٍ عريضة يُفقد القارئَ أوّلَه حين يبلغ آخره،
           * و`--width-content-max` هو الحدّ المعتمد في 05-foundations.md.
           * والتوسيط بـ`mx-auto` على غلافٍ داخل الحاوية المُمرِّرة لا على
           * الحاوية نفسها: التمرير يبقى على العرض كلّه، فشريطُه عند حافة
           * النافذة حيث يتوقّعه المعلم لا عند حافة العمود.
           */}
          <main className="min-h-0 grow overflow-auto">
            <div className="mx-auto flex w-full max-w-(--width-content-max) flex-col gap-5 p-6">
              {children}
            </div>
          </main>

          <StatusBar
            home={home}
            aiConnected={aiConnected}
            onOpenSession={() => {
              const target = home.session?.classId;
              if (target !== undefined) openClass(target, 'access', home.session?.className ?? '');
              else tabs.openNav('classes');
            }}
            onOpenDiagnostics={() => tabs.openNav('diagnostics')}
          />
        </div>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          classes={home.classes}
          onNavigate={(key) => tabs.openNav(key)}
          onOpenClass={openClass}
        />
      </div>
    </TooltipProvider>
  );
}

/**
 * كسر المسار — «الفصول › الصف السادس › الدروس».
 *
 * يحلّ محلّ العنوان المفرد: ذاك كان يقول «الفصول» والمعلم داخل درسٍ في فصل،
 * فلا يقول أين هو ولا كيف يعود. والأخير `aria-current` لأنه الموضع لا رابط.
 */
function Breadcrumbs({ crumbs }: { crumbs: readonly string[] }) {
  return (
    <nav aria-label="مسار الصفحة" className="flex min-w-0 items-center gap-1.5">
      {crumbs.map((crumb, at) => {
        const last = at === crumbs.length - 1;
        return (
          <span key={`${crumb}-${at}`} className="flex min-w-0 items-center gap-1.5">
            {at > 0 ? (
              <Icon name="chevron-next" size={14} className="shrink-0 text-text-muted" />
            ) : null}
            <span
              className={cn(
                'truncate',
                last ? 'text-t-h3 font-semibold text-text' : 'text-t-body text-text-muted',
              )}
              aria-current={last ? 'page' : undefined}
            >
              {crumb}
            </span>
          </span>
        );
      })}
    </nav>
  );
}

const THEMES: readonly { key: Theme; label: string; icon: 'sun' | 'moon' | 'monitor' }[] = [
  { key: 'light', label: 'فاتح', icon: 'sun' },
  { key: 'dark', label: 'داكن', icon: 'moon' },
  { key: 'system', label: 'تبعاً للنظام', icon: 'monitor' },
];

/**
 * مبدّل السمة — ثلاثة أزرار لا زرّ يدور.
 *
 * الزرّ الدوّار يخفي الحالة الحالية ويجعل الوصول إلى «تبعاً للنظام» رهناً
 * بعدد الضغطات. وثلاثةٌ ظاهرة تقول ما هو مختار وتبلغ أيّها بضغطة.
 */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="سمة الواجهة"
      className="flex shrink-0 items-center gap-0.5 rounded-md border border-hairline p-0.5"
    >
      {THEMES.map((one) => (
        <button
          key={one.key}
          type="button"
          aria-label={one.label}
          aria-pressed={theme === one.key}
          className={cn(
            'grid size-6 cursor-pointer place-items-center rounded text-text-muted hover:bg-surface-2',
            theme === one.key && 'bg-primary-soft text-primary-on-soft',
          )}
          onClick={() => setTheme(one.key)}
        >
          <Icon name={one.icon} size={14} />
        </button>
      ))}
    </div>
  );
}
