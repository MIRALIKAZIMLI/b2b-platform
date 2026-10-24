import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ERROR_CODES, isErrorCode } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import { ERROR_HTTP_STATUS, httpStatusOf } from '../http-map';

const ROOT = resolve(__dirname, '../../../../../..');
const DOCS = join(ROOT, 'docs');
// Görev kartları (docs/tasks) taslaktır; tek kaynak belgeler ve http-map.ts'tir.
const SKIPPED_DIRS = new Set([join(DOCS, 'tasks')]);
// "403 PERMISSION_DENIED" veya "403 `PERMISSION_DENIED`" kalıbı.
const STATUS_AND_CODE = /\b([1-5]\d{2})\s+`?([A-Z][A-Z0-9_]*[A-Z0-9])\b/g;

function listDocFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(path)) files.push(...listDocFiles(path));
    } else if (/\.(md|ya?ml)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

interface DocMention {
  readonly file: string;
  readonly status: number;
  readonly code: string;
}

function findDocMentions(): DocMention[] {
  const mentions: DocMention[] = [];
  for (const file of listDocFiles(DOCS)) {
    for (const match of readFileSync(file, 'utf8').matchAll(STATUS_AND_CODE)) {
      const [, status, code] = match;
      if (status !== undefined && code !== undefined && isErrorCode(code)) {
        mentions.push({ file: relative(ROOT, file), status: Number(status), code });
      }
    }
  }
  return mentions;
}

describe('ErrorCode → HTTP durum tablosu', () => {
  it('her kodun tek bir 4xx/5xx durumu var', () => {
    expect(Object.keys(ERROR_HTTP_STATUS).sort()).toEqual([...ERROR_CODES].sort());
    for (const status of Object.values(ERROR_HTTP_STATUS)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it('karar: VALIDATION_FAILED 422, INTERNAL_ERROR 500, CONNECTION_NOT_ACTIVE 403', () => {
    expect(httpStatusOf('VALIDATION_FAILED')).toBe(422);
    expect(httpStatusOf('INTERNAL_ERROR')).toBe(500);
    expect(httpStatusOf('CONNECTION_NOT_ACTIVE')).toBe(403);
  });

  it('belgelerde geçen her "<durum> <KOD>" ifadesi tabloyla aynı', () => {
    const mentions = findDocMentions();
    expect(mentions.length).toBeGreaterThan(10);

    const mismatches = mentions
      .filter(
        (mention) =>
          ERROR_HTTP_STATUS[mention.code as keyof typeof ERROR_HTTP_STATUS] !== mention.status,
      )
      .map((mention) => `${mention.file}: ${String(mention.status)} ${mention.code}`);
    expect(mismatches).toEqual([]);
  });
});
