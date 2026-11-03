#!/usr/bin/env node
// Live protocol gate: boots a real Sonic Pi daemon and drives it over the same OSC seam the
// extension uses (parse the daemon stdout line, then run and stop over that token).
// Exit code 0 = the daemon accepted both /run-code and /stop-all-jobs for the parsed token.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const child_process = require('child_process')
const OSC = require('osc-js')
const { parseDaemonStdout } = require('../../out/source-runner/daemonstdout.js')

const DAEMON_PATH = '/usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb'
const SPIDER_LOG_PATH = path.join(os.homedir(), '.sonic-pi', 'log', 'spider.log')
const PING_INTERVAL_MS = 250
const READY_TIMEOUT_MS = 30000
const LOG_TIMEOUT_MS = 15000
const DAEMON_EXIT_TIMEOUT_MS = 10000

async function main() {
	const spiderLogStart = fs.statSync(SPIDER_LOG_PATH).size
	const daemon = child_process.spawn('ruby', [DAEMON_PATH], { stdio: ['ignore', 'pipe', 'pipe'] })
	daemon.stderr.on('data', (data) => process.stderr.write(`daemon stderr: ${data}`))

	try {
		const ports = await readDaemonPorts(daemon)
		console.log(`daemon stdout: ${JSON.stringify(ports)}`)

		const gui = openGuiListener(ports.guiListenToServerPort)
		const sender = openSender(ports.serverSendToGuiPort)
		try {
			await waitForSpiderReady(gui, sender, ports.token)
			const jobId = await runCode(gui, sender, ports.token, 'play :E4')
			console.log(`run accepted: job ${jobId}`)
			await stopAllJobs(gui, sender, ports.token)
			console.log('stop accepted: "Stopping all runs..."')

			const spiderLog = spiderLogSince(spiderLogStart)
			console.log('--- spider.log since spawn ---')
			console.log(spiderLog)
			assertNoRejection(spiderLog)
			console.log(`gate green: run ${jobId} and stop-all-jobs accepted on the live daemon`)
		} finally {
			gui.close()
			sender.close()
		}
	} finally {
		await stopDaemon(daemon)
	}
}

// The daemon prints its ports line before the line is complete in a chunk, so only a
// newline-terminated line is parsed - a truncated tail would parse as a wrong token.
function readDaemonPorts(daemon) {
	return new Promise((resolve, reject) => {
		let received = ''
		const timeout = setTimeout(
			() => reject(new Error(`daemon printed no ports line within ${READY_TIMEOUT_MS}ms`)),
			READY_TIMEOUT_MS,
		)
		daemon.stdout.on('data', (data) => {
			received += data.toString()
			const newline = received.indexOf('\n')
			if (newline === -1) {
				return
			}
			const line = received.substring(0, newline)
			const ports = parseDaemonStdout(line)
			if (!ports) {
				clearTimeout(timeout)
				reject(new Error(`daemon stdout line is not a ports line: ${JSON.stringify(line)}`))
				return
			}
			clearTimeout(timeout)
			resolve(ports)
		})
		daemon.on('exit', (code) => reject(new Error(`daemon exited with ${code} before reporting its ports`)))
	})
}

function openGuiListener(port) {
	const osc = new OSC({ plugin: new OSC.DatagramPlugin({ open: { port, host: '127.0.0.1' } }) })
	osc.open()

	const received = []
	const pending = []

	osc.on('*', (message) => {
		received.push(message)
		console.log(`gui <- ${message.address} ${JSON.stringify(message.args)}`)
		pending.slice().forEach((notify) => notify())
	})

	function forget(waiter) {
		const index = pending.indexOf(waiter)
		if (index !== -1) {
			pending.splice(index, 1)
		}
	}

	function waitFor(matches, timeoutMs, description) {
		return new Promise((resolve, reject) => {
			const deadline = setTimeout(() => {
				forget(check)
				reject(new Error(`timed out after ${timeoutMs}ms waiting for ${description}`))
			}, timeoutMs)
			const check = () => {
				const match = received.find(matches)
				if (!match) {
					return
				}
				clearTimeout(deadline)
				forget(check)
				resolve(match)
			}
			pending.push(check)
			check()
		})
	}

	return {
		waitForAddress(address, timeoutMs) {
			return waitFor((message) => message.address === address, timeoutMs, address)
		},
		waitForInfo(pattern, timeoutMs, description) {
			return waitFor(
				(message) => message.address === '/log/info' && pattern.test(message.args[1] || ''),
				timeoutMs,
				description,
			)
		},
		close() {
			osc.close()
		},
	}
}

function openSender(port) {
	const osc = new OSC({ plugin: new OSC.DatagramPlugin({ send: { port, host: '127.0.0.1' } }) })
	osc.open()
	return {
		send(address, ...args) {
			osc.send(new OSC.Message(address, ...args))
		},
		close() {
			osc.close()
		},
	}
}

function waitForSpiderReady(gui, sender, token) {
	const acked = gui.waitForAddress('/ack', READY_TIMEOUT_MS)
	const ping = setInterval(() => sender.send('/ping', token, 'e2e'), PING_INTERVAL_MS)
	sender.send('/ping', token, 'e2e')
	return acked.finally(() => clearInterval(ping))
}

async function runCode(gui, sender, token, code) {
	sender.send('/run-code', token, code)
	const started = await gui.waitForInfo(/^Starting run \d+$/, LOG_TIMEOUT_MS, `acceptance of ${code}`)
	return Number(/^Starting run (\d+)$/.exec(started.args[1])[1])
}

async function stopAllJobs(gui, sender, token) {
	sender.send('/stop-all-jobs', token)
	await gui.waitForInfo(/^Stopping all runs\.\.\.$/, LOG_TIMEOUT_MS, 'acceptance of /stop-all-jobs')
}

function spiderLogSince(offset) {
	return fs.readFileSync(SPIDER_LOG_PATH).subarray(offset).toString()
}

function assertNoRejection(spiderLog) {
	assert.ok(
		!spiderLog.includes('Invalid token'),
		`the daemon rejected the parsed token:\n${spiderLog}`,
	)
	assert.ok(
		!spiderLog.includes('Spider - Exception'),
		`the spider raised while serving the run:\n${spiderLog}`,
	)
}

function stopDaemon(daemon) {
	return new Promise((resolve) => {
		if (daemon.exitCode !== null || daemon.signalCode !== null) {
			resolve()
			return
		}
		const forced = setTimeout(() => daemon.kill('SIGKILL'), DAEMON_EXIT_TIMEOUT_MS)
		daemon.on('exit', () => {
			clearTimeout(forced)
			resolve()
		})
		daemon.kill('SIGTERM')
	})
}

main().then(
	() => process.exit(0),
	(error) => {
		console.log(`not ok - ${error.message}`)
		process.exit(1)
	},
)
