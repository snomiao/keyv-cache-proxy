/**
 * Runtime benchmarks for KeyvCacheProxy
 * Tests lazy loading performance with large nested objects (like github octokit.rest)
 */

import KeyvCacheProxy from "../src/index";

// Create a large nested object structure similar to Octokit
function createLargeNestedObject(depth: number, breadth: number) {
  const obj: any = {};

  if (depth === 0) {
    // At leaf level, add some methods
    for (let i = 0; i < breadth; i++) {
      obj[`method${i}`] = async (arg: any) => `result-${arg}`;
    }
  } else {
    // Create nested objects
    for (let i = 0; i < breadth; i++) {
      obj[`namespace${i}`] = createLargeNestedObject(depth - 1, breadth);
    }
  }

  return obj;
}

// Simple benchmark helper
function bench(name: string, fn: () => void, iterations = 1000) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;
  console.log(`${name}:`);
  console.log(`  Total: ${total.toFixed(2)}ms`);
  console.log(`  Average: ${avg.toFixed(4)}ms`);
  console.log(`  Ops/sec: ${(1000 / avg).toFixed(0)}`);
  return { total, avg };
}

async function runBenchmarks() {
  console.log("KeyvCacheProxy Runtime Benchmarks");
  console.log("=================================\n");

  const store = new Map();
  const cacheProxy = KeyvCacheProxy({ store, ttl: 60000 });

  // Test 1: Small object (baseline)
  console.log("1. Small Object (3 levels, 5 properties per level)");
  const smallObj = createLargeNestedObject(3, 5);
  bench("  Creating proxy", () => {
    cacheProxy(smallObj);
  }, 10000);

  const proxiedSmall = cacheProxy(smallObj);
  bench("  Accessing nested property (1 level)", () => {
    proxiedSmall.namespace0;
  }, 10000);

  bench("  Accessing deeply nested property (3 levels)", () => {
    proxiedSmall.namespace0.namespace0.namespace0;
  }, 10000);

  console.log();

  // Test 2: Medium object (similar to common API clients)
  console.log("2. Medium Object (4 levels, 10 properties per level)");
  const mediumObj = createLargeNestedObject(4, 10);
  bench("  Creating proxy", () => {
    cacheProxy(mediumObj);
  }, 1000);

  const proxiedMedium = cacheProxy(mediumObj);
  bench("  Accessing nested property (1 level)", () => {
    proxiedMedium.namespace0;
  }, 10000);

  bench("  Accessing deeply nested property (4 levels)", () => {
    proxiedMedium.namespace0.namespace0.namespace0.namespace0;
  }, 10000);

  console.log();

  // Test 3: Large object (similar to Octokit.rest)
  console.log("3. Large Object (5 levels, 15 properties per level)");
  const largeObj = createLargeNestedObject(5, 15);
  bench("  Creating proxy", () => {
    cacheProxy(largeObj);
  }, 100);

  const proxiedLarge = cacheProxy(largeObj);
  bench("  Accessing nested property (1 level)", () => {
    proxiedLarge.namespace0;
  }, 10000);

  bench("  Accessing deeply nested property (5 levels)", () => {
    proxiedLarge.namespace0.namespace0.namespace0.namespace0.namespace0;
  }, 10000);

  // Test accessing same property multiple times (should hit cache)
  bench("  Re-accessing same nested property (5 levels)", () => {
    proxiedLarge.namespace0.namespace0.namespace0.namespace0.namespace0;
  }, 10000);

  console.log();

  // Test 4: Memory comparison
  console.log("4. Memory Usage (approximate)");
  const objCount = 100;
  const testObj = createLargeNestedObject(4, 10);

  if (global.gc) {
    global.gc();
  }
  const memBefore = process.memoryUsage().heapUsed;

  const proxies: any[] = [];
  for (let i = 0; i < objCount; i++) {
    proxies.push(cacheProxy(testObj));
  }

  if (global.gc) {
    global.gc();
  }
  const memAfter = process.memoryUsage().heapUsed;

  const memDiff = (memAfter - memBefore) / 1024 / 1024;
  console.log(`  ${objCount} proxies: ${memDiff.toFixed(2)} MB`);
  console.log(`  Per proxy: ${(memDiff * 1024 / objCount).toFixed(2)} KB`);

  console.log();

  // Test 5: Method invocation
  console.log("5. Method Invocation Performance");
  const apiObj = {
    users: {
      repos: {
        get: async (opts: any) => ({ data: opts }),
        list: async (opts: any) => ({ data: [opts] }),
      },
      get: async (opts: any) => ({ data: opts }),
    },
  };

  const proxiedApi = cacheProxy(apiObj);

  // Warm up - first call will miss cache
  await proxiedApi.users.repos.get({ owner: "test", repo: "test" });

  const iterations = 1000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await proxiedApi.users.repos.get({ owner: "test", repo: "test" });
  }
  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;

  console.log(`  Cached method calls (${iterations} iterations):`);
  console.log(`    Total: ${total.toFixed(2)}ms`);
  console.log(`    Average: ${avg.toFixed(4)}ms`);
  console.log(`    Ops/sec: ${(1000 / avg).toFixed(0)}`);

  console.log();
  console.log("Benchmarks completed!");
}

// Run benchmarks
runBenchmarks().catch(console.error);
