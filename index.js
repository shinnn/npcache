'use strict';

const {join} = require('path');
const {Readable, Writable} = require('stream');
const {stat} = require('fs').promises;

const npmCachePath = require('npm-cache-path');
const rejectUnsatisfiedNpmVersion = require('reject-unsatisfied-npm-version');
const resolveFromNpm = require('resolve-from-npm');

const MINIMUM_REQUIRED_NPM_VERSION = '6.9.0';
const MODULE_NAME = 'cacache';
const STREAM_EVENTS = new Set(['error', 'integrity', 'metadata']);
const readableAsyncIterator = Readable.prototype[Symbol.asyncIterator];
let promiseCache;

class NpcachePutStream extends Writable {
	#promise;

	constructor(...args) {
		super();

		this.cork();
		this.#promise = (async () => {
			try {
				const [cacache, cachePath] = await prepare();
				this.internalStream = cacache.put.stream(cachePath, ...args);
				this.uncork();
			} catch (err) {
				this.destroy(err);
			}
		})();
	}

	_write(chunk, encoding, cb) {
		this.internalStream.write(chunk, encoding, cb);
	}

	async _final(cb) {
		await this.#promise;
		this.internalStream.end(cb);
	}
}

async function prepare() {
	if (promiseCache) {
		return promiseCache;
	}

	let error;

	const results = await Promise.all([
		(async () => {
			try {
				return require(await resolveFromNpm(MODULE_NAME));
			} catch (err) {
				if (err.code === 'MODULE_NOT_FOUND') {
					err.message = `'${
						MODULE_NAME
					}' module is not bundled in your npm CLI. Run the command \`npm install --global npm\` to reinstall a valid npm CLI.`;
				}

				error = err;
				return null;
			}
		})(),
		(async () => {
			let parentDir;

			try {
				parentDir = await npmCachePath();
			} catch (err) {
				error = err;
				return null;
			}

			const cachePath = join(parentDir, '_cacache');

			await Promise.all([
				{
					path: cachePath,
					place: 'there'
				},
				{
					path: parentDir,
					place: `at its parent path ${parentDir}`
				}
			].map(async ({path, place}) => {
				let isFile;

				try {
					isFile = (await stat(parentDir)).isFile();
				} catch {
					return;
				}

				if (isFile) {
					const enotdirError = new Error(`The current npm CLI setting indicates ${cachePath} is used as a cache directory for npm packages, but a file exists ${place}.`);

					enotdirError.code = 'ENOTDIR';
					enotdirError.path = path;
					error = enotdirError;
				}
			}));

			return cachePath;
		})(),
		rejectUnsatisfiedNpmVersion(MINIMUM_REQUIRED_NPM_VERSION)
	]);

	if (error) {
		throw error;
	}

	promiseCache = results;
	return results;
}

function toAsyncIterable(stream) {
	if (stream.constructor.prototype[Symbol.asyncIterator] === undefined) {
		stream.constructor.prototype[Symbol.asyncIterator] = readableAsyncIterator;
	}

	return stream;
}

exports.rm = {};
exports.tmp = {};

for (const method of [
	'ls',
	['ls', 'stream'],
	'get',
	['get', 'byDigest'],
	['get', 'stream'],
	['get', 'info'],
	['get', 'hasContent'],
	'put',
	['put', 'stream'],
	['rm', 'all'],
	['rm', 'entry'],
	['rm', 'content'],
	'clearMemoized',
	['tmp', 'mkdir'],
	['tmp', 'fix'],
	['tmp', 'withTmp'],
	'verify',
	['verify', 'lastRun']
]) {
	if (Array.isArray(method)) {
		if (method[1] === 'stream') {
			if (method[0] === 'put') {
				exports.put.stream = (...args) => new NpcachePutStream(...args);
			} else {
				exports[method[0]][method[1]] = (...args) => {
					const stream = Readable.from((async function *() {
						const [cacache, cachePath] = await prepare();
						const internalStream = toAsyncIterable(cacache[method[0]][method[1]](cachePath, ...args));

						for (const eventName of STREAM_EVENTS) {
							internalStream.once(eventName, value => stream.emit(eventName, value));
						}

						yield *internalStream;
					})());

					return stream;
				};
			}
		} else {
			exports[method[0]][method[1]] = async (...args) => {
				const [cacache, cachePath] = await prepare();
				return cacache[method[0]][method[1]](cachePath, ...args);
			};
		}

		continue;
	}

	exports[method] = async (...args) => {
		const [cacache, cachePath] = await prepare();
		return cacache[method](cachePath, ...args);
	};
}

exports.get.stream.byDigest = (...args) => Readable.from((async function *() {
	const [cacache, cachePath] = await prepare();

	yield *toAsyncIterable(cacache.get.stream.byDigest(cachePath, ...args));
})());

Object.defineProperty(exports, 'MINIMUM_REQUIRED_NPM_VERSION', {
	enumerable: true,
	value: MINIMUM_REQUIRED_NPM_VERSION
});
