#!/usr/bin/env bun --watch
import { Keyv } from "keyv";
import { Octokit } from "octokit";
import { KeyvCacheProxy } from "../index";

const kv = new Keyv();
const gh = KeyvCacheProxy({
	store: kv,
	ttl: 600e3,
	prefix: `github.`,
	onHit: (key: string) => console.log(`Cache hit: ${key}`),
	onMiss: (key: string) => console.log(`Cache miss: ${key}`),
})(
	new Octokit({
		// auth
	}).rest,
);

console.log(
	(await gh.repos.get({ owner: "snomiao", repo: "snomiao" })).data.html_url,
);
// prints: cache miss: github.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
// returns fresh result

console.log(
	(await gh.repos.get({ owner: "snomiao", repo: "snomiao" })).data.html_url,
);
// prints: cache hit: github.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
// returns cached result
 