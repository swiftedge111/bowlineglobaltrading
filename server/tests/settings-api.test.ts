import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { REFRESH_COOKIE } from "../src/config/constants.js"
import { issueRefreshSession } from "../src/modules/auth/token.service.js"
import { anon, as } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

describe.skipIf(!hasDatabase)("profile and sessions", () => {
  let user: Awaited<ReturnType<typeof createTestUser>>
  let other: Awaited<ReturnType<typeof createTestUser>>

  beforeAll(async () => {
    await cleanupTestUsers()
    user = await createTestUser()
    other = await createTestUser()
    await testPrisma.user.update({ where: { id: user.id }, data: { country: "NG" } })
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.$disconnect()
  })

  /* ---------------------------------------------------------------- profile */

  it("stores a local phone number as E.164 using the account's country", async () => {
    const res = await as(user, "patch", "/users/me").send({ phone: "0803 123 4570" })
    expect(res.status).toBe(200)
    expect(res.body.data.user.phone).toBe("+2348031234570")
  })

  it("requires the contact number in international format", async () => {
    const bad = await as(user, "patch", "/users/me").send({ contactPhone: "0803 123 4570" })
    expect(bad.status).toBe(400)
    expect(bad.body.error.details).toEqual([
      expect.objectContaining({ path: "contactPhone" }),
    ])

    const good = await as(user, "patch", "/users/me").send({ contactPhone: "+234 803 123 4571" })
    expect(good.body.data.user.contactPhone).toBe("+2348031234571")
  })

  it("refuses an invalid number and leaves the stored one alone", async () => {
    const res = await as(user, "patch", "/users/me").send({ phone: "12345" })
    expect(res.status).toBe(400)
    const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.phone).toBe("+2348031234570")
  })

  it("does not allow the phone number to be cleared", async () => {
    expect((await as(user, "patch", "/users/me").send({ phone: "" })).status).toBe(400)
    expect((await as(user, "patch", "/users/me").send({ phone: null })).status).toBe(400)
  })

  it("reports whether the email address is verified", async () => {
    const before = await as(user, "get", "/users/me")
    expect(before.body.data.user.emailVerified).toBe(false)
    await testPrisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })
    const after = await as(user, "get", "/users/me")
    expect(after.body.data.user.emailVerified).toBe(true)
  })

  /* --------------------------------------------------------------- sessions */

  it("lists live sessions and marks the one making the request", async () => {
    const laptop = await issueRefreshSession(user.id, { userAgent: "Laptop", ip: "203.0.113.1" })
    await issueRefreshSession(user.id, { userAgent: "Phone", ip: "203.0.113.2" })

    const res = await as(user, "get", "/auth/sessions").set("Cookie", `${REFRESH_COOKIE}=${laptop.token}`)
    expect(res.status).toBe(200)

    const sessions = res.body.data.sessions as Array<{ userAgent: string; current: boolean }>
    expect(sessions.map((s) => s.userAgent).sort()).toEqual(["Laptop", "Phone"])
    expect(sessions.find((s) => s.current)?.userAgent).toBe("Laptop")
    // The token hash is never sent back.
    expect(JSON.stringify(res.body)).not.toContain("tokenHash")
  })

  it("signs out one session, and only the owner's", async () => {
    const list = await as(user, "get", "/auth/sessions")
    const phone = (list.body.data.sessions as Array<{ id: string; userAgent: string }>).find(
      (s) => s.userAgent === "Phone"
    )!

    expect((await as(other, "delete", `/auth/sessions/${phone.id}`)).status).toBe(404)
    expect((await as(user, "delete", `/auth/sessions/${phone.id}`)).status).toBe(204)
    expect((await as(user, "delete", `/auth/sessions/${phone.id}`)).status).toBe(404)

    const after = await as(user, "get", "/auth/sessions")
    expect(after.body.data.sessions.map((s: { userAgent: string }) => s.userAgent)).toEqual(["Laptop"])
  })

  it("requires a session to list sessions", async () => {
    expect((await anon("get", "/auth/sessions")).status).toBe(401)
  })
})
