import { handleImageToPromptLogic, parseSafeBody, cleanErrorMessage } from '../../server/app';

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
    const result = await handleImageToPromptLogic(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[API image-to-prompt] Serverless Error:', err);
    return res.status(500).json({ error: cleanErrorMessage(err) || 'Gagal menganalisa gambar ke motion prompt' });
  }
}
