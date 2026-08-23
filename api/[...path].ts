import app from "../artifacts/api-server/src/app";

// Vercel runs the Express application as a serverless function for every
// /api/* request. The storefront itself is deployed as static Vite output.
export default app;
