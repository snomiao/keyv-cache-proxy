# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.1.2](https://github.com/snomiao/keyv-cache-proxy/compare/v0.1.1...v0.1.2) (2025-12-06)


### Bug Fixes

* remove unused hot parameter and fix typo in JSDoc ([e28d100](https://github.com/snomiao/keyv-cache-proxy/commit/e28d1000f707a276dff7fabd83bbbb0352fbd390))

### [0.1.1](https://github.com/snomiao/keyv-cache-proxy/compare/v0.1.0...v0.1.1) (2025-12-06)

## [0.1.0](https://github.com/snomiao/keyv-cache-proxy/compare/v0.0.12...v0.1.0) (2025-12-06)


### ⚠ BREAKING CHANGES

* onCache hook behavior changed
- onCache is now called on EVERY method invocation (not just cache hits)
- Receives cached value or undefined on cache miss
- Can return null to force cache miss and refetch
- Can modify cached value before returning

New features:
- Added 69 comprehensive tests covering all functionality
- Added test for forcing cache refresh with null return
- Added biome.json configuration
- Updated all examples to reflect new hook behavior

Updated:
- README.md with new hook behavior and examples
- src/index.ts with new hook implementation and JSDoc examples
- src/examples/github.ts to use new hook API
- All tests updated to match new behavior

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>

### Features

* update onCache hook to be called on every invocation and add comprehensive tests ([ced194c](https://github.com/snomiao/keyv-cache-proxy/commit/ced194c3f35a6233b778b5508249bf61ec469d7b))

### [0.0.12](https://github.com/snomiao/keyv-cache-proxy/compare/v0.0.11...v0.0.12) (2025-12-06)


### Features

* **index.ts:** add hot option to KeyvCacheProxy and implement globalThisCached utility function for caching asynchronous computations ([8467078](https://github.com/snomiao/keyv-cache-proxy/commit/84670784f2804df74554e55b21752db418f1ef82))

### [0.0.11](https://github.com/snomiao/keyv-cache-proxy/compare/v0.0.10...v0.0.11) (2025-12-06)

### [0.0.10](https://github.com/snomiao/keyv-cache-proxy/compare/v0.0.9...v0.0.10) (2025-12-06)

### [0.0.9](https://github.com/snomiao/keyv-cache-proxy/compare/v0.0.8...v0.0.9) (2025-12-06)

### [0.0.8](https://github.com/snomiao/keyv-cache-proxy/compare/v0.0.7...v0.0.8) (2025-12-06)

### [0.0.7](https://github.com/snomiao/keyv-cache-proxy/compare/v0.0.6...v0.0.7) (2025-12-06)

### [0.0.6](https://github.com/snomiao/keyv-cache-proxy/compare/v0.0.5...v0.0.6) (2025-12-06)


### Bug Fixes

* TypeScript types and code formatting ([3159d54](https://github.com/snomiao/keyv-cache-proxy/commit/3159d5447e258c42d3b61c6c134ee1cbde93644c))

### 0.0.5 (2025-12-06)
