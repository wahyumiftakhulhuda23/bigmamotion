import { Request, Response } from 'express';

export default function handler(req: Request | any, res: Response | any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({
    status: 'ok',
    hasServerKey: !!process.env.GEMINI_API_KEY,
    defaultModel: 'gemini-2.5-flash',
  });
}
