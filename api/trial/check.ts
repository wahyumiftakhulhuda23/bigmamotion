import { handleCheckTrialLogic, parseSafeBody } from '../../server/app';

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const body = parseSafeBody(req);
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'default_ip';
  const result = handleCheckTrialLogic(body, String(ip));
  return res.status(200).json(result);
}
