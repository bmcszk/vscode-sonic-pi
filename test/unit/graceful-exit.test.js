#!/usr/bin/env node
// Graceful daemon shutdown: a managed stop or restart asks the daemon to exit (/exit(token),
// spider-server.rb:354-362 -> runtime.rb:1445-1451 stops the jobs scheduler-clean) and only
// kills it when the daemon has not left within the deadline. The same wire shapes as the real
// daemon: the child ignores SIGTERM (spider has no trap) unless its /exit handler exits, and
// its at_exit sends /exited-sideredata the way spider-server.rb:278-285 does.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const Module = require('module')

const repoRoot = path.resolve(__dirname, '../..')
const RealOSC = require('osc-js') // captured before Module._load is overridden
const oscLibPath = require.resolve('osc-js')
const scriptsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graceful-exit-daemons-'))

const loggedLines = []
const errorsShown = []
// What the window put on the wire in the current test: one send queue serves every Main.
let wire = []
let spawnedServers = []
let oscInstances = []

class FakeOscSender {
	constructor(port) {
		this.port = port
		this.errorHandlers = []
		this.sent = []
		// Real UDP delivery: the stand-in daemon is a live process listening on this port,
		// so a record-only sender would make /exit invisible to it (the graceful flow would
		// depend on the kill fallback and every deadline test would time out).
		this.socket = require('dgram').createSocket('udp4')
		this.socket.bind(0, '127.0.0.1')
		this.ready = new Promise((resolve) => this.socket.once('listening', resolve))
		oscInstances.push(this)
	}
	onError(callback) {
		this.errorHandlers.push(callback)
	}
	async send(message) {
		const recorded = { address: message.address, args: message.args }
		this.sent.push(recorded)
		wire.push(recorded)
		if (!this.port) return
		await this.ready
		const packet = new RealOSC.Message(message.address, ...message.args).pack()
		this.socket.send(Buffer.from(packet), this.port, '127.0.0.1')
	}
}

