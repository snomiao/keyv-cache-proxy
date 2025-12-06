# keyv-cache-proxy

A transparent caching proxy for any object using [Keyv](https://github.com/jaredwray/keyv) - automatically cache method calls with TTL support.

## Features

- 🚀 **Zero-config caching**: Wrap any object to automatically cache all method calls
- ⏱️ **TTL support**: Set time-to-live for cached values
- 🔑 **Flexible storage**: Use any Keyv-compatible storage adapter
- 🎯 **Deep proxy**: Automatically handles nested objects
- 📊 **Cache observability**: Optional callbacks for cache hits and misses
- 🔄 **Async-first**: Automatically converts all methods to async

## Installation

```bash
bun add keyv-cache-proxy keyv
```

Or with npm/yarn/pnpm:

```bash
npm install keyv-cache-proxy keyv
```

## Quick Start

```typescript
import { KeyvCacheProxy } from 'keyv-cache-proxy';
import Keyv from 'keyv';

// Create a Keyv instance with any storage backend
const store = new Keyv();

// Wrap any object with caching
const cachedAPI = KeyvCacheProxy({
  store,
  ttl: 600000, // 10 minutes
})(yourAPIClient);

// All method calls are now automatically cached!
const result = await cachedAPI.fetchData('param1', 'param2');
```

## Usage Examples

### Basic Usage

```typescript
import { KeyvCacheProxy } from 'keyv-cache-proxy';
import Keyv from 'keyv';

const myObject = {
  expensiveOperation(a: number, b: number) {
    console.log('Computing...');
    return a + b;
  }
};

const cached = KeyvCacheProxy({
  store: new Keyv(),
  ttl: 60000, // 1 minute
})(myObject);

// First call: executes the method
await cached.expensiveOperation(1, 2); // Logs: "Computing..."

// Second call: returns cached result
await cached.expensiveOperation(1, 2); // No log, returns from cache
```

### With GitHub API (Octokit)

```typescript
import { Octokit } from 'octokit';
import { KeyvCacheProxy } from 'keyv-cache-proxy';
import Keyv from 'keyv';
import KeyvNedbStore from 'keyv-nedb-store';

// Use persistent storage
const kv = new Keyv(new KeyvNedbStore('.cache/github.yaml'));

const gh = KeyvCacheProxy({
  store: kv,
  ttl: 600000, // 10 minutes
  prefix: 'github.',
  onHit: (key) => console.log('Cache hit:', key),
  onMiss: (key) => console.log('Cache miss:', key),
})(new Octokit().rest);

// API calls are now cached
const repo = await gh.repos.get({ owner: 'snomiao', repo: 'keyv-cache-proxy' });
```

### With Custom Storage Backends

```typescript
import { KeyvCacheProxy } from 'keyv-cache-proxy';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import KeyvMongo from '@keyv/mongo';

// Redis
const redisCache = KeyvCacheProxy({
  store: new Keyv(new KeyvRedis('redis://localhost:6379')),
  ttl: 3600000,
})(yourObject);

// MongoDB
const mongoCache = KeyvCacheProxy({
  store: new Keyv(new KeyvMongo('mongodb://localhost:27017')),
  ttl: 3600000,
})(yourObject);

// SQLite (via keyv-sqlite)
const sqliteCache = KeyvCacheProxy({
  store: new Keyv('sqlite://cache.db'),
  ttl: 3600000,
})(yourObject);
```

### Cache Observability

```typescript
let hits = 0;
let misses = 0;

const cached = KeyvCacheProxy({
  store: new Keyv(),
  ttl: 60000,
  onHit: (key) => {
    hits++;
    console.log(`Cache hit for ${key}. Total hits: ${hits}`);
  },
  onMiss: (key) => {
    misses++;
    console.log(`Cache miss for ${key}. Total misses: ${misses}`);
  },
})(myObject);
```

## API

### `KeyvCacheProxy(options)`

Creates a cache proxy factory function.

#### Options

- `store` (required): A Keyv instance for cache storage
- `ttl` (required): Time-to-live in milliseconds for cached values
- `prefix` (optional): Prefix for cache keys (default: `""`)
- `onHit` (optional): Callback function called on cache hits `(key: string) => void`
- `onMiss` (optional): Callback function called on cache misses `(key: string) => void`

#### Returns

A function that takes an object and returns a proxied version with automatic caching.

### Cache Key Generation

Cache keys are generated based on:
- Method name
- Arguments (JSON stringified)
- Prefix (if provided)

Format: `${prefix}${methodName}:${JSON.stringify(args)}`

### Type Safety

The proxy preserves TypeScript types and automatically converts all methods to async:

```typescript
type DeepAsyncMethod<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : T[K] extends object
    ? DeepAsyncMethod<T[K]>
    : T[K];
};
```

## How It Works

The `KeyvCacheProxy` uses JavaScript Proxy to intercept method calls:

1. When a method is called, it generates a cache key from the method name and arguments
2. Checks the Keyv store for an existing cached result
3. If found (cache hit), returns the cached value
4. If not found (cache miss), executes the original method
5. Stores the result in the cache with the specified TTL
6. Returns the result

Nested objects are automatically wrapped with the same caching behavior.

## Storage Backends

You can use any Keyv-compatible storage adapter:

- **In-memory** (default): `new Keyv()`
- **Redis**: [@keyv/redis](https://github.com/jaredwray/keyv/tree/main/packages/redis)
- **MongoDB**: [@keyv/mongo](https://github.com/jaredwray/keyv/tree/main/packages/mongo)
- **SQLite**: [@keyv/sqlite](https://github.com/jaredwray/keyv/tree/main/packages/sqlite)
- **PostgreSQL**: [@keyv/postgres](https://github.com/jaredwray/keyv/tree/main/packages/postgres)
- **MySQL**: [@keyv/mysql](https://github.com/jaredwray/keyv/tree/main/packages/mysql)
- **NeDB**: [keyv-nedb-store](https://github.com/snomiao/keyv-nedb-store)

## License

MIT © [snomiao](https://github.com/snomiao)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Related Projects

- [keyv](https://github.com/jaredwray/keyv) - Simple key-value storage with support for multiple backends
- [keyv-nedb-store](https://github.com/snomiao/keyv-nedb-store) - NeDB storage adapter for Keyv
