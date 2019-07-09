'use strict';

const {finished, pipeline, Readable} = require('stream');
const {join} = require('path');
const {promisify} = require('util');
const {randomBytes} = require('crypto');

const brokenNpmPath = require('broken-npm-path');
const clearModule = require('clear-module');
const pathKey = require('path-key');
const rmfr = require('rmfr');
const test = require('tape');

const promisifiedRandomBytes = promisify(randomBytes);
const tmp = join(__dirname, 'tmp');

process.env.npm_config_cache = tmp;

test('npcache', async t => {
	const npcache = require('.');

	await rmfr(tmp);

	const [key, anotherKey] = await Promise.all([
		(async () => (await promisifiedRandomBytes(256)).toString('hex'))(),
		(async () => (await promisifiedRandomBytes(256)).toString('hex'))(),
		npcache.rm.all()
	]);

	t.equal(
		(await npcache.put(key, Buffer.from('Hello, npcache!'), {algorithms: ['sha512']})).sha512[0].algorithm,
		'sha512',
		'should support cacache options.'
	);

	for await (const cache of npcache.ls.stream()) {
		t.equal(cache.key, key, 'should read a cache.');

		for await (const buffer of npcache.get.stream.byDigest(cache.integrity)) {
			t.ok(
				buffer.equals(Buffer.from('Hello, npcache!')),
				'should support stream API.'
			);
		}
	}

	await promisify(pipeline)(new Readable({
		read() {
			this.push('Hi, cacache!');
			this.push(null);
		}
	}), npcache.put.stream(anotherKey, {
		metadata: {
			meta: 'data exists'
		}
	}));

	let metadata;
	let integrity;
	const stream = npcache.get.stream(anotherKey)
	.once('metadata', value => {
		metadata = value;
	})
	.once('integrity', value => {
		integrity = value;
	});

	for await (const buffer of stream) {
		t.ok(
			buffer.equals(Buffer.from('Hi, cacache!')),
			'should write a cache.'
		);
	}

	t.deepEqual(
		metadata,
		{meta: 'data exists'},
		'should emit a `metadata` event.'
	);

	t.ok(
		typeof integrity === 'string',
		'should emit an `integrity` event.'
	);

	t.end();
});

test('npcache with a non-directory npm cache path', async t => {
	clearModule('.');
	process.env.npm_config_cache = __filename;

	try {
		await require('.').verify.lastRun();
		t.fail('Unexpectedly succeeded.');
	} catch ({message}) {
		t.equal(
			message,
			`The current npm CLI setting indicates ${
				join(__filename, '_cacache')
			} is used as a cache directory for npm packages, but a file exists at its parent path ${__filename}.`,
			'should fail to call any methods.'
		);
	}

	t.end();
});

test('npcache with a broken npm CLI', async t => {
	clearModule.all();
	process.env.npm_config_cache = tmp;
	process.env.npm_execpath = brokenNpmPath;

	try {
		await require('.').clearMemoized();
		t.fail('Unexpectedly succeeded.');
	} catch ({message}) {
		t.equal(
			message,
			'\'cacache\' module is not bundled in your npm CLI. Run the command ' +
			'`npm install --global npm` to reinstall a valid npm CLI.',
			'should fail to call any methods.'
		);
	}

	t.end();
});

test('npcache with no globally installed npm CLI', async t => {
	clearModule.all();

	process.env[pathKey()] = `${__filename}0123456789`;
	delete process.env.npm_execpath;

	try {
		await require('.').get.info();
		t.fail('Unexpectedly succeeded.');
	} catch ({code}) {
		t.ok(/^1|ENOENT$/u.test(code), 'should fail to call any methods.');
	}

	t.end();
});

test('npcache with a broken npm cache path', async t => {
	clearModule.all();

	delete process.env.npm_config_cache;

	try {
		await promisify(finished)(require('.').put.stream());
		t.fail('Unexpectedly succeeded.');
	} catch ({code}) {
		t.ok(/^1|ENOENT$/u.test(code), 'should fail to call any methods.');
	}

	t.end();
});
