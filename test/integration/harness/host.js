// Host-side helpers shared by the integration suites. Everything here talks to either the real
// VS Code APIs (commands, documents, notebooks) or the fake daemon's file+UDP contract; no
// extension internals are stubbed, so a suite asserts what a user (or the daemon) observes.

const child_process = require('child_process')
const dgram = require('dgram')
const fs = require('fs')
const path = require('path')
const vscode = require('vscode')
const { decodeMessage, encodeMessage } = require('./osc')

const repoRoot = process.env.SONIC_PI_IT_REPO
const workspacePath = process.env.SONIC_PI_IT_WORKSPACE
const controlDir = process.env.SONIC_PI_FAKE_DIR

const fixturesDir = path.join(workspacePath, 'fixtures')
const eventsPath = path.join(controlDir, 'events.ndjson')
const specPath = path.join(controlDir, 'spec.json')

const EXTENSION_ID = 'blazesoftware.sonic-pi-5-extension'

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(check, message, timeoutMs = 15000, intervalMs = 25) {
	const deadline = Date.now() + timeoutMs
	let last
	while (Date.now() < deadline) {
		last = await check()
		if (last) return last
		await delay(intervalMs)
	}
	throw new Error(`timed out waiting for ${message}`)
}

function activateExtension() {
	const extension = vscode.extensions.getExtension(EXTENSION_ID)
	if (!extension) throw new Error('extension ' + EXTENSION_ID + ' not found in the host')
	return extension.activate()
}

// The output channels are the user-visible half of the contract ("Sonic Pi Log" says what the
// window did), and the API has no readback. This wraps the factory before the extension
// activates and keeps every appended line, transparently to the extension.
const channelLines = new Map()
const createOutputChannel = vscode.window.createOutputChannel
vscode.window.createOutputChannel = function (name, options) {
	const channel = createOutputChannel.call(vscode.window, name, options)
	const lines = []
	channelLines.set(name, lines)
	const appendLine = channel.appendLine.bind(channel)
	channel.appendLine = (value) => {
		lines.push(value)
		appendLine(value)
	}
	return channel
}

function logLines(name) {
	return channelLines.get(name) ?? []
}

// The compiled extension module graph, shared through the host's module cache: requiring e.g.
// 'cell-flash-map.js' returns the very instance the activated extension is using.
function extensionModule(relativePath) {
	return require(path.join(repoRoot, 'out', relativePath))
}

function writeFixture(name, content) {
	const file = path.join(fixturesDir, name)
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, content)
	return vscode.Uri.file(file)
}

async function openFixture(name) {
	const document = await vscode.workspace.openTextDocument(path.join(fixturesDir, name))
	return document
}

async function showFixture(name) {
	const editor = await vscode.window.showTextDocument(await openFixture(name))
	await waitUntil(
		() => vscode.window.activeTextEditor?.document.uri.toString() === editor.document.uri.toString(),
		'editor to become active',
	)
	return editor
}

async function openNotebook(fixtureName) {
	const uri = vscode.Uri.file(path.join(fixturesDir, fixtureName))
	const notebook = await vscode.workspace.openNotebookDocument(uri)
	await vscode.window.showNotebookDocument(notebook)
	await waitUntil(
		() => vscode.window.activeNotebookEditor?.notebook.uri.toString() === notebook.uri.toString(),
		'notebook to become the active editor',
	)
	return notebook
}

async function updateSetting(key, value) {
	await vscode.workspace
		.getConfiguration('vscode-sonic-pi')
		.update(key, value, vscode.ConfigurationTarget.Workspace)
}

// --- fake daemon contract ------------------------------------------------------------------

function readEvents() {
	let raw
	try {
		raw = fs.readFileSync(eventsPath, 'utf8')
	} catch {
		return []
	}
	return raw
		.split('\n')
		.filter((line) => line.trim().length > 0)
		.map((line) => {
			try {
				return JSON.parse(line)
			} catch {
				return undefined
			}
		})
		.filter((entry) => entry !== undefined)
}

function mark() {
	return readEvents().length
}

function sinceMark(markIndex) {
	return readEvents().slice(markIndex)
}

function messages(address, sinceIndex = 0) {
	return sinceMark(sinceIndex).filter((entry) => entry.event === 'message' && entry.address === address)
}

async function waitForMessage(address, sinceIndex = 0, predicate = () => true, timeoutMs = 15000) {
	return waitUntil(
		() => messages(address, sinceIndex).find((entry) => predicate(entry)),
		`the fake daemon to receive ${address}`,
		timeoutMs,
	)
}

function boots(sinceIndex = 0) {
	return sinceMark(sinceIndex).filter((entry) => entry.event === 'boot')
}

function lastBoot() {
	const all = readEvents().filter((entry) => entry.event === 'boot')
	return all[all.length - 1]
}

function writeSpec(spec) {
	fs.writeFileSync(specPath, JSON.stringify(spec, null, '\t') + '\n')
}

async function sendControl(name, args = []) {
	const boot = lastBoot()
	if (!boot) throw new Error('no fake daemon boot recorded yet')
	await sendOsc(boot.sendPort, `/fake/${name}`, args)
}

