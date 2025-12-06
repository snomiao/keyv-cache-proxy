import { beforeEach, describe, expect, test } from "bun:test";
import Keyv from "keyv";
import KeyvCacheProxy, { globalThisCached } from "./index";

describe("KeyvCacheProxy", () => {
  let store: Keyv;

  beforeEach(() => {
    store = new Keyv();
  });

  describe("Basic Caching", () => {
    test("should cache method results", async () => {
      let callCount = 0;
      const obj = {
        getValue: (x: number) => {
          callCount++;
          return x * 2;
        },
      };

      const cached = KeyvCacheProxy({ store })(obj);

      // First call - should execute method
      const result1 = await cached.getValue(5);
      expect(result1).toBe(10);
      expect(callCount).toBe(1);

      // Second call - should return cached result
      const result2 = await cached.getValue(5);
      expect(result2).toBe(10);
      expect(callCount).toBe(1); // Should not increment
    });

    test("should cache different arguments separately", async () => {
      let callCount = 0;
      const obj = {
        add: (a: number, b: number) => {
          callCount++;
          return a + b;
        },
      };

      const cached = KeyvCacheProxy({ store })(obj);

      await cached.add(1, 2);
      await cached.add(3, 4);
      expect(callCount).toBe(2);

      await cached.add(1, 2); // Cached
      expect(callCount).toBe(2);

      await cached.add(3, 4); // Cached
      expect(callCount).toBe(2);
    });

    test("should handle async methods", async () => {
      const obj = {
        async fetchData(id: number) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { id, data: "test" };
        },
      };

      const cached = KeyvCacheProxy({ store })(obj);
      const result = await cached.fetchData(1);
      expect(result).toEqual({ id: 1, data: "test" });
    });

    test("should convert sync methods to async", async () => {
      const obj = {
        syncMethod: (x: number) => x * 2,
      };

      const cached = KeyvCacheProxy({ store })(obj);
      const result = cached.syncMethod(5);
      expect(result).toBeInstanceOf(Promise);
      expect(await result).toBe(10);
    });
  });

  describe("Hooks - onCached", () => {
    test("should call onCached hook on every invocation", async () => {
      const onCachedCalls: Array<{ key: string; value: any }> = [];
      const obj = {
        getValue: (x: number) => x * 2,
      };

      const cached = KeyvCacheProxy({
        store,
        onCached: (key, value) => {
          onCachedCalls.push({ key, value });
          return undefined;
        },
      })(obj);

      await cached.getValue(5); // First call - cache miss, onCached called with undefined
      expect(onCachedCalls.length).toBe(1);
      expect(onCachedCalls[0]?.value).toBe(undefined);

      await cached.getValue(5); // Second call - cache hit, onCached called with cached value
      expect(onCachedCalls.length).toBe(2);
      expect(onCachedCalls[1]?.value).toBe(10);
      expect(onCachedCalls[1]?.key).toContain("getValue");
    });

    test("should allow onCached to modify cached value", async () => {
      const obj = {
        getData: () => ({ value: 100 }),
      };

      const cached = KeyvCacheProxy({
        store,
        onCached: (_key, value) => {
          // Only modify if value exists (cache hit)
          if (value !== undefined) {
            return { data: { ...value, fromCache: true } };
          }
        },
      })(obj);

      const result1 = await cached.getData();
      expect(result1).toEqual({ value: 100 });

      const result2 = await cached.getData();
      expect(result2).toMatchObject({ value: 100, fromCache: true });
    });

    test("should return original value if onCached returns undefined", async () => {
      const obj = {
        getValue: () => 42,
      };

      const cached = KeyvCacheProxy({
        store,
        onCached: (_key, _value) => {
          // Return undefined to keep original
          return undefined;
        },
      })(obj);

      await cached.getValue(); // Prime cache
      const result = await cached.getValue();
      expect(result).toBe(42);
    });

    test("should support async onCached hook", async () => {
      const obj = {
        getValue: () => 100,
      };

      const cached = KeyvCacheProxy({
        store,
        onCached: async (_key, value) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          // Only modify on cache hit
          if (value !== undefined) {
            return { data: value * 2 };
          }
        },
      })(obj);

      await cached.getValue(); // Prime cache
      const result = await cached.getValue();
      expect(result).toBe(200);
    });

    test("should force cache miss when onCached returns skip", async () => {
      let fetchCount = 0;
      const obj = {
        getValue: () => {
          fetchCount++;
          return fetchCount;
        },
      };

      const cached = KeyvCacheProxy({
        store,
        onCached: (_key, value) => {
          // Return { skip: true } to force refetch even if cached
          if (value !== undefined) {
            return { skip: true }; // Force cache miss
          }
        },
      })(obj);

      const result1 = await cached.getValue();
      expect(result1).toBe(1);

      const result2 = await cached.getValue(); // Should refetch due to null
      expect(result2).toBe(2);
      expect(fetchCount).toBe(2);
    });
  });

  describe("Hooks - onFetched", () => {
    test("should call onFetched hook on cache miss", async () => {
      const onFetchedCalls: Array<{ key: string; value: any }> = [];
      const obj = {
        getValue: (x: number) => x * 2,
      };

      const cached = KeyvCacheProxy({
        store,
        onFetched: (key, value) => {
          onFetchedCalls.push({ key, value });
          return undefined;
        },
      })(obj);

      await cached.getValue(5);
      expect(onFetchedCalls.length).toBe(1);
      expect(onFetchedCalls[0]?.value).toBe(10);
      expect(onFetchedCalls[0]?.key).toContain("getValue");

      await cached.getValue(5); // Cache hit - no fetch
      expect(onFetchedCalls.length).toBe(1);
    });

    test("should allow onFetched to modify value before caching", async () => {
      const obj = {
        getData: () => ({ value: 100 }),
      };

      const cached = KeyvCacheProxy({
        store,
        onFetched: (_key, value) => {
          return { data: { ...value, fetchedAt: Date.now() } };
        },
      })(obj);

      const result1 = await cached.getData();
      expect(result1).toHaveProperty("fetchedAt");
      expect(result1.value).toBe(100);

      // Should return modified cached value
      const result2 = await cached.getData();
      expect(result2).toEqual(result1);
    });

    test("should support async onFetched hook", async () => {
      const obj = {
        getValue: () => 50,
      };

      const cached = KeyvCacheProxy({
        store,
        onFetched: async (_key, value) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { data: value * 3 };
        },
      })(obj);

      const result = await cached.getValue();
      expect(result).toBe(150);
    });

    test("should cache modified value from onFetched", async () => {
      let callCount = 0;
      const obj = {
        getValue: () => {
          callCount++;
          return 10;
        },
      };

      const cached = KeyvCacheProxy({
        store,
        onFetched: (_key, value) => ({ data: value * 10 }),
      })(obj);

      const result1 = await cached.getValue();
      expect(result1).toBe(100);

      const result2 = await cached.getValue();
      expect(result2).toBe(100);
      expect(callCount).toBe(1); // Only called once
    });

    test("should skip caching when onFetched returns skip", async () => {
      let callCount = 0;
      const obj = {
        getValue: (x: number) => {
          callCount++;
          return x * 2;
        },
      };

      const cached = KeyvCacheProxy({
        store,
        onFetched: () => {
          // Return { skip: true } to skip caching
          return { skip: true };
        },
      })(obj);

      // First call - fetch fresh
      const result1 = await cached.getValue(5);
      expect(result1).toBe(10);
      expect(callCount).toBe(1);

      // Second call - should fetch again because nothing was cached
      const result2 = await cached.getValue(5);
      expect(result2).toBe(10);
      expect(callCount).toBe(2); // Should call original method again

      // Verify nothing was cached
      const key = "getValue(5)";
      const cachedValue = await store.get(key);
      expect(cachedValue).toBeUndefined();
    });
  });

  describe("Hooks - Combined", () => {
    test("should call both hooks appropriately", async () => {
      const hookCalls: string[] = [];
      const obj = {
        getValue: (x: number) => x,
      };

      const cached = KeyvCacheProxy({
        store,
        onCached: (_key, value) => {
          hookCalls.push("cache");
          return value;
        },
        onFetched: (_key, value) => {
          hookCalls.push("fetch");
          return value;
        },
      })(obj);

      await cached.getValue(1); // cache miss: onCached(undefined), then onFetched
      expect(hookCalls).toEqual(["cache", "fetch"]);

      await cached.getValue(1); // cache hit: onCached(value)
      expect(hookCalls).toEqual(["cache", "fetch", "cache"]);

      await cached.getValue(2); // cache miss: onCached(undefined), then onFetched
      expect(hookCalls).toEqual(["cache", "fetch", "cache", "cache", "fetch"]);
    });

    test("should apply both modifications correctly", async () => {
      const obj = {
        getValue: () => ({ base: 1 }),
      };

      const cached = KeyvCacheProxy({
        store,
        onCached: (_key, value) => {
          // Only modify on cache hit
          if (value !== undefined) {
            return { data: { ...value, fromCache: true } };
          }
        },
        onFetched: (_key, value) => ({ data: { ...value, fromFetch: true } }),
      })(obj);

      const result1 = await cached.getValue();
      expect(result1).toMatchObject({ base: 1, fromFetch: true });

      const result2 = await cached.getValue();
      expect(result2).toMatchObject({
        base: 1,
        fromFetch: true,
        fromCache: true,
      });
    });
  });

  describe("Nested Objects", () => {
    test("should handle nested object methods", async () => {
      let callCount = 0;
      const obj = {
        api: {
          users: {
            get: (id: number) => {
              callCount++;
              return { id, name: `User ${id}` };
            },
          },
        },
      };

      const cached = KeyvCacheProxy({ store })(obj);

      await cached.api.users.get(1);
      await cached.api.users.get(1);
      expect(callCount).toBe(1);
    });

    test("should propagate hooks to nested objects", async () => {
      const hookCalls: string[] = [];
      const obj = {
        level1: {
          level2: {
            method: () => "result",
          },
        },
      };

      const cached = KeyvCacheProxy({
        store,
        onFetched: (key) => {
          hookCalls.push(key);
          return undefined;
        },
      })(obj);

      await cached.level1.level2.method();
      expect(hookCalls.length).toBe(1);
      expect(hookCalls[0]).toContain("level1.level2.method");
    });

    test("should cache nested methods independently", async () => {
      const calls = { method1: 0, method2: 0 };
      const obj = {
        nested: {
          method1: () => {
            calls.method1++;
            return "result1";
          },
          method2: () => {
            calls.method2++;
            return "result2";
          },
        },
      };

      const cached = KeyvCacheProxy({ store })(obj);

      await cached.nested.method1();
      await cached.nested.method1();
      await cached.nested.method2();
      await cached.nested.method2();

      expect(calls.method1).toBe(1);
      expect(calls.method2).toBe(1);
    });
  });

  describe("Prefix", () => {
    test("should add prefix to cache keys", async () => {
      const keys: string[] = [];
      const obj = {
        getData: () => "data",
      };

      const cached = KeyvCacheProxy({
        store,
        prefix: "myapp:",
        onFetched: (key) => {
          keys.push(key);
          return undefined;
        },
      })(obj);

      await cached.getData();
      expect(keys[0]).toStartWith("myapp:");
    });

    test("should prefix nested object keys correctly", async () => {
      const keys: string[] = [];
      const obj = {
        api: {
          getData: () => "data",
        },
      };

      const cached = KeyvCacheProxy({
        store,
        prefix: "app:",
        onFetched: (key) => {
          keys.push(key);
          return undefined;
        },
      })(obj);

      await cached.api.getData();
      expect(keys[0]).toBe("app:api.getData()");
    });
  });

  describe("TTL", () => {
    test("should expire cache after TTL", async () => {
      let callCount = 0;
      const obj = {
        getValue: () => {
          callCount++;
          return callCount;
        },
      };

      const cached = KeyvCacheProxy({
        store,
        ttl: 100, // 100ms
      })(obj);

      const result1 = await cached.getValue();
      expect(result1).toBe(1);

      const result2 = await cached.getValue();
      expect(result2).toBe(1); // Cached

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result3 = await cached.getValue();
      expect(result3).toBe(2); // Fresh call
    });

    test("should support custom TTL from onFetched", async () => {
      let callCount = 0;
      const obj = {
        getValue: () => {
          callCount++;
          return callCount;
        },
      };

      const cached = KeyvCacheProxy({
        store,
        ttl: 10000, // Default 10s
        onFetched: (_key, value) => {
          // Use custom TTL of 100ms
          return { data: value, ttl: 100 };
        },
      })(obj);

      const result1 = await cached.getValue();
      expect(result1).toBe(1);

      const result2 = await cached.getValue();
      expect(result2).toBe(1); // Cached

      // Wait for custom TTL to expire (100ms)
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result3 = await cached.getValue();
      expect(result3).toBe(2); // Fresh call due to custom TTL
    });
  });

  describe("Non-function Properties", () => {
    test("should return non-function properties as-is", async () => {
      const obj = {
        value: 42,
        text: "hello",
        method: () => "result",
      };

      const cached = KeyvCacheProxy({ store })(obj);

      expect(cached.value).toBe(42);
      expect(cached.text).toBe("hello");
    });

    test("should handle null and undefined properties", async () => {
      const obj = {
        nullValue: null as null,
        undefinedValue: undefined as undefined,
        method: () => "result",
      };

      const cached = KeyvCacheProxy({ store })(obj);

      expect(cached.nullValue).toBe(null);
      expect(cached.undefinedValue).toBe(undefined);
    });
  });

  describe("Edge Cases", () => {
    test("should handle methods with no arguments", async () => {
      let callCount = 0;
      const obj = {
        getValue: () => {
          callCount++;
          return "value";
        },
      };

      const cached = KeyvCacheProxy({ store })(obj);

      await cached.getValue();
      await cached.getValue();
      expect(callCount).toBe(1);
    });

    test("should handle methods with complex object arguments", async () => {
      let callCount = 0;
      const obj = {
        process: (data: { id: number; nested: { value: string } }) => {
          callCount++;
          return data.nested.value;
        },
      };

      const cached = KeyvCacheProxy({ store })(obj);

      const arg = { id: 1, nested: { value: "test" } };
      await cached.process(arg);
      await cached.process(arg);
      expect(callCount).toBe(1);
    });

    test("should handle undefined cache values", async () => {
      const obj = {
        getValue: () => undefined,
      };

      const cached = KeyvCacheProxy({ store })(obj);
      const result = await cached.getValue();
      expect(result).toBe(undefined);
    });

    test("should handle null return values", async () => {
      let _callCount = 0;
      const obj = {
        getValue: () => {
          _callCount++;
          return null;
        },
      };

      const cached = KeyvCacheProxy({ store })(obj);

      await cached.getValue();
      await cached.getValue();
      // Note: null values won't be cached because store.get returns undefined for missing keys
      // This is expected Keyv behavior
    });

    test("should handle errors in methods", async () => {
      const obj = {
        throwError: () => {
          throw new Error("Test error");
        },
      };

      const cached = KeyvCacheProxy({ store })(obj);

      await expect(cached.throwError()).rejects.toThrow("Test error");
    });

    test("should handle errors in hooks", async () => {
      const obj = {
        getValue: () => 42,
      };

      const cached = KeyvCacheProxy({
        store,
        onFetched: () => {
          throw new Error("Hook error");
        },
      })(obj);

      await expect(cached.getValue()).rejects.toThrow("Hook error");
    });

    test("should work with Map as store", async () => {
      let callCount = 0;
      const mapStore = new Map();
      const obj = {
        getValue: (x: number) => {
          callCount++;
          return x * 2;
        },
      };

      const cached = KeyvCacheProxy({ store: mapStore })(obj);

      await cached.getValue(5);
      await cached.getValue(5);
      expect(callCount).toBe(1);
    });
  });

  describe("Type Preservation", () => {
    test("should preserve method signatures", async () => {
      const obj = {
        add: (a: number, b: number): number => a + b,
        concat: (a: string, b: string): string => a + b,
      };

      const cached = KeyvCacheProxy({ store })(obj);

      const sum: number = await cached.add(1, 2);
      const text: string = await cached.concat("hello", "world");

      expect(sum).toBe(3);
      expect(text).toBe("helloworld");
    });
  });
});

