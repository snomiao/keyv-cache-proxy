#!/usr/bin/env bun --watch
import { Octokit } from 'octokit'
import KeyvNedbStore from 'keyv-nedb-store'
import { KeyvCacheProxy } from '../src'
import { Keyv } from 'keyv'
const kv = new Keyv()
const gh = KeyvCacheProxy({
    store: kv,
    ttl: 600e3,
    prefix: `github.`,
    onHit: (key) => console.log(`Cache hit: ${key}`),
    onMiss: (key) => console.log(`Cache miss: ${key}`),
})(new Octokit({
    // auth
}).rest)

console.log((await gh.repos.get({ owner: 'snomiao', repo: 'snomiao' })).data.html_url)
// prints: cache miss: github.repos.get:[{"owner":"snomiao","repo":"snomiao"}]
// returns fresh result

console.log((await gh.repos.get({ owner: 'snomiao', repo: 'snomiao' })).data.html_url)
// prints: cache hit: github.repos.get:{"owner":"snomiao","repo":"snomiao"}
// returns cached result