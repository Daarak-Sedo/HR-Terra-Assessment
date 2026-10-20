import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/hr-terra"),
  JWT_SECRET: z
    .string()
    .min(24)
    .default("development-only-change-this-jwt-secret"),
  COOKIE_SECRET: z
    .string()
    .min(24)
    .default("development-only-change-this-cookie-secret"),
  LOG_LEVEL: z.string().default("info"),
  DEFAULT_CURRENCY: z.string().length(3).default("AED"),
  DEFAULT_TIMEZONE: z.string().default("Asia/Dubai"),
  DEMO_PASSWORD: z.string().min(8).default("TerraDemo!2026"),
  PAYMENT_PROVIDER: z.string().default("mock"),
});

export const config = configSchema.parse(process.env);
if (config.PAYMENT_PROVIDER !== "mock") {
  throw new Error("Only the mock payment adapter is implemented in this demo.");
}
if (config.NODE_ENV === "production") {
  throw new Error(
    "Production mode is disabled until real payment, CSRF, and provider adapters are implemented.",
  );
}
