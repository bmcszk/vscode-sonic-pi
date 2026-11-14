#!/usr/bin/env node
// Regression: a freshly constructed OscSender must deliver its FIRST message. osc-js's send-only
// plugin used to open on the library default (host 'localhost', port 41234) and drop a send
// issued before that bind finished, so the first run after a cold-window boot vanished while
// every later send worked.
const assert = require('assert')
const dgram = require('dgram')
const OSC = require('osc-js')
const { OscSender } = require('../../out/source-runner/oscsender.js')

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
	async 'the first message sent right after construction arrives'() {
		const receiver = await listen()
		try {
			const sender = new OscSender(receiver.port)
			sender.send(new OSC.Message('/first-send', 1, 'play :c4'))
			const deadline = Date.now() + 2000
			while (receiver.received.length === 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 10))
			}
			assert.strictEqual(receiver.received.length, 1, 'the first datagram was dropped')
			assert.ok(
				receiver.received[0].toString('utf8').startsWith('/first-send\0'),
				'the datagram carries the message address',
			)
		} finally {
			receiver.close()
		}
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
			? 'all oscsender tests passed'
			: `${failures} of ${Object.entries(tests).length} tests failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
