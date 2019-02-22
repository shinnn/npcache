'use strict';

const {join} = require('path');
const {promisify} = require('util');
const readableAsyncIterator = require('stream').Readable.prototype[Symbol.asyncIterator];
const {stat} = require('fs');

const npmCachePath = require('npm-cache-path');
const rejectUnsatisfiedNpmVersion = require('reject-unsatisfied-npm-version');
const resolveFromNpm = require('resolve-from-npm');

const MINIMUM_REQUIRED_NPM_VERSION = '5.6.0';
const MODULE_NAME = 'cacache';
const promisifiedStat = promisify(stat);
let promiseCache;

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
					isFile = (await promisifiedStat(parentDir)).isFile();
				} catch (_) {
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

module.exports = {
	rm: {},
	tmp: {}
};

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
		if (readableAsyncIterator && method[1] === 'stream' && method[0] !== 'put') {
			module.exports[method[0]][method[1]] = async (...args) => {
				const [cacache, cachePath] = await prepare();
				return toAsyncIterable(cacache[method[0]][method[1]](cachePath, ...args));
			};

			continue;
		}

		module.exports[method[0]][method[1]] = async (...args) => {
			const [cacache, cachePath] = await prepare();
			return cacache[method[0]][method[1]](cachePath, ...args);
		};

		continue;
	}

	module.exports[method] = async (...args) => {
		const [cacache, cachePath] = await prepare();
		return cacache[method](cachePath, ...args);
	};
}

module.exports.get.stream.byDigest = async (...args) => {
	const [cacache, cachePath] = await prepare();
	return toAsyncIterable(cacache.get.stream.byDigest(cachePath, ...args));
};

Object.defineProperty(module.exports, 'MINIMUM_REQUIRED_NPM_VERSION', {
	value: MINIMUM_REQUIRED_NPM_VERSION,
	enumerable: true
});
