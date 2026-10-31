'use client';
// Kimliksiz başvuru ucu (openapi `POST /api/v1/seller-applications`, F2.2a).
import { useMutation } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';
import type { SellerApplicationBody } from './form';

export function useSubmitApplication() {
  return useMutation({
    mutationFn: async (body: SellerApplicationBody) => {
      const { data, error, response } = await webApi.client.POST('/api/v1/seller-applications', {
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}
