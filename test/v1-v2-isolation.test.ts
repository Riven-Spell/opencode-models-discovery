import { describe, expect, it, vi } from "vitest"
import { createV2StorageCache } from "../src/v2/storage-cache.js"
import { discoveryCacheKey } from "../src/core/discovery-cache.js"
import { ProviderModelStore } from "../src/plugin/provider-model-store.js"
import { resolveProviderCredential } from "../src/v2/credential-resolver.js"

describe("V1/V2 legacy boundary", () => {
  it("uses separate cache namespaces and storage backends", async () => {
    const v2Values = new Map<string, unknown>()
    const v2Storage = {
      get: vi.fn(async (key: string) => v2Values.get(key)),
      set: vi.fn(async (key: string, value: unknown) => { v2Values.set(key, value) }),
      remove: vi.fn(async (key: string) => { v2Values.delete(key) }),
    }
    const v2Cache = createV2StorageCache(v2Storage)
    const v2Key = discoveryCacheKey("opencode.models-discovery.v2", "provider-a")

    await v2Cache.set(v2Key, { version: 1, source: "v2" } as never)
    expect(await v2Cache.get(v2Key)).toEqual({ version: 1, source: "v2" })
    expect(v2Values.has("overrides:provider-a:model-1")).toBe(false)

    const v1Root = `/tmp/opencode-models-discovery-v1-isolation-${Date.now()}`
    const v1Store = new ProviderModelStore(v1Root)
    expect(v1Store.getStatePath("provider-a")).not.toBe(v2Key)
  })

  it("does not treat V2 override records as V1 provider model state", async () => {
    const root = `/tmp/opencode-models-discovery-v1-isolation-state-${Date.now()}`
    const store = new ProviderModelStore(root)
    const overrideKey = "overrides:provider-a:model-1"
    const state = await store.read({ id: overrideKey, baseURL: "http://example.test/v1", endpoint: "/v1/models" })
    expect(state).toBeUndefined()
  })

  it("does not let V2 credential resolution read the V1 auth-content fallback", async () => {
    const previous = process.env.OPENCODE_AUTH_CONTENT
    process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({
      "provider-a": { type: "api", key: "v1-auth-store-secret" },
    })

    try {
      await expect(resolveProviderCredential({}, {
        id: "provider-a",
        settings: {},
      })).resolves.toBeUndefined()
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_AUTH_CONTENT
      else process.env.OPENCODE_AUTH_CONTENT = previous
    }
  })
})
