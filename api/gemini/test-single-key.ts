import { handleTestSingleKeyLogic, parseSafeBody, cleanErrorMessage } from '../../server/app';

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
    const result = await handleTestSingleKeyLogic(key);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[API test-single-key] Serverless Error:', err);
    return res.status(200).json({
      key: req.body?.key || '',
      maskedKey: '(error)',
      valid: false,
      error: cleanErrorMessage(err) || 'Gagal menguji API key',
      latencyMs: 0,
    });
  }
}
