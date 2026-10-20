import { createExpressApp } from "../server/app";

const app = createExpressApp();

// Vercel serverless function entry point
export default function handler(req: any, res: any) {
  return app(req, res);
}

