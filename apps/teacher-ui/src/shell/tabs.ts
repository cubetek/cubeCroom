'use client';

import { useCallback, useMemo, useState } from 'react';
import type { IconName } from '@cubecroom/ui';
import type { OpenTarget } from '../screens/Classes';

/**
 * التبويبات المفتوحة — نموذج «ما يعمل عليه المعلم الآن».
 *
 * **ولماذا نموذجٌ منفصل لا حالتان في `Home`:** كانت الوجهة `active` و
 * `openTarget`، وهما يصفان **وجهةً واحدة**. والتبويبات تصف قائمةً منها،
 * فمعلمٌ يقارن درساً بإجابات طلابه لا يفقد أحدهما ليرى الآخر.
 *
 * **والشاشات لا تعلم بهذا كلّه.** التبويب النشط يُشتقّ منه `active` و
 * `openTarget` بالشكل نفسه الذي كانت `Home` تمرّره — فعشرون شاشة تبقى كما هي
 * حرفياً. ولو حملت كل شاشة علمَ تبويبها لصار كل تبويب جديد تعديلاً فيها كلّها.
 */

export type NavKey =
  | 'home'
  | 'classes'
  | 'learning'
  | 'agents'
  | 'files'
  | 'ai'
  | 'settings'
  | 'backup'
  | 'diagnostics';

export type Tab = {
  /** مفتاحٌ مشتقّ من الوجهة لا رقمٌ متزايد — فتحُ ما هو مفتوح يركّز لا يُكرّر. */
  readonly id: string;
  readonly nav: NavKey;
  readonly target: OpenTarget | null;
  readonly title: string;
  readonly icon: IconName;
  /** كسر التبويب: عنوان الفصل يعيش في هذا المسار لا في عنوان النافذة. */
  readonly crumbs: readonly string[];
  /** الرئيسية لا تُغلق — مرساةٌ تمنع شاشةً بلا شيء فيها. */
  readonly permanent?: boolean;
};

export const NAV_TITLES: Record<NavKey, string> = {
  home: 'الرئيسية',
  classes: 'الفصول',
  learning: 'تجارب التعلّم',
  agents: 'فريق المساعدين',
  files: 'الملفات',
  ai: 'الذكاء الاصطناعي',
  settings: 'الإعدادات',
  backup: 'النسخ الاحتياطي',
  diagnostics: 'تشخيص الاتصال',
};

export const NAV_ICONS: Record<NavKey, IconName> = {
  home: 'home',
  classes: 'book',
  learning: 'check-circle',
  agents: 'sparkles',
  files: 'folder',
  ai: 'sparkles',
  settings: 'sliders',
  backup: 'database',
  diagnostics: 'wifi',
};

/** أسماء أقسام الفصل كما يقرؤها المعلم — لا `lessons` في كسر التبويب. */
export const SECTION_TITLES: Record<OpenTarget['section'], string> = {
  access: 'دخول الطلاب',
  requests: 'طلبات الدخول',
  lessons: 'الدروس',
  students: 'الطلاب',
};

const HOME_TAB: Tab = {
  id: 'nav:home',
  nav: 'home',
  target: null,
  title: NAV_TITLES.home,
  icon: NAV_ICONS.home,
  crumbs: [NAV_TITLES.home],
  permanent: true,
};

function navTab(key: NavKey): Tab {
  return {
    id: `nav:${key}`,
    nav: key,
    target: null,
    title: NAV_TITLES[key],
    icon: NAV_ICONS[key],
    crumbs: [NAV_TITLES[key]],
    ...(key === 'home' ? { permanent: true } : {}),
  };
}

function classTab(className: string, target: OpenTarget): Tab {
  return {
    /*
     * القسم جزءٌ من المفتاح: «دروس الصف السادس» و«طلاب الصف السادس» وجهتان،
     * وجمعُهما في تبويب واحد يجعل فتح الثانية يبدّل الأولى تحت اسمها.
     */
    id: `class:${target.classId}:${target.section}`,
    nav: 'classes',
    target,
    title: className,
    icon: NAV_ICONS.classes,
    crumbs: [NAV_TITLES.classes, className, SECTION_TITLES[target.section]],
  };
}

export type TabsApi = {
  readonly tabs: readonly Tab[];
  readonly activeId: string;
  readonly active: Tab;
  readonly openNav: (key: NavKey) => void;
  readonly openClass: (classId: string, section: OpenTarget['section'], className: string) => void;
  readonly focus: (id: string) => void;
  readonly close: (id: string) => void;
};

export function useTabs(): TabsApi {
  const [tabs, setTabs] = useState<readonly Tab[]>([HOME_TAB]);
  const [activeId, setActiveId] = useState<string>(HOME_TAB.id);

  /** يفتح أو يركّز — التمييز يقع على المفتاح لا على نيّة المستدعي. */
  const open = useCallback((tab: Tab) => {
    setTabs((current) => (current.some((one) => one.id === tab.id) ? current : [...current, tab]));
    setActiveId(tab.id);
  }, []);

  const openNav = useCallback((key: NavKey) => open(navTab(key)), [open]);

  const openClass = useCallback(
    (classId: string, section: OpenTarget['section'], className: string) =>
      open(classTab(className, { classId, section })),
    [open],
  );

  const close = useCallback((id: string) => {
    setTabs((current) => {
      const at = current.findIndex((one) => one.id === id);
      if (at < 0 || current[at]?.permanent === true) return current;

      const next = current.filter((one) => one.id !== id);
      setActiveId((focused) => {
        if (focused !== id) return focused;
        /*
         * الجار الأقرب لا الأول دائماً: من أغلق التبويب الخامس يتوقّع الرابع
         * أو السادس، لا أن يُقذف إلى أول القائمة.
         */
        return (next[at] ?? next[at - 1] ?? HOME_TAB).id;
      });
      return next;
    });
  }, []);

  const active = useMemo(
    // التبويب النشط قد يُغلق بين رسمتين — والرئيسية موجودة دائماً.
    () => tabs.find((one) => one.id === activeId) ?? HOME_TAB,
    [tabs, activeId],
  );

  return { tabs, activeId, active, openNav, openClass, focus: setActiveId, close };
}
