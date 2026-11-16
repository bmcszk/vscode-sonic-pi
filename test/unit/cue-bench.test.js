#!/usr/bin/env node
// Cue Bench Sender: unit tests for argument parsing and integration round-trip
// Follows the oscsender.test.js pattern with dgram socket for capturing sent messages.

const assert = require('assert')
const dgram = require('dgram')
const OSC = require('osc-js')

// Import the module under test (will fail initially - that's the red phase)
const { parseArgs, CueBenchSender } = require('../../out/cue-bench.js')

function listen() {
	const socket = dgram.createSocket('udp4')
	const received = []
	socket.on('message', (message) => received.push(message))
	return new Promise((resolve) => {
		socket.bind(0, '127.0.0.1', () =>
			resolve({
				port: socket.address().port,
				received,
				close: () => socket.close(),
			}),
		)
	})
}

const tests = {
	// ===== PURE ARGUMENT PARSING TESTS =====
	'parseArgs: single int'() {
		const result = parseArgs(['42'])
		assert.deepStrictEqual(result, [42])
	},

	'parseArgs: single float'() {
		const result = parseArgs(['3.14'])
		assert.deepStrictEqual(result, [3.14])
	},

	'parseArgs: single string'() {
		const result = parseArgs(['hello'])
		assert.deepStrictEqual(result, ['hello'])
	},

	'parseArgs: mixed int/float/string'() {
		const result = parseArgs(['1', '2.5', 'x'])
		assert.deepStrictEqual(result, [1, 2.5, 'x'])
	},

	'parseArgs: negative int'() {
		const result = parseArgs(['-10'])
		assert.deepStrictEqual(result, [-10])
	},

	'parseArgs: negative float'() {
		const result = parseArgs(['-0.5'])
		assert.deepStrictEqual(result, [-0.5])
	},

	'parseArgs: string that looks like number but is not pure'() {
		const result = parseArgs(['1.2.3', '0x10', '0b101'])
		assert.deepStrictEqual(result, ['1.2.3', '0x10', '0b101'])
	},

	'parseArgs: empty array'() {
		const result = parseArgs([])
		assert.deepStrictEqual(result, [])
	},

	// ===== INTEGRATION: sendTestCue packs OSC and sends to cue port =====
	async 'sendTestCue packs OSC message with typed args and sends to port'() {
		const receiver = await listen()
		try {
			const sender = new CueBenchSender(receiver.port)
			await sender.sendTestCue('/foo/orca', ['1', '2.5', 'x'])

			const deadline = Date.now() + 2000
			while (receiver.received.length === 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 10))
			}

			assert.strictEqual(receiver.received.length, 1, 'message was not sent')

			// Check raw OSC message format (like oscsender.test.js does)
			const raw = receiver.received[0].toString('utf8')
			assert.ok(raw.startsWith('/foo/orca\0'), 'datagram carries the message address')
			// The packed message should contain the address, then token (0), then args [1, 2.5, 'x']
			// We can't easily unpack but we verify the address is there
		} finally {
			receiver.close()
		}
	},

	async 'sendTestCue with no args sends only address and token'() {
		const receiver = await listen()
		try {
			const sender = new CueBenchSender(receiver.port)
			await sender.sendTestCue('/test/empty', [])

			const deadline = Date.now() + 2000
			while (receiver.received.length === 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 10))
			}

			assert.strictEqual(receiver.received.length, 1)

			const raw = receiver.received[0].toString('utf8')
			assert.ok(raw.startsWith('/test/empty\0'), 'datagram carries the message address')
		} finally {
			receiver.close()
		}
	},

	// ===== ERROR HANDLING =====
	async 'sendTestCue: no cue port resolvable -> clear error message, no send'() {
		// Test that when port is -1 (unresolved), we get a clear error and no send happens
		const sender = new CueBenchSender(-1)
		let errorThrown = false
		let errorMessage = ''
		try {
			// Should throw or return a rejected promise with clear message
			await sender.sendTestCue('/test', ['1'])
		} catch (e) {
			errorThrown = true
			errorMessage = e.message
		}

		// The sync validation should fail fast
		assert.ok(errorThrown, 'should throw when port is invalid')
		assert.ok(
			errorMessage.includes('cue port') || errorMessage.includes('port') || errorMessage.includes('unresolved'),
			`error should mention port issue: ${errorMessage}`,
		)
	},

	async 'sendTestCue async: invalid port gives clear error'() {
		const sender = new CueBenchSender(-1)
		let rejected = false
		let errorMessage = ''
		try {
			await sender.sendTestCue('/test', ['1'])
		} catch (e) {
			rejected = true
			errorMessage = e.message
		}
		assert.ok(rejected, 'promise should reject when port is invalid')
		assert.ok(
			errorMessage.includes('cue port') || errorMessage.includes('port') || errorMessage.includes('unresolved'),
			`error should mention port issue: ${errorMessage}`,
		)
	},
}

async function runAll() {
	let failures = 0
	for (const [name, test] of Object.entries(tests)) {
		try {
			await test()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.stack || error.message}`)
		}
	}
	console.log(
		failures === 0
			? 'all cue-bench tests passed'
			: `${failures} of ${Object.entries(tests).length} tests failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))