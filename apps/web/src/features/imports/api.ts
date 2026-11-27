'use client';
// Excel ürün içe aktarma (F3.5b, US-031; SF-08): openapi `/api/v1/imports*` ve F1.10 dosya
// yükleme (`purpose: import`). Yalnız `packages/api-client` (coding-guidelines §9.1).
import type { components } from '@b2b/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';
import { isWorking, sameOriginUrl, XLSX_CONTENT_TYPE } from './wizard-state';

export type ImportJob = components['schemas']['ImportJob'];

export const IMPORTS_KEY = ['imports'] as const;

/** Worker'ı izleme aralığı (yalnız `uploaded`/`validating`/`applying` iken; teknik, iş kuralı değil). */
const IMPORT_POLL_MS = 2000;

const header = (businessId: string | undefined) => ({ 'X-Business-Id': businessId ?? '' });

/** İş durumu ve önizleme; arka plan işi sürerken kısa aralıkla yenilenir. */
export function useImportJob(businessId: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: [...IMPORTS_KEY, businessId ?? null, id ?? null],
    enabled: businessId !== undefined && id !== undefined,
    retry: false,
    refetchInterval: (query) =>
      query.state.data !== undefined && isWorking(query.state.data.status) ? IMPORT_POLL_MS : false,
    queryFn: async (): Promise<ImportJob> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/imports/{id}', {
        params: { header: header(businessId), path: { id: id ?? '' } },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useImportMutations(businessId: string | undefined) {
  const queryClient = useQueryClient();
  const store = (job: ImportJob) => {
    queryClient.setQueryData([...IMPORTS_KEY, businessId ?? null, job.id], job);
  };

  /** US-031 AC1: şablonun süreli bağlantısı (kullanıcının dilinde). */
  const template = useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/imports/template', {
        params: { header: header(businessId), query: { type: 'products' } },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data.url;
    },
  });

  /** US-031 AC2: yükleme adresi → PUT → `complete` → `POST /imports` (doğrulama arka planda). */
  const start = useMutation({
    mutationFn: async (file: File): Promise<ImportJob> => {
      const ticket = await webApi.client.POST('/api/v1/files/upload-url', {
        params: { header: header(businessId) },
        body: { purpose: 'import', contentType: XLSX_CONTENT_TYPE, sizeBytes: file.size },
      });
      if (ticket.data === undefined) throw new ApiError(ticket.error, ticket.response.status);
      const put = await fetch(sameOriginUrl(ticket.data.uploadUrl, window.location.origin), {
        method: 'PUT',
        headers: ticket.data.headers,
        body: file,
      });
      if (!put.ok) throw new ApiError(undefined, put.status);
      const done = await webApi.client.POST('/api/v1/files/{id}/complete', {
        params: { header: header(businessId), path: { id: ticket.data.fileId } },
      });
      if (done.data === undefined) throw new ApiError(done.error, done.response.status);
      const created = await webApi.client.POST('/api/v1/imports', {
        params: { header: header(businessId) },
        body: { type: 'products', fileId: ticket.data.fileId },
      });
      if (created.data === undefined) throw new ApiError(created.error, created.response.status);
      return created.data;
    },
    onSuccess: store,
  });

  /** US-031 AC3: önizlemeyi onaylar (yalnız işi açan; S1 = A). */
  const apply = useMutation({
    mutationFn: async (id: string): Promise<ImportJob> => {
      const { data, error, response } = await webApi.client.POST('/api/v1/imports/{id}/apply', {
        params: { header: header(businessId), path: { id } },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: store,
  });

  return { template, start, apply };
}
