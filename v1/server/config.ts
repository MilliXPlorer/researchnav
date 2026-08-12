import "dotenv/config";
import { z } from "zod";

function isHttpUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.url().refine(isHttpUrl).default("http://localhost:5173"),
  APP_ORIGINS: z
    .string()
    .default("")
    .refine(
      (value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
          .every(
            (origin) => z.url().safeParse(origin).success && isHttpUrl(origin),
          ),
      "APP_ORIGINS must contain comma-separated URLs",
    ),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  DATABASE_CA: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  BOOTSTRAP_ADMIN_EMAIL: z.union([z.email(), z.literal("")]).default(""),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("ResearchNAV <no-reply@example.edu>"),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid server environment",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Server environment validation failed");
}

const environment = parsed.data;
const allowedOrigins = [
  environment.APP_URL,
  ...environment.APP_ORIGINS.split(","),
]
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => new URL(value).origin);

if (environment.NODE_ENV === "production") {
  if (environment.DATABASE_SSL !== "true") {
    throw new Error("DATABASE_SSL must be enabled in production");
  }
  if (new URL(environment.APP_URL).protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production");
  }
  if (allowedOrigins.some((origin) => new URL(origin).protocol !== "https:")) {
    throw new Error("APP_ORIGINS must use HTTPS in production");
  }
  if (
    environment.SESSION_SECRET.startsWith("local-development-only") ||
    environment.SESSION_SECRET.startsWith("replace-")
  ) {
    throw new Error("SESSION_SECRET must be replaced in production");
  }
}

export const config = {
  nodeEnv: environment.NODE_ENV,
  port: environment.API_PORT,
  appUrl: environment.APP_URL,
  allowedOrigins: [...new Set(allowedOrigins)],
  databaseUrl: environment.DATABASE_URL,
  databaseSsl: environment.DATABASE_SSL === "true",
  databaseCa: environment.DATABASE_CA || undefined,
  sessionSecret: environment.SESSION_SECRET,
  googleClientId: environment.GOOGLE_CLIENT_ID,
  bootstrapAdminEmail: environment.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() || null,
  trustProxyHops: environment.TRUST_PROXY_HOPS,
  smtp:
    environment.SMTP_HOST && environment.SMTP_USER && environment.SMTP_PASS
      ? {
          host: environment.SMTP_HOST,
          port: environment.SMTP_PORT,
          secure: environment.SMTP_SECURE === "true",
          user: environment.SMTP_USER,
          pass: environment.SMTP_PASS,
          from: environment.MAIL_FROM,
        }
      : null,
};
