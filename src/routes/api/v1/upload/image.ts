import type { Request, Response } from 'express';

/**
 * TODO: Implement one of:
 * - S3 + Sharp pipeline (ported from `tastyplates-v2-1/src/app/api/v1/upload/image/route.ts`)
 * - Nhost Storage upload flow (signed upload + optional post-processing)
 */
export async function uploadImage(_req: Request, res: Response) {
  return res.status(501).json({
    success: false,
    error: 'Not implemented yet',
    hint: 'Decide S3 vs Nhost Storage and port upload logic.',
  });
}
