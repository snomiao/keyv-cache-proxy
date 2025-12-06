import type Keyv from "keyv";
/**
 * KeyvCacheProxy
 * A proxy wrapper that adds caching capabilities to an object's asynchronous methods using a Keyv store.
 * It intercepts method calls, checks for cached results, and stores new results in the cache with a specified TTL.
 *
 * @param store - An instance of Keyv to use as the cache store.
 * @param ttl - Time-to-live for cached entries in milliseconds.
 * @param onMiss - Optional callback function invoked on cache misses.
 * @param onHit - Optional callback function invoked on cache hits.
 * @param prefix - Optional prefix to prepend to cache keys.
 *
 * @returns A proxy-wrapped version of the input object with caching applied to its asynchronous methods.
 *
 * @example
 *
 * for example, github api caching
 * ```ts
 * import { Keyv } from "keyv";
 * import KeyvCacheProxy from "keyv-cache-proxy";
 * import { Octokit } from "octokit";
 *
 * const kv = new Keyv();
 * const gh = KeyvCacheProxy({
 *  store: kv,
 *  ttl: 600e3,
 *  prefix: `api.`,
 *  // hooks
 *  onHit: (key) => console.log(`Cache hit: ${key}`),
 *  onMiss: (key) => console.log(`Cache miss: ${key}`),
 * })(new Octokit());
 *
 * // first call, cache miss
 * console.log(
 *  (await gh.repos.get({ owner: "snomiao", repo: "snomiao" })).data.html_url,
 * );
 * // prints: cache miss: api.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
 * // returns fresh result
 *
 * // second call, cache hit
 * console.log(
 *  (await gh.repos.get({ owner: "snomiao", repo: "snomiao" })).data.html_url,
 * );
 * // prints: cache hit: api.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
 * // returns cached result
 *
 */
export default function KeyvCacheProxy(options: {
	store: Keyv;
	ttl?: number;
	onMiss?: (key: string) => void;
	onHit?: (key: string) => void;
	prefix?: string;
}) {
	const { store, ttl, onMiss, onHit, prefix = "" } = options;

	return <T extends object>(obj: T): DeepAsyncMethod<T> =>
		new Proxy(obj, {
			get(target, prop, receiver) {
				// handle wrap method calls with caching
				const val = target[prop as keyof T];
				if (typeof val === "function") {
					const method = (val as Function).bind(obj);
					return async (...args: any[]) => {
						const key = `${prefix}${String(prop)}:${JSON.stringify(args)}`;
						const cached = await store.get(key);
						if (cached !== undefined) {
							onHit?.(key);
							return cached;
						}
						onMiss?.(key);
						const result = await method(...args);
						// const result = await (val as Function).apply(this, args);

						await store.set(key, result, ttl);
						return result;
					};
				}
				// deep proxy for nested objects
				if (typeof val === "object" && val !== null) {
					return KeyvCacheProxy({
						store,
						ttl,
						onMiss,
						onHit,
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
