import type Keyv from "keyv";
import type { KeyvStoreAdapter } from "keyv";
type Awaitable<T> = T | Promise<T>;
/**
 * KeyvCacheProxy
 * A proxy wrapper that adds caching capabilities to an object's asynchronous methods using a Keyv store.
 * It intercepts method calls, checks for cached results, and stores new results in the cache with a specified TTL.
 *
 * @param store - An instance of Keyv to use as the cache store.
 * @param ttl - Time-to-live for cached entries in milliseconds.
 * @param onCached - Optional hook called when data is loaded from cache. Receives key and cached value, can return modified value.
 * @param onFetched - Optional hook called when data is freshly fetched. Receives key and fetched value, can return modified value before caching.
 * @param prefix - Optional prefix to prepend to cache keys.
 *
 * @returns A proxy-wrapped version of the input object with caching applied to its asynchronous methods.
 *
 * @example
 *
 * Basic usage with GitHub API caching
 * ```ts
 * import { Keyv } from "keyv";
 * import KeyvCacheProxy from "keyv-cache-proxy";
 * import { Octokit } from "octokit";
 *
 * const kv = new Keyv();
 * const gh = KeyvCacheProxy({
 *   store: kv,
 *   ttl: 600e3,
 *   prefix: `api.`,
 *   // hooks for logging
 *   onCached: (key, value) => value ? console.log(`Cache hit: ${key}`) : console.log(`Cache miss: ${key}`),
 *   onFetched: (key, value) => console.log(`Fetched fresh: ${key}`),
 * })(new Octokit());
 *
 * // first call - cache miss, fetches fresh data
 * await gh.repos.get({ owner: "snomiao", repo: "snomiao" });
 * // prints: Cache miss: api.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
 * // prints: Fetched fresh: api.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
 *
 * // second call - cache hit, returns cached data
 * await gh.repos.get({ owner: "snomiao", repo: "snomiao" });
 * // prints: Cache hit: api.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
 * ```
 *
 * @example
 *
 * Advanced usage - modifying cached/fetched data
 * ```ts
 * const gh = KeyvCacheProxy({
 *   store: kv,
 *   ttl: 600e3,
 *   // Modify cached data before returning (called on every invocation)
 *   onCached: (key, value) => {
 *     if (value !== undefined) {
 *       console.log(`Using cached data for ${key}`);
 *       return { data: { ...value, fromCache: true } };
 *     }
 *   },
 *   // Transform fetched data before caching
 *   onFetched: (key, value) => {
 *     console.log(`Caching fresh data for ${key}`);
 *     return { data: { ...value, fetchedAt: Date.now() } };
 *   },
 * })(new Octokit());
 * ```
 *
 * @example
 *
 * Force cache refresh by returning { skip: true } from onCached
 * ```ts
 * const gh = KeyvCacheProxy({
 *   store: kv,
 *   ttl: 600e3,
 *   onCached: (key, value) => {
 *     // Return { skip: true } to force refetch even if cached
 *     if (shouldRefresh(value)) {
 *       return { skip: true }; // Forces cache miss
 *     }
 *     // Return undefined to use cached value as-is
 *   },
 * })(new Octokit());
 * ```
 *
 * @example
 *
 * Custom TTL per request with onFetched
 * ```ts
 * const gh = KeyvCacheProxy({
 *   store: kv,
 *   ttl: 600e3, // Default 10 minutes
 *   onFetched: (key, value) => {
 *     // Cache user data for 1 hour, other data uses default TTL
 *     if (key.includes('users')) {
 *       return { data: value, ttl: 3600e3 };
 *     }
 *     return { data: value };
 *   },
 * })(new Octokit());
 * ```
 */
