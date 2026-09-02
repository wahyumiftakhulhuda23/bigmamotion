import { createExpressApp } from "../server/app";

const app = createExpressApp();

export default function handler(req: any, res: any) {
  return app(req, res);
}
