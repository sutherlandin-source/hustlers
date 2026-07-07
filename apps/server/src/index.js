/**
 * Server Entry Point
 * Main application startup and initialization
 */

import dotenv from "dotenv";

// Load .env from repo root when running the server so env variables from .env are available
const tryPaths = [
  new URL("../../.env", import.meta.url).pathname, // apps/server -> repo root
  new URL("../.env", import.meta.url).pathname, // apps/server/src -> apps/server/.env
  new URL("../../../.env", import.meta.url).pathname,
];
let loaded = false;
for (const p of tryPaths) {
  try {
    const res = dotenv.config({ path: p });
    if (!res.error) {
      console.log(`Loaded env from ${p}`);
      // merge loaded vars into process.env so later imports see them
      if (res.parsed) {
        Object.assign(process.env, res.parsed);
      }
      loaded = true;
      break;
    }
  } catch (e) {
    // ignore
  }
}
if (!loaded) {
  const res = dotenv.config();
  if (!res.error && res.parsed) Object.assign(process.env, res.parsed);
}

import http from "http";
import { Server as SocketIOServer } from "socket.io";

// Import env and database AFTER loading .env so process.env is populated
const { validateEnv, env } = await import("./shared/config/env.js");
const { connectDatabase, disconnectDatabase } = await import("./shared/config/database.js");
const { logger } = await import("./shared/utils/logger.js");
const { createApp } = await import("./app.js");
const { initializeSocketServer } = await import("./shared/utils/socket.js");

/**
 * Start the server
 */
async function startServer() {
  try {
    logger.info("Validating environment variables...");
    validateEnv();
    logger.info("✅ Environment variables validated");

    logger.info("Connecting to MongoDB...");
    await connectDatabase();

    const app = createApp();
    const server = http.createServer(app);
    const io = new SocketIOServer(server, {
      cors: {
        origin: env.ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    initializeSocketServer(io);

    server.listen(env.PORT, () => {
      logger.info(`✅ Server running on http://localhost:${env.PORT}`);
      logger.info(`📡 API available at http://localhost:${env.PORT}${env.API_PREFIX}/${env.API_VERSION}`);
      logger.info(`🌍 Environment: ${env.NODE_ENV}`);
      logger.info(`📶 Socket.IO enabled`);
    });

    process.on("SIGTERM", async () => {
      logger.info("SIGTERM signal received: closing HTTP server");
      server.close(async () => {
        logger.info("HTTP server closed");
        await disconnectDatabase();
        process.exit(0);
      });
    });

    process.on("SIGINT", async () => {
      logger.info("SIGINT signal received: closing HTTP server");
      server.close(async () => {
        logger.info("HTTP server closed");
        await disconnectDatabase();
        process.exit(0);
      });
    });

    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception", error);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled Rejection", reason);
      process.exit(1);
    });
  } catch (error) {
    logger.error("Server startup failed", error);
    process.exit(1);
  }
}

startServer();
