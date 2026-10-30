// openapi.yaml → src/schema.d.ts (F1.12, ADR-0022). Kullanım: kökten `pnpm generate:api`.
// Çıktı deterministiktir: aynı sözleşme her çalıştırmada aynı dosyayı üretir (F1.12-AC1).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

export const CONTRACT_PATH = fileURLToPath(
  new URL('../../docs/03-architecture/api/openapi.yaml', import.meta.url),
);
export const SCHEMA_PATH = fileURLToPath(new URL('./src/schema.d.ts', import.meta.url));

const HEADER = `/**
 * ÜRETİLDİ — elle düzenleme.
 * Kaynak: docs/03-architecture/api/openapi.yaml · Yeniden üretmek için: pnpm generate:api
 */

`;

/** Sözleşme metninden şema dosyasının içeriğini üretir (dosyaya yazmaz). */
export async function generateSchema(contractYaml: string): Promise<string> {
  const ast = await openapiTS(contractYaml, { silent: true });
  return HEADER + astToString(ast).replace(/\r\n/g, '\n');
}

async function main(): Promise<void> {
  const contract = await readFile(CONTRACT_PATH, 'utf8');
  await writeFile(SCHEMA_PATH, await generateSchema(contract), 'utf8');
  process.stdout.write('generate:api tamamlandı: packages/api-client/src/schema.d.ts\n');
}

if (import.meta.main) {
  await main();
}
