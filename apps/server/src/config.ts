import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  PUBLIC_APP_URL: z.url().default("http://localhost:5173"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:4173"),
  RECONNECT_GRACE_MS: z.coerce.number().int().min(1_000).default(120_000),
  ROOM_IDLE_TTL_MS: z.coerce.number().int().min(60_000).default(1_800_000),
  SESSION_COOKIE_SECURE: booleanString,
  TRUST_PROXY: booleanString,
  ROOM_CREATE_LIMIT: z.coerce.number().int().positive().default(20),
  INVALID_ACTION_LIMIT: z.coerce.number().int().positive().default(30),
  TEST_SHUFFLE_SEED: z.string().optional(),
});

const parsed = schema.parse(process.env);

export const config = {
  ...parsed,
  allowedOrigins: parsed.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()),
};

export type ServerConfig = typeof config;
