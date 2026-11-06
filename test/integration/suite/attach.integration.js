const assert = require('assert')
const fs = require('fs')
const vscode = require('vscode')
const host = require('../harness/host')

const APP_TOKEN = 700123

function runner() {
	return host.extensionModule('source-runner/extension.js')
}

suite('Attach to a running Sonic Pi app', () => {
	let appCommands
	let appDaemon
	let spider

	suiteSetup(async function () {
		const foreign = host.foreignSpider()
		if (foreign) {
			console.log(
				`attach suite skipped: a real Sonic Pi server is running on this machine (${foreign}), ` +
					'the /proc scan would find it instead of the stand-in',
			)
			this.skip()
		}
		await host.activateExtension()
		await host.updateSetting('connectionMode', 'auto')
		await host.updateSetting('launchSonicPiServerAutomatically', 'never')
		// The app's OSC ports: runs land on its spider-listen-to-gui port, keep-alives on its
		// daemon-keep-alive port.
		appCommands = await host.openOscReceiver()
		appDaemon = await host.openOscReceiver()
		const listenPort = await host.freePort()
		spider = host.spawnFakeSpider({
			sendPort: appCommands.port,
			listenPort,
			token: APP_TOKEN,
		})
		// A user-run app's booter already wrote this; the adopting window reads the keep-alive
		// port and token from it because it has no child process of its own.
		host.writeDaemonLog({
			daemonPort: appDaemon.port,
			sendPort: appCommands.port,
			guiListenPort: listenPort,
			token: APP_TOKEN,
		})
		await host.waitUntil(
			() => fs.readFileSync(`/proc/${spider.pid}/cmdline`, 'utf8').includes('spider-server.rb'),
			'the stand-in app to publish its spider-server.rb cmdline',
		)
	})

	suiteTeardown(() => {
		host.killPid(spider?.pid)
		appCommands?.close()
		appDaemon?.close()
	})

	test('the window adopts the app, keeps its daemon alive and plays into its session', async () => {
		const mark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.startserver')
		await host.waitUntil(() => runner().serverIsRunning(), 'the window to adopt the running app')
		assert.deepStrictEqual(host.boots(mark), [], 'attaching must not boot a second daemon')
		assert.strictEqual(runner().isReceiving(), true, 'the window owns the app reply port')
		assert.ok(
			host.logLines('Sonic Pi Log').some((line) => line.includes('Attaching to running Sonic Pi server')),
			'the adoption is reported in the Sonic Pi Log channel',
		)

		// The app's kill switch stops the audio of a playing set without a keep-alive, so the
		// session survives only if the adopting window pings the daemon port it read from the log.
		await appDaemon.waitFor('/daemon/keep-alive', (message) => message.args[0] === APP_TOKEN, 2000)
		assert.ok(
			host
				.logLines('Sonic Pi Log')
				.some((line) => line.includes(`keep-alive goes to its port ${appDaemon.port}`)),
			'the adopted keep-alive route is reported in the Sonic Pi Log channel',
		)

		await vscode.commands.executeCommand('vscode-sonic-pi.runWithText', 'play :e4')
		const run = await appCommands.waitFor('/run-code', (message) => message.args[1].includes('play :e4'))
		assert.strictEqual(run.args[0], APP_TOKEN, 'the run goes to the app session, with the app token')
	})
})
