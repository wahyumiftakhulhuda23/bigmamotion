import { handleTestModelsLogic, parseSafeBody, cleanErrorMessage } from '../../server/app';

export const maxDuration = 60;

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = parseSafeBody(req);
    const key = body.key || req.body?.key || '';
    const result = await handleTestModelsLogic(key);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[API test-models] Serverless Error:', err);
    return res.status(200).json({
      success: false,
      isKeyValid: false,
      activeCount: 0,
      total: 0,
      models: [],
      error: cleanErrorMessage(err) || 'Gagal menguji daftar model Gemini',
    });
  }
}
