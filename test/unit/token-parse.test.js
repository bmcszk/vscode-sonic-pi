#!/usr/bin/env node
// Token parsing of the daemon's stdout line. Exit code 0 = all pass.
const assert = require('assert')
const {
	parseDaemonStdout,
	resolveOscCuesPort,
} = require('../../out/source-runner/daemonstdout.js')

const tests = {
	'parses the 6-value Sonic Pi 5.x line, token is the last value'() {
		const ports = parseDaemonStdout('38880 38877 38876 38878 4560 1411627710')
		assert.strictEqual(ports.token, 1411627710)
		assert.strictEqual(ports.daemonPort, 38880)
		assert.strictEqual(ports.guiListenToServerPort, 38877)
		assert.strictEqual(ports.serverSendToGuiPort, 38876)
	},

	'still parses the 8-value Sonic Pi 4.x line'() {
		const ports = parseDaemonStdout('11111 22222 33333 44444 55555 66666 77777 1411627710')
		assert.strictEqual(ports.token, 1411627710)
	},

	'parses a negative token'() {
		const ports = parseDaemonStdout('38880 38877 38876 38878 4560 -2000447764')
		assert.strictEqual(ports.token, -2000447764)
	},

	'parses a line with Windows line ending'() {
		const ports = parseDaemonStdout('38880 38877 38876 38878 4560 1411627710\r\n')
		assert.strictEqual(ports.token, 1411627710)
	},

	'rejects a line whose last value is not a number'() {
		assert.strictEqual(parseDaemonStdout('1 2 3 4 5 not-a-number'), null)
	},

	'returns oscCuesPort for the 6-value Sonic Pi 5.x line'() {
		const ports = parseDaemonStdout('38880 38877 38876 38878 4562 1411627710')
		assert.strictEqual(ports.oscCuesPort, 4562)
	},

	'returns oscCuesPort for the 8-value Sonic Pi 4.x line'() {
		const ports = parseDaemonStdout('11111 22222 33333 44444 55555 66666 77777 1411627710')
		assert.strictEqual(ports.oscCuesPort, 55555)
	},

	'setting override wins over the parsed port'() {
		assert.strictEqual(resolveOscCuesPort(4999, 4562), 4999)
	},

	'parsed port is used when the override is 0'() {
		assert.strictEqual(resolveOscCuesPort(0, 4562), 4562)
	},

	'negative override falls back to the parsed port'() {
		assert.strictEqual(resolveOscCuesPort(-1, 4562), 4562)
	},

	'-1 sentinel is returned when neither override nor parsed port is available'() {
		assert.strictEqual(resolveOscCuesPort(0, -1), -1)
	},

	'rejects an empty line'() {
		assert.strictEqual(parseDaemonStdout(''), null)
	},
}

let failures = 0
for (const [name, test] of Object.entries(tests)) {
	try {
		test()
		console.log(`ok - ${name}`)
	} catch (error) {
		failures++
		console.log(`not ok - ${name}`)
		console.log(`  ${error.message}`)
	}
}

console.log(
	failures === 0
		? 'all token parse tests passed'
		: `${failures} of ${Object.keys(tests).length} tests failed`,
)
process.exit(failures === 0 ? 0 : 1)
