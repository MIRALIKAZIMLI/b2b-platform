import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const WORKSPACE_DIRS = ['apps', 'packages'];
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

// Kesin sürüm: 1.2.3 veya 1.2.3-rc.1 gibi. Workspace içi bağlantılar (workspace:*) serbest.
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

interface PackageJson {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  pnpm?: { overrides?: Record<string, string> };
}

function findPackageJsonFiles(): string[] {
  const files = [join(ROOT, 'package.json')];
  for (const dir of WORKSPACE_DIRS) {
    const base = join(ROOT, dir);
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        files.push(join(base, entry.name, 'package.json'));
      }
    }
  }
  return files;
}

function findLooseVersions(): string[] {
  const problems: string[] = [];
  for (const file of findPackageJsonFiles()) {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as PackageJson;
    const name = relative(ROOT, file);
    for (const field of DEPENDENCY_FIELDS) {
      for (const [dep, version] of Object.entries(pkg[field] ?? {})) {
        if (version.startsWith('workspace:')) continue;
        if (!EXACT_VERSION.test(version)) {
          problems.push(`${name} ${field}.${dep}: "${version}"`);
        }
      }
    }
    for (const [dep, version] of Object.entries(pkg.pnpm?.overrides ?? {})) {
      if (!EXACT_VERSION.test(version)) {
        problems.push(`${name} pnpm.overrides.${dep}: "${version}"`);
      }
    }
    if (pkg.packageManager !== undefined && !/^pnpm@\d+\.\d+\.\d+$/.test(pkg.packageManager)) {
      problems.push(`${name} packageManager: "${pkg.packageManager}"`);
    }
  }
  return problems;
}

describe('Paket sürümleri', () => {
  it('F0.3-AC4: paket sürümleri sabit (^, ~, aralık yok)', () => {
    expect(findLooseVersions()).toEqual([]);
  });
});
