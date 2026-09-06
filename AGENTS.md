# Project memory and engineering principles

These requirements were explicitly set by the project owner on 2026-09-05.
Apply them to all work in this repository.

## Cross-platform compatibility

- The application must work on Linux, macOS, and Windows.
- Consider all three platforms when designing, implementing, reviewing, and validating changes, including development scripts, builds, packaging, and runtime behavior.
- Use portable APIs for paths, files, processes, and environment handling. Isolate unavoidable platform-specific behavior behind clear interfaces.
- Verify affected behavior on the relevant platforms when available, and explicitly report any platform that has not been verified.

## Centralization, performance, and maintainability

- Centralize shared business logic, configuration, types, and reusable functionality in appropriate modules or packages with a single source of truth.
- Reuse existing abstractions and avoid duplicated implementations while keeping module responsibilities and dependencies clear.
- Design for scalability, high performance, and straightforward maintenance. Consider resource usage, data growth, and concurrency where relevant.
- Base performance optimizations on evidence and preserve correctness and readability. Avoid unnecessary complexity and premature abstractions.

## Styling

- Use Tailwind CSS utilities and the shared shadcn components in `packages/ui` for application UI. Do not add component CSS files, CSS Modules, or another styling system.
- Keep product tokens and Tailwind/shadcn base configuration centralized in `packages/ui/src/styles/globals.css`; import it directly from application layouts.
- CSS entry points required by Tailwind and existing documentation-library styles are build infrastructure. Do not delete them without replacing their functionality.
- Keep static styling in Tailwind classes. Runtime measurements (such as progress percentages and screenshot annotation coordinates) may be passed as CSS custom properties consumed by utilities; do not build dynamic class names that Tailwind cannot detect.
- Historical HTML design references in `docs/design` are not runtime application styles. Keep them intact unless a design-artifact migration is requested.
