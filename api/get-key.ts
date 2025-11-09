// TEMPORARY ENDPOINT - DELETE AFTER RETRIEVING KEY!
// This endpoint exposes the MODELS_API_KEY for one-time retrieval

import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const modelsApiKey = process.env.MODELS_API_KEY;

  if (!modelsApiKey) {
    return res.status(404).json({
      error: 'MODELS_API_KEY not found in environment'
    });
  }

  return res.status(200).json({
    key: modelsApiKey,
    warning: '⚠️ DELETE THIS ENDPOINT IMMEDIATELY AFTER RETRIEVING THE KEY!'
  });
}
