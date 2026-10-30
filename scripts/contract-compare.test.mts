import { describe, expect, it } from 'vitest';
import {
  compareOperations,
  readContractOperations,
  readDocumentOperations,
} from './contract-compare.mts';

const CONTRACT = `openapi: 3.1.0
paths:
  # ---- sistem
  /api/health:
    get:
      summary: Sağlık
      responses:
        '200': { description: Sağlıklı }
        '503': { description: Bağımlılık yok }
  /api/v1/items/{id}:
    parameters: [ { $ref: '#/components/parameters/Id' } ]
    get:
      responses:
        '200':
          description: Kayıt
          content:
            application/json:
              schema: { type: object }
        "404": { description: Yok }
    delete:
      requestBody:
        content:
          application/json:
            schema: { type: object }
      responses:
        204: { description: Silindi }
components:
  schemas:
    Foo: { type: object }
`;

function doc(paths: Record<string, Record<string, string[]>>) {
  return {
    paths: Object.fromEntries(
      Object.entries(paths).map(([path, methods]) => [
        path,
        Object.fromEntries(
          Object.entries(methods).map(([method, codes]) => [
            method,
            { responses: Object.fromEntries(codes.map((code) => [code, {}])) },
          ]),
        ),
      ]),
    ),
  };
}

describe('sözleşme karşılaştırıcısı', () => {
  it('openapi.yaml yol, metot ve yanıt kodlarını okur', () => {
    const operations = readContractOperations(CONTRACT);

    expect([...operations.keys()]).toEqual([
      'GET /api/health',
      'GET /api/v1/items/{id}',
      'DELETE /api/v1/items/{id}',
    ]);
    expect([...(operations.get('GET /api/health') ?? [])]).toEqual(['200', '503']);
    expect([...(operations.get('GET /api/v1/items/{id}') ?? [])]).toEqual(['200', '404']);
    expect([...(operations.get('DELETE /api/v1/items/{id}') ?? [])]).toEqual(['204']);
  });

  it('F1.12-AC2: uygulamada olup sözleşmede olmayan uç hata verir', () => {
    const app = readDocumentOperations(
      doc({ '/api/health': { get: ['200'] }, '/api/v1/gizli': { post: ['201'] } }),
    );

    const result = compareOperations(app, readContractOperations(CONTRACT));

    expect(result.errors).toEqual(["POST /api/v1/gizli: uygulamada var, openapi.yaml'da yok"]);
  });

  it('F1.12-AC2: aynı yolda sözleşmede olmayan metot hata verir', () => {
    const app = readDocumentOperations(doc({ '/api/health': { get: ['200'], post: ['200'] } }));

    const result = compareOperations(app, readContractOperations(CONTRACT));

    expect(result.errors).toEqual(["POST /api/health: uygulamada var, openapi.yaml'da yok"]);
  });

  it('F1.12-AC2: sözleşmede olmayan yanıt kodu hata verir', () => {
    const app = readDocumentOperations(doc({ '/api/health': { get: ['201'] } }));

    const result = compareOperations(app, readContractOperations(CONTRACT));

    expect(result.errors).toEqual([
      "GET /api/health: yanıt kodu 201 uygulamada var, openapi.yaml'da yok",
    ]);
  });

  it('sözleşmede olup uygulamada olmayan uç yalnızca uyarıdır', () => {
    const app = readDocumentOperations(doc({ '/api/health': { get: ['200'] } }));

    const result = compareOperations(app, readContractOperations(CONTRACT));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      "DELETE /api/v1/items/{id}: openapi.yaml'da var, uygulamada henüz yok",
      "GET /api/v1/items/{id}: openapi.yaml'da var, uygulamada henüz yok",
    ]);
  });

  it('satır içi responses biçimi sessizce atlanmaz, hata verir', () => {
    const yaml = "paths:\n  /a:\n    get:\n      responses: { '200': { description: x } }\n";

    expect(() => readContractOperations(yaml)).toThrow(/blok biçiminde/);
  });

  it('paths bölümü yoksa hata verir', () => {
    expect(() => readContractOperations('openapi: 3.1.0\n')).toThrow(/paths/);
  });
});
