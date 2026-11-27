import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { as } from "./helpers/api.js"
import { createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

const path = "/admin/audit-logs"

describe.skipIf(!hasDatabase)("admin audit log", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>
  let otherAdmin: Awaited<ReturnType<typeof createTestUser>>
  let client: Awaited<ReturnType<typeof createTestUser>>
  let userEvent: string
  let depositEvent: string
  let systemEvent: string
  let action: string
  let otherAction: string

  beforeAll(async () => {
    admin = await createTestUser({ role: "ADMIN" })
    otherAdmin = await createTestUser({ role: "ADMIN" })
    client = await createTestUser()
    action = `test.${admin.id}.user`
    otherAction = `test.${admin.id}.deposit`

    const deposit = await testPrisma.depositRequest.create({
      data: { userId: client.id, method: "BANK_TRANSFER", amount: 100 },
    })

    const [userLog, depositLog, systemLog] = await Promise.all([
      testPrisma.auditLog.create({
        data: {
          action,
          actorId: admin.id,
          targetType: "User",
          targetId: client.id,
          before: { status: "ACTIVE" },
          after: { status: "SUSPENDED" },
          createdAt: new Date("2026-11-15T00:00:00.000Z"),
        },
      }),
      testPrisma.auditLog.create({
        data: {
          action: otherAction,
          actorId: otherAdmin.id,
          targetType: "DepositRequest",
          targetId: deposit.id,
          createdAt: new Date("2026-11-15T23:59:59.999Z"),
        },
      }),
      testPrisma.auditLog.create({
        data: {
          action,
          actorId: null,
          targetType: "Plan",
          targetId: `scratch-target-${client.id}`,
          createdAt: new Date("2026-11-16T00:00:00.000Z"),
        },
      }),
    ])
    userEvent = userLog.id
    depositEvent = depositLog.id
    systemEvent = systemLog.id
  })

  afterAll(async () => {
    await testPrisma.auditLog.deleteMany({
      where: { action: { in: [action, otherAction] } },
    })
    await testPrisma.user.deleteMany({
      where: { id: { in: [admin.id, otherAdmin.id, client.id] } },
    })
    await testPrisma.$disconnect()
  })

  async function list(query: Record<string, string | number>) {
    const response = await as(admin, "get", path).query(query).expect(200)
    return response.body.data as {
      items: {
        id: string
        targetUid: string | null
        before: unknown
        after: unknown
      }[]
      meta: { total: number }
    }
  }

  it("lists recorded actions and their admins as filter options", async () => {
    const response = await as(admin, "get", `${path}/filters`).expect(200)
    expect(response.body.data.actions).toEqual(
      expect.arrayContaining([action, otherAction])
    )
    expect(response.body.data.actors).toEqual(
      expect.arrayContaining([
        { id: admin.id, username: admin.username, email: admin.email },
        {
          id: otherAdmin.id,
          username: otherAdmin.username,
          email: otherAdmin.email,
        },
      ])
    )
    expect(
      response.body.data.actors.map(({ id }: { id: string }) => id)
    ).not.toContain(client.id)
  })

  it("filters by exact action and paginates the matching rows", async () => {
    const first = await list({ action, page: 1, limit: 1 })
    const second = await list({ action, page: 2, limit: 1 })

    expect(first.items.map(({ id }) => id)).toEqual([systemEvent])
    expect(first.meta.total).toBe(2)
    expect(second.items).toMatchObject([
      {
        id: userEvent,
        targetUid: client.uid,
        before: { status: "ACTIVE" },
        after: { status: "SUSPENDED" },
      },
    ])
  })

  it("filters by a recorded admin and by system", async () => {
    expect(
      (await list({ actorId: admin.id })).items.map(({ id }) => id)
    ).toEqual([userEvent])
    expect(
      (await list({ action, actorId: "system" })).items.map(({ id }) => id)
    ).toEqual([systemEvent])
  })

  it("continues an export after the last event even when newer events land", async () => {
    const first = await list({ action, limit: 1 })
    const newer = await testPrisma.auditLog.create({
      data: {
        action,
        actorId: admin.id,
        targetType: "User",
        targetId: client.id,
        createdAt: new Date("2026-11-17T00:00:00.000Z"),
      },
    })
    try {
      const next = await list({ action, cursor: first.items[0]!.id, limit: 1 })
      expect(next.items.map(({ id }) => id)).toEqual([userEvent])
      expect(
        (await list({ action, cursor: userEvent, limit: 1 })).items
      ).toEqual([])
    } finally {
      await testPrisma.auditLog.delete({ where: { id: newer.id } })
    }
  })

  it("filters from the UTC start of a day, including that boundary", async () => {
    expect(
      (await list({ action, from: "2026-11-15" })).items.map(({ id }) => id)
    ).toEqual([systemEvent, userEvent])
    expect(
      (await list({ action, from: "2026-11-16" })).items.map(({ id }) => id)
    ).toEqual([systemEvent])
  })

  it("includes the entire end date and excludes the next day", async () => {
    expect(
      (await list({ action, to: "2026-11-15" })).items.map(({ id }) => id)
    ).toEqual([userEvent])
    expect(
      (
        await list({
          action: otherAction,
          from: "2026-11-15",
          to: "2026-11-15",
        })
      ).items.map(({ id }) => id)
    ).toEqual([depositEvent])
  })

  it("rejects invalid dates and reversed date ranges", async () => {
    await as(admin, "get", path).query({ from: "2026-02-30" }).expect(400)
    await as(admin, "get", path)
      .query({ from: "2026-11-16", to: "2026-11-15" })
      .expect(400)
  })

  it("finds client targets by email and UID, and admin actions by email", async () => {
    expect(
      (await list({ action, search: client.email.toUpperCase() })).items.map(
        ({ id }) => id
      )
    ).toEqual([userEvent])
    expect(
      (
        await list({ action: otherAction, search: client.uid.toLowerCase() })
      ).items.map(({ id }) => id)
    ).toEqual([depositEvent])
    expect(
      (await list({ search: otherAdmin.email })).items.map(({ id }) => id)
    ).toEqual([depositEvent])
  })

  it("searches target IDs case-insensitively and treats wildcards as literal text", async () => {
    expect(
      (await list({ action, search: `TARGET-${client.id}` })).items.map(
        ({ id }) => id
      )
    ).toEqual([systemEvent])
    expect((await list({ action, search: "%" })).meta.total).toBe(0)
  })
})
