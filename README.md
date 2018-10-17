# npcache

[![npm version](https://img.shields.io/npm/v/npcache.svg)](https://www.npmjs.com/package/npcache)
[![Build Status](https://travis-ci.com/shinnn/npcache.svg?branch=master)](https://travis-ci.com/shinnn/npcache)
[![Coverage Status](https://img.shields.io/coveralls/shinnn/npcache.svg)](https://coveralls.io/github/shinnn/npcache?branch=master)

Manipulate cache of npm packages

```javascript
const npcache = require('npcache');

(async () => {
  const cache = await npcache.get('make-fetch-happen:request-cache:https://registry.npmjs.org/glob');

  cache.metadata; //=> {url: 'https://registry.npmjs.org/glob', ...}
  cache.data; //=> <Buffer 7b 22 76 65 72 73 69 6f 6e 73 22 3a 7b 22 ...>
  cache.size; //=> 37086  
  cache.integrity; //=> 'sha512-Non1RHdlmK+8lJaN1a88N ...'
})();
```

## Installation

[Use](https://docs.npmjs.com/cli/install) [npm](https://docs.npmjs.com/getting-started/what-is-npm).

```
npm install npcache
```

## API

```javascript
const npcache = require('npcache');
```

### npcache

The API is based on [cacache](https://github.com/zkat/cacache), a cache manipulation library used inside [npm CLI](https://github.com/npm/cli).

Note the following differences:

* Original `cache` parameters are omitted, and it defaults to [`_cacache` in the npm cache directory](https://docs.npmjs.com/cli/cache#details).
* Method aliases, for example `cacache.rm.entry` → `cacache.rm`, are removed.
* Every method returns a `Promise`, even if a corresponding original method doesn't.
  * If an original `cacache.*` method returns a `Stream`, `npcache.*` returns a `Promise<Stream>`.
  * If an original `cacache.*` method returns nothing, `npcache.*` returns a `Promise<undefined>`.
* [`setLocale`](https://github.com/zkat/cacache#--cacachesetlocalelocale) method is not supported.

```javascript
(async () => {
  for await (const {path} of await npcache.ls.stream()) {
    console.log(path);
  }
})();
```

```
/Users/shinnn/.npm/_cacache/content-v2/sha512/a6/12/5f41506e689339ada ...
/Users/shinnn/.npm/_cacache/content-v2/sha512/ff/1a/f50039b96e74e38cd ...
/Users/shinnn/.npm/_cacache/content-v2/sha512/0b/61/241d7c17bcbb1baee ...
/Users/shinnn/.npm/_cacache/content-v2/sha512/39/a5/358478e025ff9bd0d ...
...
```

## License

[ISC License](./LICENSE) © 2018 Shinnosuke Watanabe
