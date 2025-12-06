import type Keyv from "keyv";
import type { KeyvStoreAdapter } from "keyv";
/**
 * KeyvCacheProxy
 * A proxy wrapper that adds caching capabilities to an object's asynchronous methods using a Keyv store.
 * It intercepts method calls, checks for cached results, and stores new results in the cache with a specified TTL.
 *
 * @param store - An instance of Keyv to use as the cache store.
 * @param ttl - Time-to-live for cached entries in milliseconds.
 * @param onCache - Optional hook called when data is loaded from cache. Receives key and cached value, can return modified value.
 * @param onFetch - Optional hook called when data is freshly fetched. Receives key and fetched value, can return modified value before caching.
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
 *   onCache: (key, value) => value ? console.log(`Cache hit: ${key}`) : console.log(`Cache miss: ${key}`),
 *   onFetch: (key, value) => console.log(`Fetched fresh: ${key}`),
 * })(new Octokit());
 *r
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
 *   onCache: (key, value) => {
 *     if (value !== undefined) {
 *       console.log(`Using cached data for ${key}`);
 *       return { ...value, fromCache: true };
 *     }
 *   },
 *   // Transform fetched data before caching
 *   onFetch: (key, value) => {
 *     console.log(`Caching fresh data for ${key}`);
 *     return { ...value, fetchedAt: Date.now() };
 *   },
 * })(new Octokit());
 * ```
 *
 * @example
 *
 * Force cache refresh by returning null from onCache
 * ```ts
 * const gh = KeyvCacheProxy({
 *   store: kv,
 *   ttl: 600e3,
 *   onCache: (key, value) => {
 *     // Return null to force refetch even if cached
 *     if (shouldRefresh(value)) {
 *       return null; // Forces cache miss
 *     }
 *     return value; // Use cached value
 *   },
 * })(new Octokit());
 * ```
 */
export default function KeyvCacheProxy(options: {
  store: Keyv | KeyvStoreAdapter | Map<any, any>;
  ttl?: number;
  onCache?: (key: string, value: any) => Promise<any> | any;
  onFetch?: (key: string, value: any) => Promise<any> | any;
  prefix?: string;
  hot?: boolean;
}) {
  const { store, ttl, onCache, onFetch, prefix = "" } = options;

  return <T extends object>(obj: T): DeepAsyncMethod<T> =>
    new Proxy(obj, {
      get(target, prop, receiver) {
        // handle wrap method calls with caching
        const val = target[prop as keyof T];
        if (typeof val === "function") {
          const method = val.bind(obj);
          return async (...args: any[]) => {
            const key = `${prefix}${String(prop)}:${JSON.stringify(args)}`;

            // Check cache
            let cached = await store.get(key);
            if (onCache) {
              const modified = await onCache(key, cached);
              if (modified === null) {
                cached = undefined; // treat null as cache miss
              } else if (modified !== undefined) {
                return modified; // return modified cached value
              } // else return original cached value
            }
            if (cached !== undefined) {
              // onCache hook - can modify cached value before returning
              return cached;
            }

            // Fetch fresh data
            let result = await method(...args); // call original method

            // onFetch hook - can modify result before caching
            if (onFetch) {
              // call onFetch hook, can modify result before caching
              const modified = await onFetch(key, result);
              if (modified !== undefined) {
                result = modified;
              }
            }

            await store.set(key, result, ttl);
            return result;
          };
        }
        // deep proxy for nested objects
        if (typeof val === "object" && val !== null) {
          return KeyvCacheProxy({
            store,
            ttl,
            onCache,
            onFetch,
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
