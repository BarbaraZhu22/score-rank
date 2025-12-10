import type { NextApiRequest, NextApiResponse } from 'next';
import { exportCache, CACHE_TTL } from '@/lib/export-cache';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    // Upload data for export
    const { matchData, matchId } = req.body;

    if (!matchData || !matchId) {
      return res.status(400).json({ error: 'Missing matchData or matchId' });
    }

    // Generate a unique token
    const token = `${matchId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Store in cache
    exportCache.set(token, {
      data: matchData,
      expires: Date.now() + CACHE_TTL,
    });

    // Return the download URL
    const baseUrl = req.headers.host || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const downloadUrl = `${protocol}://${baseUrl}/api/export-excel/download?token=${token}`;

    return res.status(200).json({ downloadUrl, token });
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

