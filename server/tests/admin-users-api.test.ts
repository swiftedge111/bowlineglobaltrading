import { TxCategory } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toMoney } from "../src/lib/money.js"
import { subscribe } from "../src/modules/plans/plans.service.js"
import { credit } from "../src/services/ledger.service.js"
import { as } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

/** The Users screen: role and sort filters, per-row plan totals, tab counts. */
describe.skipIf(!hasDatabase)("admin users list", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>
  let client: Awaited<ReturnType<typeof createTestUser>>
  const planIds: string[] = []

  beforeAll(async () => {
    await cleanupTestUsers()
    admin = await createTestUser({ role: "ADMIN" })
    client = await createTestUser()

    const plan = await testPrisma.plan.create({
      data: {
        slug: `users-list-${Date.now()}`,
        name: "Users List Test",
        dailyReturnBps: 100,
        durationDays: 5,
        minDeposit: 1,
        description: "test",
        features: [],
      },
    })
    planIds.push(plan.id)
    await credit({ userId: client.id, amount: toMoney(500), category: TxCategory.DEPOSIT })
    await subscribe(client.id, plan.slug, 200)
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.plan.deleteMany({ where: { id: { in: planIds } } })
    await testPrisma.$disconnect()
  })

  type Row = { uid: string; role: string; balance: string; inPlans: string; emailVerified: boolean }

  it("filters by role", async () => {
    const clients = await as(admin, "get", "/admin/users").query({ role: "USER", limit: 100 }).expect(200)
    const rows: Row[] = clients.body.data.items
    expect(rows.every((row) => row.role === "USER")).toBe(true)
    expect(rows.some((row) => row.uid === admin.uid)).toBe(false)

    const admins = await as(admin, "get", "/admin/users").query({ role: "ADMIN", limit: 100 }).expect(200)
    expect((admins.body.data.items as Row[]).some((row) => row.uid === admin.uid)).toBe(true)
  })

  it("reports cash and in-plan money separately", async () => {
    const response = await as(admin, "get", "/admin/users").query({ search: client.uid }).expect(200)
    const row = (response.body.data.items as Row[]).find((item) => item.uid === client.uid)!
    expect(row.balance).toBe("300.00")
    expect(row.inPlans).toBe("200.00")
    expect(row.emailVerified).toBe(false)
  })

  it("sorts oldest first on request", async () => {
    const response = await as(admin, "get", "/admin/users").query({ sort: "oldest", limit: 100 }).expect(200)
    const uids = (response.body.data.items as Row[]).map((row) => row.uid)
    expect(uids.indexOf(admin.uid)).toBeLessThan(uids.indexOf(client.uid))
  })

  it("rejects an unknown sort", async () => {
    await as(admin, "get", "/admin/users").query({ sort: "balance" }).expect(400)
  })

  it("counts clients for the tabs, and is not read as a UID", async () => {
    const response = await as(admin, "get", "/admin/users/summary").expect(200)
    const counts = response.body.data
    expect(counts.clients).toBeGreaterThanOrEqual(1)
    expect(counts.admins).toBeGreaterThanOrEqual(1)
    expect(counts.active + counts.suspended).toBe(counts.clients)
    expect(counts.unverified).toBeGreaterThanOrEqual(1)
  })

  it("shows one client's identity, totals, plans and open requests", async () => {
    await testPrisma.user.update({
      where: { id: client.id },
      data: { country: "GB", contactPhone: "+447700900123", signupIp: "203.0.113.7", signupCountry: "GB" },
    })
    await testPrisma.depositRequest.create({
      data: { userId: client.id, amount: 75, method: "BANK_TRANSFER" },
    })

    const response = await as(admin, "get", `/admin/users/${client.uid}`).expect(200)
    const body = response.body.data

    expect(body.user).toMatchObject({
      country: "GB",
      contactPhone: "+447700900123",
      signupIp: "203.0.113.7",
      signupCountry: "GB",
      emailVerified: false,
    })
    expect(body.balance).toMatchObject({ balance: "300.00", inPlans: "200.00", accountValue: "500.00" })
    expect(body.lifetime).toEqual({ deposited: "500.00", withdrawn: "0.00", earned: "0.00" })
    expect(body.pending.deposits).toHaveLength(1)
    expect(body.pending.deposits[0].amount).toBe("75.00")
    expect(body.pending.withdrawals).toHaveLength(0)
    expect(body.subscriptions[0]).toMatchObject({
      planName: "Users List Test",
      dailyPayout: "2.00",
      paidPeriods: 0,
      totalPeriods: 5,
    })
    expect(body.subscriptions[0].nextPayoutAt).not.toBeNull()
  })

  it("is admin only", async () => {
    await as(client, "get", "/admin/users/summary").expect(403)
  })
})
