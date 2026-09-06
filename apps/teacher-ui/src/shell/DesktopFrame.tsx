'use client';

import { useEffect, type ReactNode } from 'react';
import { BrandLogo, useTheme } from '@cubecroom/ui';
import { bridge, hasBridge } from '../lib/bridge';

/** Native system controls remain owned by Electron on Windows, macOS and Linux. */
export function DesktopFrame({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();
  useEffect(() => {
    if (!hasBridge()) return;
    const colors = getComputedStyle(document.documentElement);
    const api = bridge();
    // An already-open development window may still have the previous preload.
    if (api.windowAppearance)
      void api
        .windowAppearance({
          background: colors.getPropertyValue('--color-canvas').trim(),
          foreground: colors.getPropertyValue('--color-text-2').trim(),
        })
        .catch((error: unknown) => console.error('Window appearance update failed', error));
  }, [resolved]);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <div
        data-desktop-titlebar
        className="relative flex h-10 shrink-0 select-none items-center justify-center text-xs font-medium text-text-muted [-webkit-app-region:drag]"
        aria-label="شريط نافذة CubeCroom"
      >
        <BrandLogo className="pointer-events-none gap-1.5" markClassName="size-5 rounded-sm" wordmarkClassName="font-medium text-text-muted" />
      </div>
      <div className="min-h-0 grow overflow-auto">{children}</div>
    </div>
  );
}
