import { describe, it, expect, vi } from "vitest";
import {
  deleteOrderCascade,
  deleteProjectCascade,
  deleteClientCascade,
} from "../src/lib/record-delete";

// A fake Prisma transaction client that records the sequence of writes so
// we can assert the FK-safe ordering (child before parent) without a DB.
function makeTx(seed: {
  orderByProject?: Record<string, { id: string } | null>;
  projectsByClient?: Record<string, Array<{ id: string }>>;
  ordersByClient?: Record<string, Array<{ id: string }>>;
  gazoblokOrdersByClient?: Record<string, Array<{ id: string }>>;
}) {
  const log: string[] = [];
  const tx = {
    notification: {
      deleteMany: vi.fn(async ({ where }: any) => {
        log.push(`notif.deleteMany ${JSON.stringify(where)}`);
        return { count: 0 };
      }),
    },
    order: {
      delete: vi.fn(async ({ where }: any) => {
        log.push(`order.delete ${where.id}`);
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        log.push(`order.findUnique project=${where.projectId}`);
        return seed.orderByProject?.[where.projectId] ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        log.push(`order.findMany client=${where.clientId}`);
        return seed.ordersByClient?.[where.clientId] ?? [];
      }),
    },
    project: {
      delete: vi.fn(async ({ where }: any) => {
        log.push(`project.delete ${where.id}`);
      }),
      findMany: vi.fn(async ({ where }: any) => {
        log.push(`project.findMany client=${where.clientId}`);
        return seed.projectsByClient?.[where.clientId] ?? [];
      }),
    },
    client: {
      delete: vi.fn(async ({ where }: any) => {
        log.push(`client.delete ${where.id}`);
      }),
    },
    gazoblokOrder: {
      findMany: vi.fn(async ({ where }: any) => {
        log.push(`gOrder.findMany client=${where.clientId}`);
        return seed.gazoblokOrdersByClient?.[where.clientId] ?? [];
      }),
      delete: vi.fn(async ({ where }: any) => {
        log.push(`gOrder.delete ${where.id}`);
      }),
    },
  };
  return { tx, log };
}

const idx = (log: string[], entry: string) => log.indexOf(entry);

describe("deleteOrderCascade", () => {
  it("clears the order's notifications before deleting it", async () => {
    const { tx, log } = makeTx({});
    await deleteOrderCascade(tx as any, "o1");
    expect(log).toEqual(['notif.deleteMany {"orderId":"o1"}', "order.delete o1"]);
  });
});

describe("deleteProjectCascade", () => {
  it("deletes the project's order BEFORE the project (Order→Project is RESTRICT)", async () => {
    const { tx, log } = makeTx({ orderByProject: { p1: { id: "o1" } } });
    await deleteProjectCascade(tx as any, "p1");
    expect(idx(log, "order.delete o1")).toBeGreaterThanOrEqual(0);
    expect(idx(log, "order.delete o1")).toBeLessThan(idx(log, "project.delete p1"));
  });

  it("deletes a project with no order", async () => {
    const { tx, log } = makeTx({ orderByProject: { p2: null } });
    await deleteProjectCascade(tx as any, "p2");
    expect(tx.order.delete).not.toHaveBeenCalled();
    expect(log).toContain("project.delete p2");
  });
});

describe("deleteClientCascade", () => {
  it("deletes projects/orders/gazoblok-orders BEFORE the client, client last", async () => {
    const { tx, log } = makeTx({
      projectsByClient: { c1: [{ id: "p1" }] },
      orderByProject: { p1: { id: "o1" } },
      ordersByClient: { c1: [] }, // o1 already gone via its project
      gazoblokOrdersByClient: { c1: [{ id: "g1" }] },
    });
    await deleteClientCascade(tx as any, "c1");

    // client.delete must be the very last write.
    expect(log[log.length - 1]).toBe("client.delete c1");
    // the project (and its order) and the gazoblok order all precede the client.
    expect(idx(log, "project.delete p1")).toBeLessThan(idx(log, "client.delete c1"));
    expect(idx(log, "order.delete o1")).toBeLessThan(idx(log, "project.delete p1"));
    expect(idx(log, "gOrder.delete g1")).toBeLessThan(idx(log, "client.delete c1"));
  });

  it("handles a client with no projects/orders", async () => {
    const { tx, log } = makeTx({});
    await deleteClientCascade(tx as any, "c9");
    expect(log[log.length - 1]).toBe("client.delete c9");
  });
});
