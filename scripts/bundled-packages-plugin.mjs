import fs from 'node:fs';
import path from 'node:path';

/**
 * v1.4.1 stop 21 (B): records which npm packages really ended up in the built bundles (main page and the Web Workers), from the module list of every output chunk.
 * It is the source of the generated part of dist/THIRD_PARTY_NOTICES.txt (scripts/append-npm-notices.mjs). Nothing here is written by hand and nothing is taken from memory.
 * The module ids of a chunk are the files Rolldown/Vite really put into it; a package that is only imported by tests, by the server (server.mjs is built with --packages=external) or by dev tooling never appears.
 */
export const BUNDLED_PACKAGES_MANIFEST = path.join('node_modules', '.cache', 'specreader', 'bundled-packages.json');

/** module id -> {name, version, root} of the npm package that owns the file, or null (project source, virtual module without an owner). */
export function packageOfModuleId(id) {
  const clean = id.split('?')[0];
  if (clean.startsWith('\0')) {
    // Vite / Rolldown virtual helpers (preload helper, runtime): their code is part of the vite / rolldown packages
    if (/^\0vite\//.test(clean)) return {name: 'vite', virtual: clean};
    if (/^\0rolldown\//.test(clean)) return {name: 'rolldown', virtual: clean};
    return null;
  }
  const norm = clean.split(String.fromCharCode(92)).join('/');
  const i = norm.lastIndexOf('/node_modules/');
  if (i < 0) return null;
  const rest = norm.slice(i + '/node_modules/'.length).split('/');
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  const root = norm.slice(0, i + '/node_modules/'.length) + name;
  return {name, root};
}

export function bundledPackagesPlugin(manifestPath = BUNDLED_PACKAGES_MANIFEST) {
  return {
    name: 'specreader-bundled-packages',
    apply: 'build',
    generateBundle(_options, bundle) {
      const found = new Map();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of chunk.moduleIds ?? Object.keys(chunk.modules ?? {})) {
          const pkg = packageOfModuleId(id);
          if (!pkg) continue;
          const key = pkg.root ?? `virtual:${pkg.name}`;
          const entry = found.get(key) ?? {name: pkg.name, root: pkg.root ?? null, chunks: new Set(), files: 0};
          entry.chunks.add(chunk.fileName); entry.files++; found.set(key, entry);
        }
      }
      // several plugin instances (main build, every worker build) write into the same manifest: merge by package root
      let manifest = {packages: {}};
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* first writer */ }
      for (const [key, e] of found) {
        const old = manifest.packages[key] ?? {name: e.name, root: e.root, chunks: [], files: 0};
        old.chunks = [...new Set([...old.chunks, ...e.chunks])].sort(); old.files += e.files; manifest.packages[key] = old;
      }
      fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
    },
  };
}

/** removes a manifest of an earlier build (called once at the start of a build, before any chunk is written) */
export function resetBundledPackagesManifest(manifestPath = BUNDLED_PACKAGES_MANIFEST) {
  try { fs.rmSync(manifestPath, {force: true}); } catch { /* nothing to remove */ }
}
