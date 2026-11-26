import pino from "pino"

import { env, isProduction, isTest } from "../config/env.js"

/** Structured logging with redaction for credentials and account details. */
const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "*.password",
  "*.passwordHash",
  "*.currentPassword",
  "*.newPassword",
  "*.pin",
  "*.pinHash",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.tokenHash",
  "*.walletAddress",
  "*.accountNumber",
  "*.routingNumber",
]

export const logger = pino({
  level: isTest ? "silent" : isProduction ? "info" : "debug",
  redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
  base: { env: env.NODE_ENV },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,env" },
      },
})

export type Logger = typeof logger
