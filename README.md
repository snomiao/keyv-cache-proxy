# keyv-cache-proxy

A transparent caching proxy for any object using [Keyv](https://github.com/jaredwray/keyv) - automatically cache method calls with TTL support.

## Features

- 🚀 **Zero-config caching**: Wrap any object to automatically cache all method calls
- ⏱️ **TTL support**: Set time-to-live for cached values
- 🔑 **Flexible storage**: Use any Keyv-compatible storage adapter
- 🎯 **Deep proxy**: Automatically handles nested objects
- 📊 **Cache observability**: Optional hooks for monitoring and modifying cached/fetched data
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
  onCache: (key, value) => console.log('Cache hit:', key),
  onFetch: (key, value) => console.log('Fetched fresh:', key),
})(new Octokit().rest);

// API calls are now cached
const repo = await gh.repos.get({ owner: 'snomiao', repo: 'keyv-cache-proxy' });
```

### With Notion API

```typescript
import { Client } from '@notionhq/client';
import { KeyvCacheProxy } from 'keyv-cache-proxy';
import Keyv from 'keyv';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Cache Notion API calls to reduce rate limiting
const cachedNotion = KeyvCacheProxy({
  store: new Keyv(),
  ttl: 300000, // 5 minutes
  prefix: 'notion.',
})(notion);

// These calls will be cached
const database = await cachedNotion.databases.query({
  database_id: 'your-database-id',
});

const page = await cachedNotion.pages.retrieve({
  page_id: 'your-page-id',
});
```

### With Slack API

```typescript
import { WebClient } from '@slack/web-api';
import { KeyvCacheProxy } from 'keyv-cache-proxy';
import Keyv from 'keyv';

const slack = new WebClient(process.env.SLACK_TOKEN);

// Cache Slack API calls
const cachedSlack = KeyvCacheProxy({
  store: new Keyv(),
  ttl: 600000, // 10 minutes
  prefix: 'slack.',
})(slack);

// Cached API calls
const channels = await cachedSlack.conversations.list();
const userInfo = await cachedSlack.users.info({ user: 'U123456' });
const messages = await cachedSlack.conversations.history({
  channel: 'C123456',
});
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

### Cache Observability & Data Modification

Track cache performance:

```typescript
let hits = 0;
let fetches = 0;

const cached = KeyvCacheProxy({
  store: new Keyv(),
  ttl: 60000,
  onCache: (key, value) => {
    hits++;
    console.log(`Cache hit for ${key}. Total hits: ${hits}`);
  },
  onFetch: (key, value) => {
    fetches++;
    console.log(`Fetched fresh for ${key}. Total fetches: ${fetches}`);
  },
})(myObject);
```

Modify cached/fetched data:

```typescript
const cached = KeyvCacheProxy({
  store: new Keyv(),
  ttl: 60000,
  // Add metadata to cached data (called on every invocation)
  onCache: (key, value) => {
    if (value !== undefined) {
      console.log('Returning cached data');
      return { ...value, fromCache: true, cachedAt: Date.now() };
    }
  },
  // Transform fetched data before caching
  onFetch: (key, value) => {
    console.log('Processing fresh data');
    return { ...value, fetchedAt: Date.now(), processed: true };
  },
})(myObject);
```

Force cache refresh:

```typescript
const cached = KeyvCacheProxy({
  store: new Keyv(),
  ttl: 60000,
  onCache: (key, value) => {
    // Return null to force refetch even if cached
    if (value && isStale(value)) {
      return null; // Forces cache miss and refetch
    }
    return value; // Use cached value
  },
})(myObject);
```

## API

### `KeyvCacheProxy(options)`

Creates a cache proxy factory function.

#### Options

- `store` (required): A Keyv instance for cache storage
- `ttl` (optional): Time-to-live in milliseconds for cached values
- `prefix` (optional): Prefix for cache keys (default: `""`)
- `onCache` (optional): Hook called on **every invocation** (before cache lookup). Receives cached value (or `undefined` on cache miss). Can modify the cached value or return `null` to force refetch: `(key: string, value: any) => any | null | Promise<any | null>`
- `onFetch` (optional): Hook called when data is freshly fetched (cache miss). Can modify the value before caching: `(key: string, value: any) => any | Promise<any>`

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
