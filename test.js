'use strict';

process.env.npm_config_cache = __dirname; // eslint-disable-line camelcase

const {finished, Readable} = require('stream');
const {promisify} = require('util');
const {randomBytes} = require('crypto');

const brokenNpmPath = require('broken-npm-path');
const clearModule = require('clear-module');
const pathKey = require('path-key');
const test = require('tape');

test('npcache', async t => {
	const npcache = require('.');

	const [key] = await Promise.all([
		(async () => (await promisify(randomBytes)(256)).toString('hex'))(),
		npcache.rm.all()
	]);

	t.equal(
		(await npcache.put(key, Buffer.from('Hello, npcache!'), {algorithm: 'sha512'})).sha512[0].algorithm,
		'sha512',
		'should write a cache.'
	);

	for await (const cache of await npcache.ls.stream()) {
		t.equal(cache.key, key, 'should read a cache.');

		for await (const buffer of await npcache.get.stream.byDigest(cache.integrity)) {
			t.ok(
				buffer.equals(Buffer.from('Hello, npcache!')),
				'should support stream API.'
			);
		}
	}

	t.end();
});

test('npcache with an environment where async iteration is not implemented', async t => {
	clearModule('.');
	delete Readable.prototype[Symbol.asyncIterator];

	const npcache = require('.');

	try {
		await promisify(finished)(await npcache.get.stream.byDigest('base64-+123456789=='));
		t.fail('Unexpectedly succeeded.');
	} catch ({message}) {
		t.ok(
			message.startsWith('ENOENT: no such file or directory'),
			'should still support stream API.'
		);
	}

	t.end();
});

test('npcache with a broken npm CLI', async t => {
	clearModule.all();
	process.env.npm_execpath = brokenNpmPath; // eslint-disable-line camelcase

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
		await require('.').verify();
		t.fail('Unexpectedly succeeded.');
	} catch ({code}) {
		t.ok(/^1|ENOENT$/u.test(code), 'should fail to call any methods.');
	}

	t.end();
});