async function sendOsc(port, address, args) {
	const socket = dgram.createSocket('udp4')
	await new Promise((resolve, reject) => {
		socket.once('error', reject)
		socket.send(encodeMessage(address, args), port, '127.0.0.1', resolve)
	})
	socket.close()
}

function freePort() {
	return new Promise((resolve, reject) => {
		const socket = dgram.createSocket('udp4')
		socket.once('error', reject)
		socket.bind(0, '127.0.0.1', () => {
			const port = socket.address().port
			socket.close(() => resolve(port))
		})
	})
}

// An OSC receiver we own: the attach suite uses it as the spider's "send" port (argv1) and as a
// blocker for the daemon reply port (EADDRINUSE) in the takeover scenario.
function openOscReceiver(port = 0) {
	const socket = dgram.createSocket('udp4')
	const received = []
	socket.on('message', (buffer) => {
		try {
			received.push(decodeMessage(buffer))
		} catch (error) {
			received.push({ address: '<unparsed>', args: [String(error && error.message)] })
		}
	})
	return new Promise((resolve, reject) => {
		socket.once('error', reject)
		socket.bind(port, '127.0.0.1', () => {
			socket.removeListener('error', reject)
			resolve({
				port: socket.address().port,
				received,
				waitFor: (address, predicate = () => true, timeoutMs = 15000) =>
					waitUntil(
						() => received.find((message) => message.address === address && predicate(message)),
						`an OSC ${address} on port ${socket.address().port}`,
						timeoutMs,
					),
				close: () => socket.close(),
			})
		})
	})
}

// The real script's name: the extension's scanner only recognizes a cmdline whose script arg
// ends in /spider-server.rb (a probe- prefix would make the stand-in invisible to it).
const spiderScriptPath = path.join(path.dirname(workspacePath), 'spider-server.rb')

// A live process whose /proc cmdline is the spider-server shape the attach scanner parses:
// `... <script>/spider-server.rb -u <send> <listen> <scsynth> <scsynth-send> <cues> <token>`.
// It must be a plain node process: the extension host's process.execPath is the Code binary,
// which does not understand -e and would leave /proc before the scan runs.
function spawnFakeSpider({ sendPort, listenPort, token }) {
	fs.writeFileSync(spiderScriptPath, '# stands in for a user-run Sonic Pi server in /proc\n')
	const child = child_process.spawn(
		process.env.SONIC_PI_IT_NODE,
		['-e', 'setInterval(() => {}, 1 << 30)', spiderScriptPath, '-u', sendPort, listenPort, 4560, 4561, 4562, token],
		{ stdio: 'ignore' },
	)
	return child
}

// The booter log a Sonic Pi daemon leaves under the user's home. An adopting window reads it as
// the only source of the running daemon's keep-alive port and token, so the attach suite's
// stand-in app publishes the same line the fake daemon writes when it boots managed.
function writeDaemonLog({ daemonPort, sendPort, guiListenPort, token }) {
	const file = path.join(process.env.HOME, '.sonic-pi/log/daemon.log')
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.appendFileSync(
		file,
		[
			'Selected ports: ',
			'{',
			`"spider-listen-to-gui" => ${sendPort}, "spider-send-to-gui" => ${guiListenPort}, `,
			`"scsynth" => 4560, "scsynth-send" => 4561, "osc-cues" => 4562, "daemon" => ${daemonPort}`,
			'}',
			`\nToken: ${token}\n`,
		].join(''),
	)
}

// The extension's attach scan takes the first spider-server.rb it finds in /proc, so the attach
// scenarios are only meaningful (and safe) when the machine has no real Sonic Pi session: they
// would otherwise attach to the user's live server.
function foreignSpider() {
	for (const pid of fs.readdirSync('/proc').filter((entry) => /^\d+$/.test(entry))) {
		let cmdline
		try {
			cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
		} catch {
			continue
		}
		if (cmdline.includes('/spider-server.rb') && !cmdline.includes(spiderScriptPath)) {
			return cmdline.split('\0').join(' ').trim()
		}
	}
	return undefined
}

function killPid(pid) {
	try {
		process.kill(pid, 'SIGTERM')
	} catch {
		// already gone
	}
}

async function closeAllEditors() {
	await vscode.commands.executeCommand('workbench.action.closeAllEditors')
}

module.exports = {
	EXTENSION_ID,
	activateExtension,
	boots,
	closeAllEditors,
	controlDir,
	delay,
	extensionModule,
	fixturesDir,
	foreignSpider,
	freePort,
	killPid,
	lastBoot,
	logLines,
	mark,
	messages,
	openFixture,
	openNotebook,
	openOscReceiver,
	readEvents,
	repoRoot,
	sendControl,
	sendOsc,
	showFixture,
	sinceMark,
	spawnFakeSpider,
	updateSetting,
	waitForMessage,
	waitUntil,
	workspacePath,
	writeFixture,
	writeDaemonLog,
	writeSpec,
}
