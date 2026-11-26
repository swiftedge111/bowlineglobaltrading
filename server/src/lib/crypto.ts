import { createHash, randomBytes, randomInt } from "node:crypto"

import bcrypt from "bcryptjs"

import { BCRYPT_ROUNDS } from "../config/constants.js"

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** Opaque token for password reset and refresh sessions. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url")
}

/** Store reset and refresh token digests so a database read reveals no usable tokens. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Generate a numeric PIN with a cryptographically secure random source. */
export function generateNumericPin(length: number): string {
  let pin = ""
  for (let i = 0; i < length; i += 1) {
    pin += randomInt(0, 10).toString()
  }
  return pin
}

/** Short, human-quotable public account reference (e.g. "K3F9QP2M4T"). */
export function generateUid(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I/O/0/1
  let uid = ""
  for (let i = 0; i < length; i += 1) {
    uid += alphabet[randomInt(0, alphabet.length)]
  }
  return uid
}
