import { describe, expect, it, vi } from "vitest"
import {
  applyModelOverride,
  deleteModelOverride,
  listModelOverrides,
  overrideStorageKey,
  setModelOverride,
} from "../../src/v2/overrides.js"

function storage() {
  const values = new Map<string, unknown>()
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key)),
    set: vi.fn(async (key: string, value: unknown) => { values.set(key, value) }),
    remove: vi.fn(async (key: string) => { values.delete(key) }),
    scan: vi.fn(async ({ prefix }: { prefix: string }) => ({
      entries: [...values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
    })),
  }
}

describe("V2 model overrides", () => {
  it("stores and lists overrides in the provider/model namespace", async () => {
    const backend = storage()
    const saved = await setModelOverride(backend, {
      providerID: "provider-a",
      modelID: "model-1",
      patch: { name: "Custom model", limit: { context: 65536 } },
    })

    expect(backend.values.has("overrides:provider-a:model-1")).toBe(true)
    expect(overrideStorageKey("provider-a", "model-1")).toBe("overrides:provider-a:model-1")
    expect(await listModelOverrides(backend, "provider-a")).toEqual([saved])
    expect(await listModelOverrides(backend, "provider-b")).toEqual([])
  })

  it("rejects unsupported or sensitive patch fields", async () => {
    const backend = storage()
    await expect(setModelOverride(backend, {
      providerID: "provider-a",
      modelID: "model-1",
      patch: { apiKey: "secret" },
    })).rejects.toThrow("not allowed")
    await expect(setModelOverride(backend, {
      providerID: "provider-a",
      modelID: "model-1",
      patch: { unknown: true },
    })).rejects.toThrow("Unsupported override field")
    await expect(setModelOverride(backend, {
      providerID: "provider-a",
      modelID: "model-1",
      patch: { variants: [{ headers: { authorization: "secret" } }] },
    })).rejects.toThrow("not allowed")
  })

  it("deep-merges an enabled override without changing the API model ID", () => {
    const model = {
      id: "model-1",
      modelID: "remote-model",
      name: "Discovered",
      limit: { context: 32768, output: 4096 },
      capabilities: { tools: false, input: ["text"], output: ["text"] },
    }
    const result = applyModelOverride(model, {
      providerID: "provider-a",
      modelID: "model-1",
      patch: { name: "Custom", limit: { context: 65536 }, capabilities: { tools: true } },
      enabled: true,
      updatedAt: new Date().toISOString(),
    })

    expect(result).toEqual({
      ...model,
      name: "Custom",
      limit: { context: 65536, output: 4096 },
      capabilities: { tools: true, input: ["text"], output: ["text"] },
    })
  })

  it("deletes an existing override and reports whether it existed", async () => {
    const backend = storage()
    await setModelOverride(backend, { providerID: "provider-a", modelID: "model-1", patch: { reasoning: true } })
    await expect(deleteModelOverride(backend, "provider-a", "model-1")).resolves.toBe(true)
    await expect(deleteModelOverride(backend, "provider-a", "model-1")).resolves.toBe(false)
  })
})
