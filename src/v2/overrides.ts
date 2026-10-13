import type { Plugin } from "@opencode/plugin"
import type { RpcModelOverride } from "./rpc.js"

export const OVERRIDE_PREFIX = "overrides:"
const SENSITIVE_KEYS = /(?:api[_-]?key|authorization|headers?|token|password|secret|credential)/i

export interface StoredModelOverride extends RpcModelOverride {
  readonly version: 1
}

type Storage = Plugin.Context["storage"]

function key(providerID: string, modelID: string): string {
  return `${OVERRIDE_PREFIX}${providerID}:${modelID}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function validatePatch(value: unknown, path = "patch"): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new Error("Override patch must be a non-empty object")
  }

  const allowed = new Set(["name", "limit", "capabilities", "reasoning", "attachment", "cost", "compatibility", "variants"])
  for (const [field, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(field)) throw new Error(`Override field is not allowed: ${path}.${field}`)
    if (!allowed.has(field)) throw new Error(`Unsupported override field: ${path}.${field}`)

    if (["name"].includes(field) && typeof item !== "string") {
      throw new Error(`${path}.${field} must be a string`)
    }
    if (["reasoning", "attachment"].includes(field) && typeof item !== "boolean") {
      throw new Error(`${path}.${field} must be a boolean`)
    }
    if (["limit", "capabilities", "compatibility"].includes(field) && !isRecord(item)) {
      throw new Error(`${path}.${field} must be an object`)
    }
    if (field === "limit") {
      for (const [limitKey, limitValue] of Object.entries(item as Record<string, unknown>)) {
        if (!(limitKey === "context" || limitKey === "output" || limitKey === "input") || typeof limitValue !== "number" || !Number.isFinite(limitValue) || limitValue <= 0) {
          throw new Error(`${path}.limit.${limitKey} must be a positive number`)
        }
      }
    }
    if (field === "capabilities") {
      for (const [capability, capabilityValue] of Object.entries(item as Record<string, unknown>)) {
        if (capability === "tools" && typeof capabilityValue !== "boolean") throw new Error(`${path}.capabilities.tools must be a boolean`)
        if ((capability === "input" || capability === "output") && (!Array.isArray(capabilityValue) || !capabilityValue.every((entry) => typeof entry === "string"))) {
          throw new Error(`${path}.capabilities.${capability} must be an array of strings`)
        }
        if (!(capability === "tools" || capability === "input" || capability === "output")) throw new Error(`${path}.capabilities.${capability} is not supported`)
      }
    }
    if (field === "variants" && !Array.isArray(item)) throw new Error(`${path}.variants must be an array`)
    if (field === "cost" && !Array.isArray(item) && !isRecord(item)) throw new Error(`${path}.cost must be an object or array`)
    if (field === "compatibility") {
      for (const nestedKey of Object.keys(item as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.test(nestedKey)) throw new Error(`Override field is not allowed: ${path}.compatibility.${nestedKey}`)
      }
    }
  }
  return structuredClone(value)
}

function validStored(value: unknown): value is StoredModelOverride {
  if (!isRecord(value) || value.version !== 1 || typeof value.providerID !== "string" || typeof value.modelID !== "string" || typeof value.enabled !== "boolean" || typeof value.updatedAt !== "string") return false
  try {
    validatePatch(value.patch)
    return true
  } catch {
    return false
  }
}

export function overrideStorageKey(providerID: string, modelID: string): string {
  return key(providerID, modelID)
}

export async function listModelOverrides(storage: Storage | undefined, providerID?: string): Promise<StoredModelOverride[]> {
  if (!storage || typeof (storage as Storage & { scan?: unknown }).scan !== "function") return []
  const result = await storage.scan({ prefix: providerID ? `${OVERRIDE_PREFIX}${providerID}:` : OVERRIDE_PREFIX })
  return result.entries.flatMap((entry) => validStored(entry.value) ? [entry.value] : [])
}

export async function setModelOverride(
  storage: Storage | undefined,
  input: { providerID: string; modelID: string; patch: Record<string, unknown>; enabled?: boolean },
): Promise<StoredModelOverride> {
  if (!storage) throw new Error("V2 storage is unavailable; model overrides cannot be persisted")
  if (!input.providerID || !input.modelID) throw new Error("providerID and modelID are required")
  const override: StoredModelOverride = {
    version: 1,
    providerID: input.providerID,
    modelID: input.modelID,
    patch: validatePatch(input.patch),
    enabled: input.enabled ?? true,
    updatedAt: new Date().toISOString(),
  }
  await storage.set(key(input.providerID, input.modelID), override as never)
  return override
}

export async function deleteModelOverride(storage: Storage | undefined, providerID: string, modelID: string): Promise<boolean> {
  if (!storage) throw new Error("V2 storage is unavailable; model overrides cannot be persisted")
  const storageKey = key(providerID, modelID)
  const existing = await storage.get(storageKey)
  await storage.remove(storageKey)
  return existing !== undefined
}

function mergeValue(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return structuredClone(patch)
  const result: Record<string, unknown> = { ...base }
  for (const [field, value] of Object.entries(patch)) result[field] = mergeValue(result[field], value)
  return result
}

export function applyModelOverride<T extends Record<string, unknown>>(model: T, override: RpcModelOverride | undefined): T {
  if (!override?.enabled) return model
  return mergeValue(model, override.patch) as T
}
