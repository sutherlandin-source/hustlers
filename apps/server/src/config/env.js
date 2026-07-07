/**
 * Environment variables configuration
 * Centralized env variable management with validation
 */

export const env = {
  PORT: parseInt(process.env.PORT ?? "5000", 10),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://localhost:27017/hustlers",
  MONGODB_DB: process.env.MONGODB_DB ?? undefined,
  JWT_SECRET: process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "your-refresh-secret-change-in-production",
  JWT_EXPIRE: process.env.JWT_EXPIRE ?? "7d",
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE ?? "30d",
  API_VERSION: process.env.API_VERSION ?? "v1",
  API_PREFIX: process.env.API_PREFIX ?? "/api",
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://localhost:5173").split(","),
  EMAIL_SERVICE: process.env.EMAIL_SERVICE ?? "gmail",
  EMAIL_USER: process.env.EMAIL_USER ?? "",
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ?? "",
};

export function validateEnv() {
  const requiredEnvVars = ["MONGODB_URI"];

  for (const envVar of requiredEnvVars) {
    if (!env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
}
