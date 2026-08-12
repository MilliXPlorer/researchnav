import connectPgSimple from "connect-pg-simple";
import express, { type ErrorRequestHandler } from "express";
import session from "express-session";
import helmet from "helmet";
import { ZodError } from "zod";
import { config } from "./config.js";
import { pool } from "./db.js";
import { apiRouter } from "./routes.js";

const PostgreSqlSessionStore = connectPgSimple(session);
const app = express();

app.set("trust proxy", config.trustProxyHops);
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use(
  session({
    name: "researchnav.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PostgreSqlSessionStore({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: false,
    }),
    cookie: {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

app.use("/api", apiRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next;
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({ error: "INVALID_REQUEST", details: error.flatten() });
    return;
  }
  console.error(
    config.nodeEnv === "production" ? "Unhandled API error" : error,
  );
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
};

app.use(errorHandler);

app.listen(config.port, () => {
  console.info(`ResearchNAV API listening on http://localhost:${config.port}`);
});
