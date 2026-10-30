// Sözleşme kontrolü (F1.12, ADR-0022). Kullanım: kökten `pnpm contract:check` (CI `contract` işi).
// 1. packages/api-client yeniden üretilir; depodakiyle fark varsa hata (istemci güncel değil).
// 2. Uygulamanın şeması (@nestjs/swagger, bağlantısız) openapi.yaml ile yol + metot + yanıt kodu
//    düzeyinde karşılaştırılır: uygulamada olup sözleşmede olmayan → hata; tersi → uyarı.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  compareOperations,
  readContractOperations,
  readDocumentOperations,
} from './contract-compare.mts';

const ROOT = resolve(import.meta.dirname, '..');
const CONTRACT = join(ROOT, 'docs/03-architecture/api/openapi.yaml');
/** Sabit komut satırı (kullanıcı girdisi yok); Windows'ta pnpm.cmd için kabuk gerekir. */
function run(commandLine: string): string {
  return execSync(commandLine, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function checkGeneratedClient(): boolean {
  run('pnpm -s generate:api');
  // Çalışma ağacı ↔ index farkı ve izlenmeyen dosya (CI'da index = commit).
  const changed = [
    run('git diff --name-only -- packages/api-client'),
    run('git ls-files --others --exclude-standard -- packages/api-client'),
  ]
    .join('')
    .trim();
  if (changed === '') {
    process.stdout.write('contract: packages/api-client güncel.\n');
    return true;
  }
  process.stderr.write(
    `contract: HATA üretilmiş istemci güncel değil. "pnpm generate:api" çalıştırıp değişikliği ekleyin:\n${changed}\n`,
  );
  return false;
}

function checkAppAgainstContract(): boolean {
  run('pnpm -s --filter @b2b/shared build');
  run('pnpm -s --filter @b2b/api build');
  const json = run('node apps/api/dist/cli.js openapi:export');
  const app = readDocumentOperations(
    JSON.parse(json) as Parameters<typeof readDocumentOperations>[0],
  );
  const contract = readContractOperations(readFileSync(CONTRACT, 'utf8'));
  const { errors, warnings } = compareOperations(app, contract);

  process.stdout.write(
    `contract: uygulamada ${String(app.size)} uç, openapi.yaml'da ${String(contract.size)} uç; ` +
      `${String(warnings.length)} uç henüz yazılmadı (uyarı).\n`,
  );
  if (process.env.CONTRACT_VERBOSE === '1') {
    for (const warning of warnings) process.stdout.write(`contract: uyarı ${warning}\n`);
  }
  for (const error of errors) process.stderr.write(`contract: HATA ${error}\n`);
  return errors.length === 0;
}

const clientOk = checkGeneratedClient();
const appOk = checkAppAgainstContract();
if (!clientOk || !appOk) {
  process.exitCode = 1;
} else {
  process.stdout.write('contract:check tamamlandı: sözleşme ile uygulama uyumlu.\n');
}
