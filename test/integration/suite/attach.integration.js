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
		// The app's own OSC port: whatever the extension sends to the running Sonic Pi lands here.
		appCommands = await host.openOscReceiver()
		spider = host.spawnFakeSpider({
			sendPort: appCommands.port,
			listenPort: await host.freePort(),
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
	})

	test('the window attaches to the app, plays into its session and boots nothing of its own', async () => {
		const mark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.startserver')
		await host.waitUntil(() => runner().serverIsRunning(), 'the window to adopt the running app')
		assert.deepStrictEqual(host.boots(mark), [], 'attaching must not boot a second daemon')
		assert.strictEqual(runner().isReceiving(), true, 'the window owns the app reply port')

		await appCommands.waitFor('/version')
		await vscode.commands.executeCommand('vscode-sonic-pi.runWithText', 'play :e4')
		const run = await appCommands.waitFor('/run-code', (message) => message.args[1].includes('play :e4'))
		assert.strictEqual(run.args[0], APP_TOKEN, 'the run goes to the app session, with the app token')
	})
})
