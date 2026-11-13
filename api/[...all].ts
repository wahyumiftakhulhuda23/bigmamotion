import { createExpressApp } from "../server/app";

export const maxDuration = 60;

const app = createExpressApp();

export default function handler(req: any, res: any) {
  return app(req, res);
}
