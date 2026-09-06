'use client';

import { useEffect } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  Icon,
} from '@cubecroom/ui';
import type { ClassSummary } from '@cubecroom/contracts';
import type { OpenTarget } from '../screens/Classes';
import { NAV_ICONS, NAV_TITLES, SECTION_TITLES, type NavKey } from './tabs';

/**
 * لوحة الأوامر — `ctrl/⌘ + K`.
 *
 * تبلغ ما لا يبلغه الشريط الجانبي: أقسام الفصل نفسها. فمن أراد «طلبات دخول
 * الصف السادس» كان يمرّ بثلاث نقرات — الفصول، ثمّ الفصل، ثمّ التبويب — وصار
 * يكتب «طلبات» ويضغط Enter.
 */

const ORDER: readonly NavKey[] = [
  'home',
  'classes',
  'files',
  'ai',
  'settings',
  'backup',
  'diagnostics',
];

const SECTIONS: readonly OpenTarget['section'][] = ['lessons', 'students', 'requests', 'access'];

export type CommandPaletteProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly classes: readonly ClassSummary[];
  readonly onNavigate: (key: NavKey) => void;
  readonly onOpenClass: (classId: string, section: OpenTarget['section'], className: string) => void;
};

export function CommandPalette({
  open,
  onOpenChange,
  classes,
  onNavigate,
  onOpenClass,
}: CommandPaletteProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /*
       * `metaKey` و`ctrlKey` معاً: التطبيق يُشحن لماك وويندوز ولينكس، و⌘
       * على الأول و`ctrl` على الآخرين. وفحصُ أحدهما يترك ثلث المستخدمين بلا
       * اختصار — ولا رسالة تقول لهم لماذا.
       */
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      onOpenChange(!open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  /** الاختيار يغلق اللوحة دائماً — فعلٌ واحد لا يُترك نصفه. */
  const pick = (run: () => void) => {
    run();
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="اذهب إلى شاشة أو فصل…" />
      <CommandList>
        <CommandEmpty>لا نتائج.</CommandEmpty>

        <CommandGroup heading="الشاشات">
          {ORDER.map((key) => (
            <CommandItem
              key={key}
              value={NAV_TITLES[key]}
              onSelect={() => pick(() => onNavigate(key))}
            >
              <Icon name={NAV_ICONS[key]} size={17} />
              <span>{NAV_TITLES[key]}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {classes.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="الفصول">
              {classes.flatMap((one) =>
                SECTIONS.map((section) => (
                  <CommandItem
                    key={`${one.id}:${section}`}
                    /*
                     * القيمة تحمل الاسمين معاً، فيجد المعلمُ الصفَّ بكتابة
                     * اسمه، والقسمَ بكتابة اسمه — ولا يلزمه أن يعرف أيّهما
                     * يسبق في الترتيب.
                     */
                    value={`${one.name} ${SECTION_TITLES[section]}`}
                    onSelect={() => pick(() => onOpenClass(one.id, section, one.name))}
                  >
                    <Icon name="book" size={17} />
                    <span className="truncate">{one.name}</span>
                    <CommandShortcut>{SECTION_TITLES[section]}</CommandShortcut>
                  </CommandItem>
                )),
              )}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
