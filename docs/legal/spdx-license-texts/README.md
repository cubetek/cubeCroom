# Standard license texts

These are verbatim standard license texts from the SPDX License List data repository. [sources.json](sources.json) records the immutable upstream commit, original URL and SHA-256 of each file. The notice generator verifies the hashes before using the texts and does not download anything during a build.

They supplement the original component notices collected from installed packages; they do not assign a license or a copyright holder. Placeholders such as `<year>` and `<copyright holders>` are part of SPDX's standard text and are intentionally left unchanged. Component-specific copyright notices remain in the original package files and generated notice bundle.

After adding a dependency with a new license identifier, copy its full standard text from the [SPDX License List data](https://github.com/spdx/license-list-data/tree/3ac5a9c241d97f95b22a5e366c9c841404a35639/text), record its source and hash in `sources.json`, and regenerate the notices. Preserve original package LICENSE and NOTICE texts as well.
