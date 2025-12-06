import type Keyv from "keyv";

export default function KeyvCacheProxy({
	store,
	ttl,
	onMiss,
	onHit,
	prefix = "",
}: {
	store: Keyv;
	ttl: number;
	onMiss?: (key: string) => void;
	onHit?: (key: string) => void;
	prefix?: string;
}) {
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
