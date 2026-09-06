# Lesson editor and desktop frame

Implemented 2026-09-06.

## Library choice

Tiptap 3.31.3 is the best fit for this repository's existing React, Tailwind and shadcn components. Its editor core and StarterKit use the MIT license, support bidirectional text, and let us keep UI styling in `packages/ui`. No cloud service or paid extension is required.

The alternatives reviewed were BlockNote (a more complete block editor with Arabic localization, but an additional opinionated UI integration) and Lexical (a lean framework requiring more assembly of editor features). Tiptap supplies the editing behavior while allowing the existing shared components to own the toolbar and dialogs.

- [Tiptap MIT license](https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md)
- [Tiptap RTL support](https://tiptap.dev/docs/examples/basics/text-direction)
- [Tiptap React performance guidance](https://tiptap.dev/docs/guides/performance)
- [BlockNote localization](https://www.blocknotejs.org/docs/features/localization)
- [Lexical](https://lexical.dev/)

## Shared data and rendering

`packages/contracts` owns the section definitions, validated rich text JSON, learning cards, legacy conversion, excerpts and plain text extraction. `content`, `outcomes` and `summary` are independent sections. The default lesson workspace shows the organized student page; teacher preparation, manual editing and attachments have separate tabs.

The existing lesson JSON column continues to store rich text and learning cards. Opening a legacy lesson converts its blocks in memory only, and manual editing replaces only the selected section. The [lesson agent](./lesson-agent.md) adds separate persistence for teacher preparation and guarded undo, and saves the lesson with its linked check activity. Teacher preparation stays outside student content.

The teacher preview and student page use the same React renderer and typography from `packages/ui`. It renders a fixed set of nodes and marks, never raw HTML. Link protocols, total characters, node count and nesting depth are bounded by the shared contract. The student does not download Tiptap.

## Editor lifecycle and saving

The editor loads dynamically when entering manual editing. Each section initializes on its first visit and remains mounted while switching its section tabs; leaving manual editing unmounts it. Tiptap transaction rendering is disabled; toolbar state subscribes only to relevant changes. Rich document references are retained so an autosave or parent update does not replace the active document and reset its cursor.

Autosave waits one second after an edit and serializes writes through a revision queue. Edits made during a save are included before flushing completes. Failed writes remain dirty and can be retried. Publishing and the editor's Back button await the latest save; a failure prevents either action. Existing window blur/unmount flushing remains in use.

The agent prepares and saves the full lesson after one natural request. The workspace locks editing during preparation, flushes local changes before the request, and adopts the returned lesson as the new clean baseline. It never queues an old draft after the server transaction. Guarded undo restores the previous lesson, preparation and activity; a valid undo token can be restored when reopening the lesson.

## Desktop window

Electron hides the native title text and keeps native window controls: the macOS traffic lights, or the Windows/Linux title bar overlay. A shared frame provides the drag region on every screen, including onboarding. Native overlay colors are read from the shared theme tokens and sent through a validated IPC method. The sidebar keyboard shortcut ignores editable fields so it cannot consume the editor's bold shortcut.

Development output is isolated in `.next-dev`; production exports remain in `out-next` so building does not invalidate an active development session.

Reference: [Electron custom title bars](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar).

## Verification

- Contract tests cover legacy content, independent sections, formatting round trips, unsafe links and document limits.
- Save queue tests cover slow overlapping writes and failed saves before publication.
- `pnpm test:lesson-editor` runs the actual Electron application with an isolated temporary profile, exercises the editor, and captures light/dark screenshots at desktop and minimum window sizes.
- Native execution is verified on Windows. Linux and macOS require native verification on those platforms.
