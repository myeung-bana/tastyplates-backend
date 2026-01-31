import type { Request, Response } from 'express';

export default async function healthz(_req: Request, res: Response) {
  res.status(200).json({
    ok: true,
    service: 'tastyplates-backend-functions',
    timestamp: new Date().toISOString(),
  });
}

