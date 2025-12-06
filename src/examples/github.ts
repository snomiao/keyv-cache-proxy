#!/usr/bin/env bun --watch
/**
 * Example: Caching GitHub API requests with KeyvCacheProxy
 * This example demonstrates how to use KeyvCacheProxy to cache GitHub API requests made using the Octokit library.
 * It caches the results of API calls in a Keyv store to reduce redundant network requests and improve performance.
 *
 * run this example with `bun src/examples/github.ts`
 */

import { Keyv } from "keyv";
import { Octokit } from "octokit";
import KeyvCacheProxy from "../index";

const kv = new Keyv({ ttl: 600e3 }); // 10 minutes TTL
const gh = KeyvCacheProxy({
  store: kv,
  prefix: `github.`,
  onCached: (key: string, value: any) => {
    if (value !== undefined) {
      console.log(`Cache hit: ${key}`);
    }
    return undefined; // Use cached value as-is
  },
  onFetched: (key: string) => {
    console.log(`Cache miss (fetching): ${key}`);
    return undefined; // Cache the original value
  },
})(
  new Octokit({
    // auth
  }).rest,
);

console.log((await gh.repos.get({ owner: "snomiao", repo: "snomiao" })).data.html_url);
// prints: cache miss (fetching): github.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
// returns fresh result

console.log((await gh.repos.get({ owner: "snomiao", repo: "snomiao" })).data.html_url);
// prints: cache hit: github.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
// returns cached result
