import type { Request, Response } from 'express';

export async function healthz(_req: Request, res: Response) {
  res.status(200).json({
    ok: true,
    service: 'tastyplates-backend',
    timestamp: new Date().toISOString(),
  });
}
