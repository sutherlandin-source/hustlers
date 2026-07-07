/**
 * Logging utility
 * Centralized logging with different log levels
 */

import { env } from "../config/env.js";

class Logger {
  constructor() {
    this.isDevelopment = env.NODE_ENV === "development";
  }

  formatLog(entry) {
    const { timestamp, level, message, data, error } = entry;
    const levelUpper = level.toUpperCase().padEnd(5);
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";
    const errorStr = error ? `\n${error.stack}` : "";
    return `[${timestamp}] ${levelUpper} ${message}${dataStr}${errorStr}`;
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  debug(message, data) {
    if (this.isDevelopment) {
      const entry = {
        timestamp: this.getTimestamp(),
        level: "debug",
        message,
        data,
      };
      console.debug(this.formatLog(entry));
    }
  }

  info(message, data) {
    const entry = {
      timestamp: this.getTimestamp(),
      level: "info",
      message,
      data,
    };
    console.info(this.formatLog(entry));
  }

  warn(message, data) {
    const entry = {
      timestamp: this.getTimestamp(),
      level: "warn",
      message,
      data,
    };
    console.warn(this.formatLog(entry));
  }

  error(message, error) {
    const entry = {
      timestamp: this.getTimestamp(),
      level: "error",
      message,
      error: error instanceof Error ? error : new Error(String(error)),
    };
    console.error(this.formatLog(entry));
  }
}

export const logger = new Logger();
