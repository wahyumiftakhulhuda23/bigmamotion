import { createExpressApp } from "../server/app";

const app = createExpressApp();

// Vercel serverless function configuration (60 seconds max timeout for Gemini generation)
export const maxDuration = 60;

// Vercel serverless function entry point
export default function handler(req: any, res: any) {
  return app(req, res);
}
