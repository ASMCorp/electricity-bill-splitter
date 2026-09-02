import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, query } = vi.hoisted(() => {
  const chain = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn();
  return {
    query: chain,
    client: {
      from: vi.fn(() => chain),
      auth: {},
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => client),
}));

describe("member database operations", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  });

  it("reads, creates, and updates roster members", async () => {
    query.order.mockResolvedValueOnce({ data: [], error: null });
    query.single
      .mockResolvedValueOnce({ data: { id: "m1", display_name: "Anik", is_active: true }, error: null })
      .mockResolvedValueOnce({ data: { id: "m1", display_name: "Anik", is_active: false }, error: null });
    const { database } = await import("./supabase.js");

    await expect(database.members()).resolves.toEqual([]);
    await database.createMember({ display_name: "Anik", public_alias: "A." });
    await database.updateMember("m1", { is_active: false });

    expect(client.from).toHaveBeenCalledWith("members");
    expect(query.insert).toHaveBeenCalledWith({ display_name: "Anik", public_alias: "A." });
    expect(query.update).toHaveBeenCalledWith({ is_active: false });
    expect(query.eq).toHaveBeenCalledWith("id", "m1");
  });

  it("deletes a tariff version by id", async () => {
    query.single.mockResolvedValueOnce({ data: { id: "tariff-future" }, error: null });
    const { database } = await import("./supabase.js");

    await expect(database.deleteTariff("tariff-future")).resolves.toEqual({ id: "tariff-future" });

    expect(client.from).toHaveBeenCalledWith("tariff_versions");
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith("id", "tariff-future");
  });
});
