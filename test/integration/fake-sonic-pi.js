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
let cueId = 0
let cuePort = 0
let cueSocket = null

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
	sendToGui(socket, '/run/ended', [id])
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
			// The daemon reports each job's workspace back to the GUI, so a run maps to the
			// cells that own it (main.ts keys liveJobs by it for per-cell stops).
			sendToGui(socket, '/run/started', [id, args[2] ?? 'eval'])
			record({ event: 'push', address: '/run/started', args: [id, args[2] ?? 'eval'] })
			// spider-server.rb:994-996 pushes /use-bpm when a run changes the session tempo.
			const bpm = spec.useBpm
			if (bpm !== undefined) {
				sendToGui(socket, '/use-bpm', [bpm])
				record({ event: 'push', address: '/use-bpm', args: [bpm] })
			}
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
		} else if (address === '/stop-job') {
			// spider-server.rb:1081-1083: a killed job is deleted from the pending table and
			// reports its /run/ended like any completed run.
			const id = args[1]
			if (pending.delete(id)) {
				completeRun(socket, id)
			}
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
		} else if (name === 'mixer-settings') {
			sendToGui(commandSocket, '/mixer/settings', [args[0], args[1]])
		} else if (name === 'use-bpm') {
			sendToGui(commandSocket, '/use-bpm', [args[0]])
		} else if (name === 'link-bpm') {
			sendToGui(commandSocket, '/link-bpm', [args[0]])
		} else if (name === 'link-peers') {
			sendToGui(commandSocket, '/link-num-peers', [args[0]])
		} else if (name === 'live-loop-scope') {
			// /live_loop/scope(jobid, name, workspace, line, scope_num) - spider-server.rb:1002
			sendToGui(commandSocket, '/live_loop/scope', [args[0], args[1], args[2], args[3], args[4]])
		} else if (name === 'live-loop-scope-ended') {
			// /live_loop/scope-ended(jobid, name) - spider-server.rb:1004
			sendToGui(commandSocket, '/live_loop/scope-ended', [args[0], args[1]])
		} else if (name === 'midi-ports') {
			// One 'enabled<TAB>name' string per line (runtime.rb:1949-1951) - spider-server.rb:986-988
			sendToGui(commandSocket, '/midi/in-ports', [args[0]])
		} else if (name === 'midi-out-ports') {
			sendToGui(commandSocket, '/midi/out-ports', [args[0]])
		} else if (name === 'gamepads') {
			sendToGui(commandSocket, '/gamepad/devices-list', [args[0]])
		} else if (name === 'spider-ready') {
			sendToGui(commandSocket, '/spider/ready', [])
		} else if (name === 'exited') {
			sendToGui(commandSocket, '/exited', [])
		} else if (name === 'request-audio-devices') {
			// The real daemon answers one request with three pushes (daemon-audio spike,
			// bean sonic-pi-1zc3): outputs, inputs, device-table - flat name arrays.
			sendToGui(commandSocket, '/supersonic/devices', ['system', 'System Default', 'Dock Audio'])
			sendToGui(commandSocket, '/supersonic/input-devices', ['System Default', 'Mic'])
			sendToGui(commandSocket, '/supersonic/device-table', ['PipeWire', '', 2, 'ALSA', 20])
		} else if (name === 'cue') {
			sendToGui(commandSocket, '/incoming/osc', [
				Date.now() / 1000,
				cueId++,
				args[0],
				args.slice(1).join(' '),
			])
		}
	}

	const shutdown = (socket, reason) => {
		record({ event: 'exit', pid: process.pid, reason })
		try {
			socket.close()
		} catch {
			// already closed
		}
		if (cueSocket) {
			try {
				cueSocket.close()
			} catch {
				// already closed
			}
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
		} else if (decoded.address === '/daemon/audio/request-devices') {
			// The real daemon answers one request with three pushes (daemon-audio spike,
			// bean sonic-pi-1zc3): outputs, inputs, device-table - flat name arrays.
			sendToGui(daemonSocket, '/supersonic/devices', ['system', 'System Default', 'Dock Audio'])
			sendToGui(daemonSocket, '/supersonic/input-devices', ['System Default', 'Mic'])
			sendToGui(daemonSocket, '/supersonic/device-table', ['PipeWire', '', 2, 'ALSA', 20])
		} else if (decoded.address === '/daemon/audio/switch-device') {
			// no-op for integration - the switch-device message is recorded in events.ndjson
		} else if (decoded.address === '/daemon/audio/switch-driver') {
			// no-op
		} else if (decoded.address === '/daemon/audio/reopen-device') {
			// no-op
		}
	})
	commandSocket.on('message', (message) => onCommand(commandSocket, message))

	// Optional cue socket (spec.ports.cues): the machine's osc-cues UDP listener. Packets
	// arriving there are both recorded (so suites can assert on the cue wire) and echoed to
	// the GUI as the /incoming/osc push shape main.ts consumes.
	if (spec.ports?.cues !== undefined) {
		cueSocket = dgram.createSocket('udp4')
		cuePort = await bind(cueSocket, spec.ports.cues)
		cueSocket.on('message', (message) => {
			let decoded
			try {
				decoded = decodeMessage(message)
			} catch {
				return
			}
			record({ event: 'cue', address: decoded.address, args: decoded.args })
			sendToGui(commandSocket, '/incoming/osc', [
				Date.now() / 1000,
				cueId++,
				decoded.address,
				decoded.args.join(' '),
			])
		})
	}

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
	process.stdout.write(`${daemonPort} ${guiListenPort} ${sendPort} 4560 ${cuePort || 4562} ${guiUuid}\n`)
}

main().catch((error) => {
	record({ event: 'boot-failure', error: String(error && error.message) })
	process.stderr.write(`fake daemon failed: ${error && error.message}\n`)
	process.exit(1)
})
