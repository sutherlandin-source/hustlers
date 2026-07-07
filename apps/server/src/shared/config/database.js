import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

// Disable mongoose command buffering so queries fail fast when disconnected
mongoose.set("bufferCommands", false);

const DEFAULT_OPTIONS = {
  maxPoolSize: 10,
  minPoolSize: 1,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
  appName: "HUSTLERS",
  family: 4,
  keepAlive: true,
};

async function tryConnect(options) {
  return mongoose.connect(env.MONGODB_URI, options);
}

export async function connectDatabase({ retries = 6, delayMs = 1000 } = {}) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      attempt += 1;
      await tryConnect(DEFAULT_OPTIONS);
      logger.info(`✅ Connected to MongoDB at ${env.MONGODB_URI}`);

      mongoose.connection.on("disconnected", async () => {
        logger.warn("⚠️ MongoDB disconnected — attempting to reconnect...");
        // Automatic reconnect loop in background
        let reconnectAttempts = 0;
        while (reconnectAttempts < 12 && mongoose.connection.readyState !== 1) {
          try {
            reconnectAttempts += 1;
            await tryConnect({ ...DEFAULT_OPTIONS, serverSelectionTimeoutMS: 5000 });
            if (mongoose.connection.readyState === 1) {
              logger.info("✅ MongoDB reconnected");
              break;
            }
          } catch (err) {
            logger.warn(`Reconnect attempt ${reconnectAttempts} failed`);
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
        if (mongoose.connection.readyState !== 1) {
          logger.error("Failed to reconnect to MongoDB after repeated attempts");
        }
      });

      mongoose.connection.on("error", (error) => {
        logger.error("MongoDB connection error", error);
      });

      return;
    } catch (error) {
      logger.warn(`MongoDB connect attempt ${attempt} failed: ${error.message}`);
      if (attempt <= retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error(`Failed to connect to MongoDB after ${retries} attempts`);
}

export function getConnectionStatus() {
  const readyState = mongoose.connection.readyState;
  const connected = readyState === 1;
  return {
    connected,
    readyState,
  };
}

export async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    logger.info("✅ Disconnected from MongoDB");
  } catch (error) {
    logger.error("Failed to disconnect from MongoDB", error);
    throw error;
  }
}
