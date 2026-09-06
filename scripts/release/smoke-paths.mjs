import { lstat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export function isInside(parent, child) {
  const difference = relative(parent, child);
  return difference !== '' && difference !== '..' && !difference.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(difference);
}

/** Resolve existing ancestors too: an ignored test path must not escape through a symlink. */
export async function safeSmokePath(value, { root, kind = 'data', temporaryRoot = tmpdir() }) {
  if (!isAbsolute(value)) throw new Error('Smoke overrides must be absolute paths');
  const candidate = resolve(value);
  if ([resolve(root), join(resolve(root), '.cubeflow', 'reports'), resolve(temporaryRoot)].includes(candidate)) {
    throw new Error('Smoke overrides must name a dedicated child path');
  }
  const allowed = [kind === 'executable' ? resolve(root) : join(resolve(root), '.cubeflow', 'reports'), resolve(temporaryRoot)];
  if (!allowed.some(parent => isInside(parent, candidate))) throw new Error(`Unsafe smoke ${kind} path`);
  let ancestor = candidate;
  while (true) {
    try { await lstat(ancestor); break; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new Error('Smoke path has no existing ancestor');
      ancestor = parent;
    }
  }
  const resolved = resolve(await realpath(ancestor), relative(ancestor, candidate));
  const realAllowed = await Promise.all(allowed.map(async parent => {
    try { return await realpath(parent); } catch (error) { if (error.code === 'ENOENT') return parent; throw error; }
  }));
  if (!realAllowed.some(parent => isInside(parent, resolved))) throw new Error('Smoke path escapes its allowed root through a symlink');
  return candidate;
}
