// @ts-nocheck
import express from "express";
import path from "node:path";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const PgSession = ConnectPgSimple(session);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
  : ["http://localhost:5173", "http://localhost:5174"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      // Allow all replit.dev domains and localhost
      if (
        allowedOrigins.includes(origin) ||
        origin.includes(".replit.dev") ||
        origin.includes("localhost")
      ) {
        return callback(null, true);
      }
      callback(null, true); // permissive for dev
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      tableName: "user_sessions",
    }),
    secret: process.env.SESSION_SECRET || "maktaba-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
    },
    name: "maktaba.sid",
  }),
);

app.use("/api", router);

// Serve the customer storefront from the same origin as the API in production.
// This keeps sessions, search, cart, and checkout working without cross-origin
// cookie issues on free hosting providers such as Render.
if (process.env.NODE_ENV === "production") {
  const storefrontDir = path.resolve(process.cwd(), "artifacts/maktaba/dist/public");
  app.use(express.static(storefrontDir));
  app.get("/{*path}", (_req: unknown, res: any) => {
    res.sendFile(path.join(storefrontDir, "index.html"));
  });
}

export default app;