export default function KeyvCacheProxy(options: {
  /** Keyv store instance to use for caching */
  store: Keyv | KeyvStoreAdapter | Map<any, any>;
  /** Time-to-live for cached entries in milliseconds */
  ttl?: number;
  /**
   * Called when data is loaded from cache. Receives key and cached value, can return modified value.
   * Returns undefined to use original cached value.
   * Return { skip: true } to skip returning cached value and treat as cache miss.
   * Return { data?: <value> } to return modified cached value.
   */
  onCached?: (key: string, value: any) => Awaitable<{ data?: any } | { skip: true } | undefined>;
  /**
   * Called when data is freshly fetched. Receives key and fetched value, can return modified value before caching.
   * Return undefined to use original fetched value.
   * Return {} to use original fetched value with default TTL.
   * Return { data?: <value>, ttl?: <number> } to cache modified value with optional custom TTL.
   * Return { skip: true } to skip caching but still return fetched value.
   */
  onFetched?: (key: string, value: any) => Awaitable<{ data?: any, ttl?: number } | { skip: true } | undefined>;
  /** Prefix of keys */
  prefix?: string;
}) {
  const { store, ttl, onCached, onFetched, prefix = "" } = options;

  return <T extends object>(obj: T): DeepAsyncMethod<T> =>
    new Proxy(obj, {
      get(target, prop, receiver) {
        // handle wrap method calls with caching
        const val = target[prop as keyof T];
        if (typeof val === "function") {
          const method = val.bind(obj);
          return async (...args: any[]) => {
            const key = `${prefix}${String(prop)}(${args.map((arg) => JSON.stringify(arg)).join(",")})`;

            // Check cache
            let cached = await store.get(key);
            if (onCached) {
              const modified = await onCached(key, cached);
              if (modified !== undefined && typeof modified === 'object' && modified !== null) {
                if ('skip' in modified && modified.skip) {
                  // Treat as cache miss
                  cached = undefined;
                } else if ('data' in modified) {
                  // Return modified data
                  return modified.data;
                }
                // If modified is {} without skip or data, continue with original cached value
              }
            }
            if (cached !== undefined) {
              return cached;
            }

            // Fetch fresh data
            let result = await method(...args); // call original method
            let customTtl = ttl;

            // onFetched hook - can modify result before caching
            if (onFetched) {
              const modified = await onFetched(key, result);
              if (modified !== undefined && typeof modified === 'object' && modified !== null) {
                if ('skip' in modified && modified.skip) {
                  // Skip caching, but still return the fetched value
                  return result;
                } else if ('data' in modified || 'ttl' in modified) {
                  // Use modified data and/or custom TTL
                  if ('data' in modified && modified.data !== undefined) {
                    result = modified.data;
                  }
                  if ('ttl' in modified && modified.ttl !== undefined) {
                    customTtl = modified.ttl;
                  }
                }
                // If modified is {} without skip/data/ttl, use original result with default TTL
              }
            }

            await store.set(key, result, customTtl);
            return result;
          };
        }
        // deep proxy for nested objects
        if (typeof val === "object" && val !== null) {
          return KeyvCacheProxy({
            store,
            ttl,
            onCached,
            onFetched,
            prefix: `${prefix}${String(prop)}.`,
          })(val);
        }
        // return property value for non-function properties
        return Reflect.get(target, prop, receiver);
      },
    }) as DeepAsyncMethod<T>;
}

export type DeepAsyncMethod<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : T[K] extends object
  ? DeepAsyncMethod<T[K]>
  : T[K];
};

/**
 * utils: globalThisCached
 * A utility function that caches the result of an asynchronous computation in the globalThis object.
 * It uses a Map stored on globalThis to cache results based on a provided key.
 * Handy when run with bun --hot
 *
 * @param key - The key to identify the cached result.
 * @param compute - An asynchronous function that computes the value to be cached.
 *
 * @returns The cached result if available; otherwise, it computes the result, caches it, and returns it.
 *
 * @example
 * ```ts
 * const result = await globalThisCached("keyv", async () => new Keyv());
 * ```
 */
export function globalThisCached<T>(name: string, compute: () => T): T {
  const g = globalThis as typeof globalThis & {
    __keyv_cache_proxy_global_cache__?: Map<string, unknown>;
  };
  g.__keyv_cache_proxy_global_cache__ ??= new Map();

  const cache = g.__keyv_cache_proxy_global_cache__;
  if (cache.has(name)) {
    return cache.get(name) as T;
  } else {
    const result = compute();
    cache.set(name, result);
    return result;
  }
}
