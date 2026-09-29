import express from "express";
import { createExpressApp } from "../server/app";

const app = createExpressApp();

// Vercel serverless function entry point
export default app;
