// Fake Sonic Pi daemon for the integration suites. The extension boots it through its own
// settings seam (ruby.interpreter.commandPath -> node, sonicPiRootDirectory -> the generated
// root whose server/ruby/bin/daemon.rb requires this file), so it must speak the daemon's
// public contract and nothing more:
//   * one stdout line of ports (daemon-keep-alive gui-listen-to-server gui-send-to-server
//     scsynth osc-cues token) - a second line would abort the extension's server start;
//   * a booter log under $HOME/.sonic-pi/log/daemon.log carrying the takeover route
//     ("Selected ports: {... "daemon" => N ...}" + "Token: T");
//   * OSC replies the extension listens for on the gui-listen port (/log/info Starting run N,
//     /log/info Completed run N, /flash, /version, /buffer/replace).
// Everything it receives is appended to <SONIC_PI_FAKE_DIR>/events.ndjson so the host-side
// suites can assert on the wire without a live Sonic Pi. Per-boot behaviour comes from
// <SONIC_PI_FAKE_DIR>/spec.json (fixed ports, held runs, token) which the suites rewrite
// before every boot they trigger deliberately.

const dgram = require('dgram')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { encodeMessage, decodeMessage } = require('./harness/osc')

const controlDir = process.env.SONIC_PI_FAKE_DIR
if (!controlDir) {
	console.error('SONIC_PI_FAKE_DIR is required')
	process.exit(2)
}

const specPath = path.join(controlDir, 'spec.json')
const eventsPath = path.join(controlDir, 'events.ndjson')

const spec = readSpec()
const bootId = spec.bootId ?? 0
const guiUuid = spec.token ?? -1000000 - Math.floor(Math.random() * 900000)
const holdRuns = spec.holdRuns === true
const completeDelayMs = spec.completeDelayMs ?? 10

let sendPort = 0
let guiListenPort = 0
let runId = 0

function readSpec() {
	try {
		return JSON.parse(fs.readFileSync(specPath, 'utf8'))
	} catch {
		return {}
	}
}

function record(entry) {
	fs.appendFileSync(eventsPath, JSON.stringify({ pid: process.pid, bootId, ...entry }) + '\n')
}

function freePort() {
	const socket = dgram.createSocket('udp4')
	const port = new Promise((resolve) => socket.bind(0, '127.0.0.1', () => resolve(socket.address().port)))
	return port.then((value) => {
		socket.close()
		return value
	})
}

function bind(socket, port) {
	return new Promise((resolve, reject) => {
		socket.once('error', reject)
		socket.bind(port, '127.0.0.1', () => {
			socket.removeListener('error', reject)
			resolve(socket.address().port)
		})
	})
}

function sendToGui(socket, address, args) {
	socket.send(encodeMessage(address, args), guiListenPort, '127.0.0.1')
}

function writeBootLog(daemonPort) {
	const logDir = path.join(os.homedir(), '.sonic-pi', 'log')
	fs.mkdirSync(logDir, { recursive: true })
	const line = [
		'Selected ports: ',
		'{',
		`"spider-listen-to-gui" => ${sendPort}, "spider-send-to-gui" => ${guiListenPort}, `,
		`"scsynth" => 4560, "scsynth-send" => 4561, "osc-cues" => 4562, "daemon" => ${daemonPort}`,
		'}',
		`\nToken: ${guiUuid}\n`,
	].join('')
	fs.appendFileSync(path.join(logDir, 'daemon.log'), line)
}

function completeRun(socket, id) {
	sendToGui(socket, '/log/info', [0, `Completed run ${id}`])
}

async function main() {
	const daemonSocket = dgram.createSocket('udp4')
	const commandSocket = dgram.createSocket('udp4')
	const daemonPort = await bind(daemonSocket, spec.ports?.daemon ?? 0)
	sendPort = await bind(commandSocket, spec.ports?.send ?? 0)
	guiListenPort = spec.ports?.guiListen ?? (await freePort())

	const pending = new Map()

	const onCommand = (socket, message) => {
		let decoded
		try {
			decoded = decodeMessage(message)
		} catch (error) {
			record({ event: 'unparsed', error: error.message })
			return
		}
		const { address, args } = decoded
		if (address.startsWith('/fake/')) {
			handleControl(address.slice('/fake/'.length), args)
			return
		}
		record({ event: 'message', address, args })
		if (address === '/run-code') {
			const id = runId++
			sendToGui(socket, '/log/info', [0, `Starting run ${id}`])
			if (holdRuns) {
				pending.set(id, true)
			} else {
				setTimeout(() => completeRun(socket, id), completeDelayMs)
			}
		} else if (address === '/stop-all-jobs') {
			// The real daemon ends every job when the session stops, and the runs it was playing
			// report their completion. Held runs must follow suit or a stopped cell keeps playing forever.
			for (const id of pending.keys()) {
				completeRun(socket, id)
			}
			pending.clear()
		} else if (address === '/buffer-beautify') {
			const [, bufferId, code, line, index] = args
			const aligned = String(code)
				.split('\n')
				.map((codeLine) => codeLine.trim())
				.join('\n')
			sendToGui(socket, '/buffer/replace', [bufferId, aligned, line, index])
		}
	}

	const handleControl = (name, args) => {
		record({ event: 'control', name, args })
		if (name === 'flash') {
			sendToGui(commandSocket, '/flash', [-1, 'eval', args[0]])
		} else if (name === 'complete-run') {
			const id = args[0]
			if (pending.delete(id)) {
				completeRun(commandSocket, id)
			}
		} else if (name === 'stop-all') {
			for (const id of pending.keys()) {
				completeRun(commandSocket, id)
			}
			pending.clear()
		} else if (name === 'version') {
			sendToGui(commandSocket, '/version', [args[0]])
		} else if (name === 'exit') {
			shutdown(commandSocket, 'control-exit')
		}
	}

	const shutdown = (socket, reason) => {
		record({ event: 'exit', pid: process.pid, reason })
		try {
			socket.close()
		} catch {
			// already closed
		}
		process.exit(0)
	}

	daemonSocket.on('message', (message) => {
		let decoded
		try {
			decoded = decodeMessage(message)
		} catch {
			return
		}
		record({ event: 'message', address: decoded.address, args: decoded.args })
		if (decoded.address === '/daemon/exit') {
			shutdown(commandSocket, 'daemon-exit')
		}
	})
	commandSocket.on('message', (message) => onCommand(commandSocket, message))

	process.on('SIGTERM', () => shutdown(commandSocket, 'sigterm'))

	record({
		event: 'boot',
		pid: process.pid,
		daemonPort,
		guiListenPort,
		sendPort,
		token: guiUuid,
	})
	writeBootLog(daemonPort)
	// Exactly one stdout line: the extension parses every chunk and aborts on a non-numeric
	// final token.
	process.stdout.write(`${daemonPort} ${guiListenPort} ${sendPort} 4560 4562 ${guiUuid}\n`)
}

main().catch((error) => {
	record({ event: 'boot-failure', error: String(error && error.message) })
	process.stderr.write(`fake daemon failed: ${error && error.message}\n`)
	process.exit(1)
})
