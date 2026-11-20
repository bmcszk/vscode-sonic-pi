#!/usr/bin/env node
// init.rb quick open: the daemon evals ~/.sonic-pi/config/init.rb on boot only when the
// file exists (spider-server.rb:249-253, path from paths.rb:187-196), so the editor
// creates it once and never rewrites what the user has there.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { resolveInitPath, initialInitContent, ensureInitFile } = require('../../out/init-file.js')

const tempHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sonic-pi-init-test-'))

const tests = {
	'the init path is <home>/.sonic-pi/config/init.rb'() {
		assert.strictEqual(resolveInitPath('/home/live'), path.join('/home/live', '.sonic-pi', 'config', 'init.rb'))
	},

	'a missing init.rb is created inside a fresh config directory, with the header content'() {
		// given an empty home
		const home = tempHome()
		// when
		const result = ensureInitFile(home)
		// then
		assert.deepStrictEqual(result, { path: resolveInitPath(home), created: true })
		assert.strictEqual(fs.readFileSync(result.path, 'utf8'), initialInitContent())
	},

	'an existing init.rb is left byte-for-byte untouched'() {
		// given a config dir the user already wrote
		const home = tempHome()
		fs.mkdirSync(path.dirname(resolveInitPath(home)), { recursive: true })
		fs.writeFileSync(resolveInitPath(home), 'use_debug false\n')
		// when
		const result = ensureInitFile(home)
		// then
		assert.deepStrictEqual(result, { path: resolveInitPath(home), created: false })
		assert.strictEqual(fs.readFileSync(result.path, 'utf8'), 'use_debug false\n')
	},

	'a second call reports the already-created file instead of rewriting it'() {
		const home = tempHome()
		const first = ensureInitFile(home)
		fs.appendFileSync(first.path, 'use_bpm 90\n')
		const second = ensureInitFile(home)
		assert.strictEqual(second.created, false)
		assert.match(fs.readFileSync(second.path, 'utf8'), /use_bpm 90\n$/)
	},

	'the seeded content says when the daemon runs it and shows a commented example'() {
		const content = initialInitContent()
		assert.match(content, /init\.rb/)
		assert.match(content, /boot/i, 'names the eval-on-boot moment')
		assert.match(content, /^\s*#.*(use_bpm|use_debug|use_synth)/m, 'a commented example to uncomment')
		assert.doesNotMatch(content, /^[^#\s]/, 'every line is a comment or blank: the seed must not run anything')
	},
}

let failures = 0
const names = Object.keys(tests)

async function run() {
	for (const name of names) {
		try {
			await tests[name]()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.message}`)
		}
	}
	console.log(failures === 0 ? 'all init-file tests passed' : `${failures} of ${names.length} tests failed`)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
