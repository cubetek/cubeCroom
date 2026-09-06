'use client';

import { Icon, cn } from '@cubecroom/ui';
import type { Tab } from './tabs';

/**
 * شريط التبويبات — ما هو مفتوح الآن.
 *
 * يظهر حين يُفتح أكثر من واحد فقط: شريطٌ بتبويب وحيد يأخذ ٣٦px من ارتفاع
 * الشاشة ولا يقول شيئاً لا يقوله كسرُ المسار فوقه.
 */

export type TabBarProps = {
  readonly tabs: readonly Tab[];
  readonly activeId: string;
  readonly onFocus: (id: string) => void;
  readonly onClose: (id: string) => void;
};

export function TabBar({ tabs, activeId, onFocus, onClose }: TabBarProps) {
  if (tabs.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label="التبويبات المفتوحة"
      className="flex h-9 shrink-0 items-stretch gap-px overflow-x-auto border-b border-hairline bg-surface-2"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={cn(
              'group flex min-w-0 shrink-0 items-center gap-2 border-e border-hairline px-3',
              isActive ? 'bg-surface text-text' : 'bg-surface-2 text-text-muted hover:bg-surface/60',
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              className="flex min-w-0 cursor-pointer items-center gap-2 text-t-label"
              onClick={() => onFocus(tab.id)}
            >
              <Icon name={tab.icon} size={15} className="shrink-0" />
              <span className="max-w-40 truncate">{tab.title}</span>
            </button>

            {tab.permanent === true ? null : (
              <button
                type="button"
                /*
                 * زرّ الإغلاق ظاهرٌ دائماً لا عند الوقوف وحده.
                 *
                 * الظهور بالوقوف يعمل بالفأرة، ولا يعمل بلوحة المفاتيح ولا
                 * باللمس — ويجعل عرض التبويب يتغيّر تحت المؤشّر فيقفز الشريط.
                 */
                className="grid size-4.5 shrink-0 cursor-pointer place-items-center rounded text-text-muted hover:bg-hairline hover:text-text"
                aria-label={`إغلاق ${tab.title}`}
                onClick={() => onClose(tab.id)}
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
