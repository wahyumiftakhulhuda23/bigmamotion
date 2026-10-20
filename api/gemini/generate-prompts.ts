import { handleGeneratePromptsLogic, parseSafeBody } from '../../server/app';
import { generateProceduralPrompts } from '../../src/constants/categories';

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
    const result = await handleGeneratePromptsLogic(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[API generate-prompts] Serverless Error, applying recovery fallback:', err);
    const body = parseSafeBody(req);
    const count = Math.max(1, body.count || 3);
    const fallback = generateProceduralPrompts(
      count,
      body.type || 'icon',
      body.subCategory || 'business_finance',
      body.style || 'minimalist',
      body.colorMode || 'gradient',
      body.motionDynamics || 'flow',
      body.neonGlow ?? true,
      body.keywords || []
    );
    return res.status(200).json({ prompts: fallback });
  }
}
