# Third-party notices

Dependencies, fonts, icons and Electron/Chromium retain their own licenses. CubeCroom's [LICENSE](LICENSE) and commercial licensing option do not replace those terms.

## Generated application notices

Every desktop staging run generates `resources/legal/dependencies/THIRD-PARTY-NOTICES.txt` and its `inventory.json`. The text contains original LICENSE, LICENCE, COPYING, COPYRIGHT and NOTICE files from installed dependencies, including notices embedded in Next.js's compiled dependencies. It also retains relevant inline copyright comments. Packages without a root legal file retain their original README and package metadata; standard license texts are supplied separately with their upstream source revision.

The inventory deliberately includes development, optional and transitive dependencies installed for the build. Desktop, teacher and student bundles can contain code from packages declared as development dependencies, so a production-only package list would omit relevant inputs. It also includes build tools that are not shipped. Inclusion in this inventory is not a statement that a package is distributed in the executable.

The generator uses the standard [pnpm license listing](https://pnpm.io/cli/licenses) and package listing, then reads the actual installed directories, including nested dependencies in pnpm's hoisted layout. It records exact component versions, original license declarations, source paths and text hashes. Unknown declarations remain visible. `css-value@0.0.1`, for example, has no license field but supplies its copyright and MIT license in its original Readme.md, which is retained.

The full [SPDX license texts](https://github.com/spdx/license-list-data) in `docs/legal/spdx-license-texts` supplement the original notices. `sources.json` pins their upstream revision and hashes. Template copyright placeholders in those standard texts are not assertions about a component's copyright owners. Original notices remain authoritative; this inventory does not select between alternative licenses or certify compatibility, distribution rights or source-offer obligations.

To regenerate the notices independently after `pnpm install --frozen-lockfile`:

```sh
pnpm exec node scripts/release/notices.mjs
```

This writes `apps/desktop/out-notices/`. `pnpm package` and `pnpm make` regenerate the notices automatically inside their isolated staging directory. Builds use the vendored standard texts without fetching license files from the network. Packaging checks that the generated inventory and complete notice text are present and unchanged. Regenerate and inspect them after dependency updates; a newly declared standard license requires its full source text to be added.

## Other packaged materials

| Material | Packaged notice path, relative to `resources/legal` |
| --- | --- |
| Electron and its Node.js/Chromium components | `electron/LICENSE`, `electron/LICENSES.chromium.html` |
| IBM Plex Sans Arabic and IBM Plex Mono | `third-party-licenses/ibm-plex-sans-arabic-LICENSE.txt`, `third-party-licenses/ibm-plex-mono-LICENSE.txt` |
| Installed JavaScript dependencies and their bundled notices | `dependencies/THIRD-PARTY-NOTICES.txt`, `dependencies/inventory.json` |
| CubeCroom's project terms | `LICENSE`, `COMMERCIAL-LICENSE.md`, `TRADEMARKS.md` |

Electron's own root license files are also left in place. Font license texts are copied from the installed packages without modification; applicable Reserved Font Name provisions remain in force.

Sharp and `@img/sharp-*` remain installed as Next.js build dependencies, so they appear in the conservative inventory. Student image optimization is disabled, and the app does not use Sharp. Next.js tracing excludes these packages from the standalone application, and packaging verifies their absence. Their native image-library license declarations therefore describe build tooling, not native libraries distributed by this application.

Website images and screenshots are separate from dependency notices. See [release documentation](docs/legal/release-readiness.md) for the remaining release checks and provenance of project assets.