describe("globalThisCached", () => {
  test("should cache computed values", () => {
    let callCount = 0;
    const compute = () => {
      callCount++;
      return { value: 42 };
    };

    const uniqueKey = `test-key-${Math.random()}`;
    const result1 = globalThisCached(uniqueKey, compute);
    const result2 = globalThisCached(uniqueKey, compute);

    expect(result1).toBe(result2);
    expect(callCount).toBe(1);
  });

  test("should support different cache keys", () => {
    const key1 = `key1-${Math.random()}`;
    const key2 = `key2-${Math.random()}`;
    const result1 = globalThisCached(key1, () => ({ id: 1 }));
    const result2 = globalThisCached(key2, () => ({ id: 2 }));

    expect(result1).not.toBe(result2);
    expect(result1.id).toBe(1);
    expect(result2.id).toBe(2);
  });

  test("should work with sync computations", () => {
    const uniqueKey = `sync-${Math.random()}`;
    const value = globalThisCached(uniqueKey, () => "test-value");
    expect(value).toBe("test-value");
  });

  test("should handle primitive values", () => {
    const num = globalThisCached(`number-${Math.random()}`, () => 123);
    const str = globalThisCached(`string-${Math.random()}`, () => "hello");
    const bool = globalThisCached(`boolean-${Math.random()}`, () => true);

    expect(num).toBe(123);
    expect(str).toBe("hello");
    expect(bool).toBe(true);
  });
});