const vscodeStub = {
	EventEmitter: class {
		constructor() {
			this.listeners = []
		}
		fire(value) {
			for (const listener of this.listeners) listener(value)
		}
		event(listener) {
			this.listeners.push(listener)
			return { dispose: () => {} }
		}
		dispose() {}
	},
	Range: class {},
	Selection: class {},
	TextEditorRevealType: { InCenterIfOutsideViewport: 0 },
	window: {
		createOutputChannel: () => ({
			append: (line) => loggedLines.push(line),
			appendLine: (line) => loggedLines.push(line),
			show() {},
			dispose() {},
			clear() {},
		}),
		createTextEditorDecorationType: () => ({}),
		createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
		showErrorMessage: async (message) => {
			errorsShown.push(message)
			return undefined
		},
		onDidChangeVisibleTextEditors() {},
	},
	workspace: {
		getConfiguration: () => ({ get: () => undefined }),
		onDidChangeConfiguration() {},
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	if (request === './oscsender') return { OscSender: FakeOscSender }
	// Main listens for the daemon's exit pushes on the same OSC instance it sends with, so the
	// test must be able to deliver a push to the receiver Main set up.
	if (request === 'osc-js') return oscJsModule
	return load.apply(this, arguments)
}

class FakeOsc {
	constructor() {
		this.handlers = new Map()
		this.plugin = { socket: { connect: () => {}, on: () => {} } }
		oscInstances.push(this)
	}
	open() {}
	on(address, callback) {
		this.handlers.set(address, callback)
	}
	send() {}
	fire(address, args) {
		const callback = this.handlers.get(address)
		if (!callback) throw new Error(`no handler for ${address}`)
		callback({ address, args })
	}
	dispose() {}
}
FakeOsc.Message = class {
	constructor(address, ...args) {
		this.address = address
		this.args = args
	}
}
FakeOsc.DatagramPlugin = class {}
const oscJsModule = FakeOsc

const { Main } = require('../../out/source-runner/main.js')

let serverSeq = 0

// A stand-in daemon with the real daemon's shutdown contract: no SIGTERM trap (spider has
// none), a token-checked /exit, and an at_exit /exited push to the GUI before it goes.
const makeDaemonScript = ({ exitOnGraceful }) => {
	const file = path.join(scriptsDir, `fake-daemon-${++serverSeq}.js`)
	fs.writeFileSync(
		file,
		[
			'#!/usr/bin/env node',
			`const OSC = require(${JSON.stringify(oscLibPath)})`,
			`const EXIT_ON_GRACEFUL = ${exitOnGraceful ? 'true' : 'false'}`,
			'const dgram = require("dgram")',
			'const daemonSocket = dgram.createSocket("udp4")',
			'const commandSocket = dgram.createSocket("udp4")',
			'const guiPort = Number(process.argv[2])',
			'const token = Number(process.argv[3])',
			'const packetFor = (address, args) => new OSC.Message(address, ...args).pack()',
			'const pushToGui = (address, args = []) => {',
			'  if (!guiPort) return',
			'  commandSocket.send(packetFor(address, args), guiPort, "127.0.0.1")',
			'}',
			'const leave = () => {',
			'  process.stdout.write("Spider - Server is exiting.\\n")',
			'  pushToGui("/exited")',
			'  process.stdout.write("Spider - Goodbye :-)\\n")',
			'  process.exit(0)',
			'}',
			// daemon.rb (unlike spider) dies on SIGTERM - that is the kill fallback's real
			// target, so the stand-in keeps the default disposition and dies by that signal.
			'daemonSocket.on("message", (message) => {',
			'  const decoded = new OSC.Message()',
			'  decoded.unpack(new DataView(message.buffer, message.byteOffset, message.byteLength))',
			'  if (decoded.address !== "/exit") return',
			'  if (decoded.args[0] !== token) {',
			'    process.stdout.write(`Invalid token: ${decoded.args[0]} - ignoring /exit API call\\n`)',
			'    return',
			'  }',
			'  if (EXIT_ON_GRACEFUL) leave()',
			'})',
			'daemonSocket.bind(0, "127.0.0.1", () => {',
			'  commandSocket.bind(0, "127.0.0.1", () => {',
			'    const ports = `${daemonSocket.address().port} ${commandSocket.address().port} 0 4560 4561`',
			'    process.stdout.write(`${ports} ${token}\\n`)',
			'    process.stdout.write(`daemon-port ${daemonSocket.address().port}\\n`)',
			'  })',
			'})',
		].join('\n'),
	)
	return file
}

const waitFor = async (predicate, what, timeoutMs = 5000) => {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const value = await predicate()
		if (value) return value
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error(`timed out waiting for ${what}`)
}

const alive = (child) => child.exitCode === null && child.signalCode === null

// Boots Main against a real child process (the child's signals and exit event are what the
// deadline flow reacts to), then fires the daemon's stdout so Main owns the ports.
const bootedMain = async (main, options) => {
	const script = makeDaemonScript(options)
	const stdoutLines = []
	const announced = new Promise((resolve) => {
		main.daemonProcess = spawn(process.execPath, [script, '0', String(options.token)], {
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		main.daemonProcess.stdout.setEncoding('utf8')
		main.daemonProcess.stdout.on('data', (chunk) => {
			for (const line of chunk.split('\n')) {
				if (!line) continue
				stdoutLines.push(line)
				if (line.startsWith('daemon-port ')) resolve(line)
			}
		})
	})
	await announced
	switchToDaemonPorts(main, stdoutLines)
	spawnedServers.push(main.daemonProcess)
	return { child: main.daemonProcess, stdoutLines }
}

const sentMessages = (token) => wire.filter((message) => message.args.includes(token))

// Points Main at the live stand-in: the command socket is where the GUI listens, and the
// daemon socket is the receive half of the server-send port - the one spider answers /exit on.
const switchToDaemonPorts = (main, stdoutLines) => {
	const line = stdoutLines.find((candidate) => /^\d+ \d+ /.test(candidate))
	const [daemonPort, commandPort, , , cuesPort, token] = line.split(' ')
	main.daemonPort = Number(daemonPort)
	main.guiListenToServerPort = Number(commandPort)
	main.serverOscCuesPort = Number(cuesPort)
	main.guiUuid = Number(token)
	resolveSendPort(main, daemonPort)
}

// The real Main opens a fresh sender per port handshake; the fake sender transmits, so the
// port it targets has to be the daemon's own listen port (an earlier resolved queue would
// swallow the send and /exit would never reach the stand-in).
const resolveSendPort = (main, serverSendToGuiPort) => {
	main.serverSendToGuiPort = Number(serverSendToGuiPort)
	main.portsInitalizedResolver(new FakeOscSender(main.serverSendToGuiPort))
}

const newMain = () => {
	const main = new Main()
	main.spiderServerScanner = () => undefined
	main.portsInitalized = new Promise((r) => (main.portsInitalizedResolver = r))
	return main
}

const killLeftovers = () => {
	for (const child of spawnedServers) {
		if (alive(child)) child.kill('SIGKILL')
	}
	spawnedServers = []
	oscInstances = []
	wire = []
	errorsShown.length = 0
}

const tests = {
	async 'stopping a managed server asks the daemon to exit and never signals it'() {
		// given a managed daemon that honours /exit
		const main = newMain()
		const { child, stdoutLines } = await bootedMain(main, { exitOnGraceful: true, token: 4242 })
		// when the window stops the server
		const stopping = main.stopServer()
		await new Promise((resolve) => setImmediate(resolve))
		// then the daemon was asked to exit, in its own token
		const request = sentMessages(4242).find((message) => message.address === '/exit')
		assert.ok(request, `the stop sends /exit, got ${JSON.stringify(sentMessages(4242))}`)
		assert.deepStrictEqual([...request.args], [4242], 'the request carries the boot token')
		// and its own shutdown ran instead of a signal
		await stopping
		await waitFor(() => !alive(child), 'the daemon to exit on its own')
		assert.ok(
			stdoutLines.includes('Spider - Server is exiting.'),
			`the daemon ran its own shutdown, got: ${JSON.stringify(stdoutLines)}`,
		)
		assert.strictEqual(child.signalCode, null, 'a graceful exit is not a signal death')
		assert.strictEqual(child.exitCode, 0, 'the daemon exited on its own terms')
	},

	async 'a daemon that ignores /exit is killed once the deadline passes'() {
		// given a managed daemon that acknowledges nothing (the hang-until-killed stand-in)
		const main = newMain()
		const { child } = await bootedMain(main, { exitOnGraceful: false, token: 4243 })
		const stopRequestedAt = Date.now()
		// when the window stops the server
		const stopping = main.stopServer()
		await new Promise((resolve) => setImmediate(resolve))
		assert.ok(
			sentMessages(4243).some((message) => message.address === '/exit'),
			'the stop asks first',
		)
		assert.ok(alive(child), 'precondition: the daemon is still running right after the request')
		// then the fallback kill lands at the deadline, not before it
		await stopping
		await waitFor(() => !alive(child), 'the fallback kill', 10000)
		const elapsed = Date.now() - stopRequestedAt
		assert.strictEqual(child.signalCode, 'SIGTERM', 'the fallback is the existing SIGTERM kill')
		assert.ok(elapsed >= 1900, `the fallback waited for the deadline, killed after ${elapsed}ms`)
	},

	async 'stopping an adopted server sends nothing and does not crash'() {
		// given a window that adopted a user-run app (no managed child process)
		const main = newMain()
		main.daemonPort = 4555
		main.guiUuid = 777
		main.serverStarted = true
		// when the window stops the server
		main.stopServer()
		await new Promise((resolve) => setTimeout(resolve, 50))
		// then no /exit went out and the window reports the shutdown
		assert.deepStrictEqual(
			sentMessages(777).filter((message) => message.address === '/exit'),
			[],
			'the window sends no /exit to a daemon it does not own',
		)
		assert.strictEqual(main.serverStarted, false, 'the window reports no server')
	},

	async 'the exited push during a shutdown stop does not fire an error state'() {
		// given a running managed daemon and a receiver wired for its pushes
		const main = newMain()
		const { child } = await bootedMain(main, { exitOnGraceful: true, token: 4244 })
		const states = []
		main.onServerState.event((state) => states.push(state))
		main.setupOscReceiver()
		const receiver = oscInstances[oscInstances.length - 1]
		// when the window stops the server and the daemon's at_exit push arrives
		await main.stopServer()
		receiver.fire('/exited', [])
		await waitFor(() => !alive(child), 'the daemon to exit on its own')
		// then only the normal stopped states were reported, in order, and no error surfaced
		assert.deepStrictEqual(states, ['stopped'], `the first stop state is the only one, got ${states}`)
		assert.deepStrictEqual(errorsShown, [], 'the mid-shutdown push shows no error')
		assert.strictEqual(main.serverStarted, false)
	},

	async 'the exited push during a shutdown restart does not fire an error state'() {
		// given a running managed daemon
		const main = newMain()
		const { stdoutLines } = await bootedMain(main, { exitOnGraceful: true, token: 4245 })
		switchToDaemonPorts(main, stdoutLines)
		// The restart reads serverStarted to decide whether the push reports a transition it
		// already owns; a managed daemon that Main owns is a running server.
		main.serverStarted = true
		const states = []
		main.onServerState.event((state) => states.push(state))
		main.setupOscReceiver()
		const receiver = oscInstances[oscInstances.length - 1]
		// when a restart is running and the old daemon's at_exit push arrives mid-shutdown
		const restart = main.restartServer()
		// restartServer reports its own 'stopped' after its first yield (the graceful wait), so
		// the push has to land after that report to be a mid-shutdown arrival at all.
		await new Promise((resolve) => setImmediate(resolve))
		receiver.fire('/exited', [])
		const statesAfterPush = states.slice()
		await restart
		receiver.fire('/spider/ready', [])
		await new Promise((resolve) => setTimeout(resolve, 20))
		// then the old daemon's push added no transition of its own
		assert.deepStrictEqual(
			statesAfterPush,
			['stopped'],
			`the mid-shutdown push must not re-report a state, got ${statesAfterPush}`,
		)
		// and the fresh generation announces itself: the boot reports 'running' and the fresh
		// daemon's own /spider/ready reports it again for the new generation
		assert.deepStrictEqual(
			states,
			['stopped', 'running', 'running'],
			`fresh boot reports, got ${states}`,
		)
		assert.deepStrictEqual(errorsShown, [], 'the mid-shutdown push shows no error')
	},
}

async function runTests() {
	let failures = 0
	const names = Object.keys(tests)
	for (const name of names) {
		try {
			await tests[name]()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.stack || error.message}`)
		} finally {
			killLeftovers()
		}
	}
	console.log(
		failures === 0
			? 'all graceful exit tests passed'
			: `${failures} of ${names.length} tests failed`,
	)
	return failures === 0 ? 0 : 1
}

void runTests().then((code) => process.exit(code))
