const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const vscode = require('vscode')
const host = require('../harness/host')

const APP_TOKEN = 700456
const OLD_DAEMON_TOKEN = -713811861
const NOTEBOOK = 'takeover.pibook'
const BOOK = ['```', 'play :c4', '```', ''].join('\n')

function runner() {
	return host.extensionModule('source-runner/extension.js')
}

// What daemon.rb leaves in the booter log: the daemon's keep-alive port and the token it verifies
// /daemon/exit against. A window that never booted a daemon itself has no other route to them.
function writeBooterLog(daemonPort, token) {
	const logPath = path.join(os.homedir(), '.sonic-pi', 'log', 'daemon.log')
	fs.mkdirSync(path.dirname(logPath), { recursive: true })
	fs.writeFileSync(
		logPath,
		[
			`Selected ports: {"spider-listen-to-gui" => 45605, "spider-send-to-gui" => 45604, "daemon" => ${daemonPort}}`,
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
		writeBooterLog(oldDaemon.port, OLD_DAEMON_TOKEN)
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
		assert.strictEqual(runner().isReceiving(), false, 'the other window owns the app reply port')
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

		const mark = host.mark()
		await vscode.commands.executeCommand('notebook.cell.execute', {
			ranges: [{ start: 0, end: 1 }],
			document: notebook.uri,
		})

		const exitRequest = await oldDaemon.waitFor(
			'/daemon/exit',
			(message) => message.args[0] === OLD_DAEMON_TOKEN,
		)
		assert.deepStrictEqual(exitRequest.args, [OLD_DAEMON_TOKEN], 'the old daemon is asked to exit by token')

		const boot = await host.waitUntil(() => host.boots(mark)[0], 'this window to boot its own daemon')
		const run = await host.waitForMessage('/run-code', mark, (message) =>
			message.args[1].includes('play :c4'),
		)
		assert.strictEqual(run.args[0], boot.token, 'the play goes to the daemon this window booted')
		assert.strictEqual(runner().isReceiving(), true, 'the taking-over window now owns the connection')
	})
})
