import type { Request, Response } from 'express';

/**
 * TODO: Port logic from:
 * `tastyplates-v2-1/src/app/api/v1/upload/batch/route.ts`
 */
export default async function uploadBatch(_req: Request, res: Response) {
  return res.status(501).json({
    success: false,
    error: 'Not implemented yet',
  });
}

