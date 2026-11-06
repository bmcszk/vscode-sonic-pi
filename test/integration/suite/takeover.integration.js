const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const vscode = require('vscode')
const host = require('../harness/host')

// Sonic Pi hands the daemon and its spider-server the same token, and the booter log records
// that one value: the token a /daemon/exit must carry is the app's, not a second secret.
const APP_TOKEN = -713811861
const NOTEBOOK = 'takeover.pibook'
const BOOK = ['# Takeover', '', '```', 'play :c4', '```'].join('\n')

function runner() {
	return host.extensionModule('source-runner/extension.js')
}

// What daemon.rb leaves in the booter log: the app's selected ports and the token the daemon
// verifies /daemon/exit against. A window that never booted a daemon itself has no other route
// to the daemon port.
function writeBooterLog({ daemonPort, sendPort, listenPort, token }) {
	const logPath = path.join(os.homedir(), '.sonic-pi', 'log', 'daemon.log')
	fs.mkdirSync(path.dirname(logPath), { recursive: true })
	fs.writeFileSync(
		logPath,
		[
			`Selected ports: {"spider-listen-to-gui" => ${sendPort}, "spider-send-to-gui" => ${listenPort}, "daemon" => ${daemonPort}}`,
			`Token: ${token}`,
			'',
		].join('\n'),
	)
}

suite('Takeover on play', () => {
	let appCommands
	let replyPortOfOtherWindow
	let oldDaemon
	let spider

	suiteSetup(async function () {
		const foreign = host.foreignSpider()
		if (foreign) {
			console.log(
				`takeover suite skipped: a real Sonic Pi server is running on this machine (${foreign}), ` +
					'the /proc scan would find it instead of the stand-in',
			)
			this.skip()
		}
		await host.activateExtension()
		await host.updateSetting('connectionMode', 'auto')
		await host.updateSetting('launchSonicPiServerAutomatically', 'never')
		appCommands = await host.openOscReceiver()
		// The other window holds the app's reply port: this window's bind fails (EADDRINUSE), so
		// it can hear nothing and must take the daemon over before it can play.
		replyPortOfOtherWindow = await host.openOscReceiver()
		oldDaemon = await host.openOscReceiver()
		writeBooterLog({
			daemonPort: oldDaemon.port,
			sendPort: appCommands.port,
			listenPort: replyPortOfOtherWindow.port,
			token: APP_TOKEN,
		})
		spider = host.spawnFakeSpider({
			sendPort: appCommands.port,
			listenPort: replyPortOfOtherWindow.port,
			token: APP_TOKEN,
		})
		await host.waitUntil(
			() => fs.readFileSync(`/proc/${spider.pid}/cmdline`, 'utf8').includes('spider-server.rb'),
			'the stand-in app to publish its spider-server.rb cmdline',
		)
		await vscode.commands.executeCommand('vscode-sonic-pi.startserver')
		await host.waitUntil(() => runner().serverIsRunning(), 'the window to attach to the app')
		// The bind failure arrives asynchronously: the window is only deaf once EADDRINUSE landed.
		await host.waitUntil(
			() => runner().isReceiving() === false,
			'the other window to keep the app reply port',
		)
	})

	suiteTeardown(() => {
		host.killPid(spider?.pid)
		appCommands?.close()
		replyPortOfOtherWindow?.close()
		oldDaemon?.close()
	})

	test('playing from the window that hears nothing takes the daemon over and boots its own', async () => {
		// The app the window attached to is gone: only the booter log still knows its daemon.
		host.killPid(spider.pid)
		host.writeFixture(NOTEBOOK, BOOK)
		const notebook = await host.openNotebook(NOTEBOOK)
		const codeIndex = notebook.getCells().findIndex((cell) => cell.kind === vscode.NotebookCellKind.Code)

		const mark = host.mark()
		await vscode.commands.executeCommand('notebook.cell.execute', {
			ranges: [{ start: codeIndex, end: codeIndex + 1 }],
			document: notebook.uri,
		})

		const exitRequest = await oldDaemon.waitFor(
			'/daemon/exit',
			(message) => message.args[0] === APP_TOKEN,
		)
		assert.deepStrictEqual(exitRequest.args, [APP_TOKEN], 'the old daemon is asked to exit by token')

		const boot = await host.waitUntil(() => host.boots(mark)[0], 'this window to boot its own daemon')
		const run = await host.waitForMessage('/run-code', mark, (message) =>
			message.args[1].includes('play :c4'),
		)
		assert.strictEqual(run.args[0], boot.token, 'the play goes to the daemon this window booted')
		await host.waitUntil(
			() => runner().isReceiving(),
			'the taking-over window to own the connection again',
		)
	})
})
