# Styling ground truth — 2026-09-05

## Repository evidence

The source scan found four `.css` files before this change and no CSS Modules,
SCSS, Sass, or Less files. Dependencies and generated build output are excluded.

| Original file | Finding and action |
| --- | --- |
| `apps/teacher-ui/app/globals.css` | Only imported the shared stylesheet and declared scan sources. Deleted; the layout imports the shared entry directly. |
| `apps/student-web/app/globals.css` | Same redundant wrapper. Deleted; the layout imports the shared entry directly. |
| `packages/ui/src/styles/globals.css` | Required Tailwind v4 entry, animation import, product tokens, shared base rules, and utility configuration. Retained with explicit shared-component source discovery. |
| `apps/docs/app/global.css` | Tailwind/Fumadocs entry plus custom overrides. Overrides moved to Tailwind classes in the root layout; only library imports and source directives remain. |

`packages/ui/components.json`, the shared component implementations, and package
dependencies confirm that shadcn/Radix and Tailwind were already in use. Removed
the unused `packages/ui/css-modules.d.ts` declaration and its TypeScript inclusion.

PostCSS now sets each product app's scan base from its configuration file URL,
using Node's portable `fileURLToPath`. The shared CSS explicitly scans its own
components. This preserves app-specific discovery without scanning the entire
repository or including historical design classes.

The shared icon component now flips directional icons with `rtl:-scale-x-100`.
Screenshot annotation geometry is supplied as CSS variables consumed by Tailwind
utilities. Progress percentages already followed that approach and remain intact.

## Boundaries

- Two source CSS entry points remain intentionally; this is not a zero-CSS repository.
- The documentation site still uses Fumadocs and its supplied styles. It has not
  been rebuilt as a shadcn-only documentation site.
- The 76 HTML reference files under `docs/design/screens` and `docs/design/canvas`
  contain embedded styles. These historical design artifacts are retained.
- `node_modules` and generated CSS bundles are not source styles to delete.

## Verification

- Workspace TypeScript check passed.
- Workspace ESLint check passed.
- Teacher UI and documentation production builds passed.
- The combined build failed during student standalone output copying with a
  missing `prerender-manifest.json`; rerunning the student build independently
  passed, including standalone asset copying.
- Fifteen checks against emitted CSS passed: shared colors, control heights,
  typography, progress width, RTL icons, documentation width/font/arrow rotation,
  and annotation coordinates.
- Validation ran on macOS. Linux/Windows builds and browser visual regression
  checks were not run for this change.

## Primary references

- [Tailwind source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)
- [Tailwind utilities and dynamic inline values](https://tailwindcss.com/docs/styling-with-utility-classes)
- [shadcn manual installation and its CSS entry](https://ui.shadcn.com/docs/installation/manual)
