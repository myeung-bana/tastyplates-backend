import type { Request, Response } from 'express';
import { getEnv } from '../../../../lib/env.js';

export async function downloadGooglePhoto(req: Request, res: Response) {
  try {
    const { photoUrl } = (req.body ?? {}) as { photoUrl?: string };

    if (!photoUrl || typeof photoUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'Photo URL is required' });
    }

    if (!photoUrl.includes('maps.googleapis.com') && !photoUrl.includes('googleapis.com')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid photo URL. Only Google Places photos are allowed.',
      });
    }

    const env = getEnv();
    const referer = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const response = await fetch(photoUrl, {
      headers: { Referer: referer },
    });

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        error: 'Failed to download image from Google',
        details: `HTTP ${response.status} ${response.statusText}`,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    return res.status(200).json({
      success: true,
      data: `data:${mimeType};base64,${base64}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
}
