import { createExpressApp } from "../server/app";

export const maxDuration = 60;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

const app = createExpressApp();

export default function handler(req: any, res: any) {
  return app(req, res);
}
