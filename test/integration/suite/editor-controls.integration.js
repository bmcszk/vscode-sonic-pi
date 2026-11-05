const assert = require('assert')
const vscode = require('vscode')
const host = require('../harness/host')

const RUN = 'vscode-sonic-pi.run'
const STOP = 'vscode-sonic-pi.stop'
const RUN_TEXT = 'vscode-sonic-pi.runWithText'

function messagesBetween(mark, address) {
	return host.sinceMark(mark).filter((entry) => entry.event === 'message' && entry.address === address)
}

suite('Editor controls', () => {
	suiteSetup(async () => {
		await host.activateExtension()
		const runner = host.extensionModule('source-runner/extension.js')
		if (!runner.serverIsRunning()) await runner.startServer()
	})

	test('Run, Stop, Run cell and Load def lenses are offered and send their runs', async () => {
		host.writeFixture(
			'controls.pi',
			'use_bpm 120\n\nplay :c4\n\nsleep 1\nplay :d4\n\ndefine :my_thing do\n  play :e4\nend\n',
		)
		const editor = await host.showFixture('controls.pi')
		const document = editor.document
		const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', document.uri)
		const titles = lenses.map((lens) => lens.command.title)
		assert.deepStrictEqual(titles.slice(0, 2), ['$(play) Run', '$(stop) Stop'])
		assert.deepStrictEqual(
			titles.filter((title) => title !== '$(play) Run' && title !== '$(stop) Stop'),
			['$(play) Run cell', '$(play) Run cell', '$(sync) Load def'],
		)

		const lensFor = (title, line) =>
			lenses.find((lens) => lens.command.title === title && lens.range.start.line === line)

		const runMark = host.mark()
		await vscode.commands.executeCommand(RUN, ...lensFor('$(play) Run', 0).command.arguments)
		const run = await host.waitForMessage('/run-code', runMark, (message) => message.args[1].includes('use_bpm 120'))
		assert.match(run.args[1], /play :d4/, 'the file lens sends the whole document')

		const stopMark = host.mark()
		await vscode.commands.executeCommand(STOP)
		await host.waitForMessage('/stop-all-jobs', stopMark)

		const cellMark = host.mark()
		const cellLens = lensFor('$(play) Run cell', 4)
		await vscode.commands.executeCommand(RUN_TEXT, ...cellLens.command.arguments)
		const cellRun = await host.waitForMessage('/run-code', cellMark)
		assert.match(cellRun.args[1], /sleep 1\nplay :d4/)
		assert.doesNotMatch(cellRun.args[1], /use_bpm/, 'a cell lens sends only its block')
		assert.deepStrictEqual(cellLens.command.arguments, ['sleep 1\nplay :d4', 4])

		const defMark = host.mark()
		await vscode.commands.executeCommand(RUN_TEXT, ...lensFor('$(sync) Load def', 7).command.arguments)
		const defRun = await host.waitForMessage('/run-code', defMark)
		assert.match(defRun.args[1], /define :my_thing do/)

		const manifest = vscode.extensions.getExtension(host.EXTENSION_ID).packageJSON
		const titleBar = manifest.contributes.menus['editor/title']
		assert.ok(
			titleBar.some((item) => item.command === RUN && /editorLangId=='sonic-pi'/.test(item.when)),
			'the title-bar play button invokes the same run command',
		)
	})

	test('Beautify asks the daemon to align the buffer and applies the reply in place', async () => {
		host.writeFixture('messy.pi', 'with_fx :reverb do\n    play :c4\n  end\n')
		const editor = await host.showFixture('messy.pi')
		const cursor = new vscode.Position(1, 3)
		editor.selection = new vscode.Selection(cursor, cursor)
		await host.waitUntil(
			() => vscode.window.activeTextEditor?.selection.active.line === 1,
			'the cursor to move',
		)

		const mark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.beautify')
		const beautify = await host.waitForMessage('/buffer-beautify', mark)
		const [token, bufferId, code, line, index, firstLine] = beautify.args
		assert.strictEqual(typeof token, 'number')
		assert.strictEqual(bufferId, editor.document.uri.toString())
		assert.strictEqual(code, 'with_fx :reverb do\n    play :c4\n  end\n')
		assert.strictEqual(line, 1, 'the daemon gets the cursor line')
		assert.strictEqual(index, 3, 'the daemon gets the cursor index')
		assert.strictEqual(firstLine, 0)
		assert.ok(
			messagesBetween(mark, '/save-buffer').length >= 1,
			'the buffer is registered before the alignment request',
		)

		await host.waitUntil(
			() => editor.document.getText() === 'with_fx :reverb do\nplay :c4\nend\n',
			'the aligned reply to replace the document',
		)
	})

	test('a run that plays midi sends /midi-start once, before the run', async () => {
		const mark = host.mark()
		await vscode.commands.executeCommand(RUN_TEXT, 'midi_note_on :c4, 60')
		await host.waitForMessage('/run-code', mark, (message) => message.args[1].includes('midi_note_on'))
		const addresses = host
			.sinceMark(mark)
			.filter((entry) => entry.event === 'message')
			.map((entry) => entry.address)
		assert.deepStrictEqual(
			addresses.filter((address) => address === '/midi-start' || address === '/run-code'),
			['/midi-start', '/run-code'],
		)

		const secondMark = host.mark()
		await vscode.commands.executeCommand(RUN_TEXT, 'midi_note_off :c4')
		await host.waitForMessage('/run-code', secondMark, (message) => message.args[1].includes('midi_note_off'))
		assert.deepStrictEqual(messagesBetween(secondMark, '/midi-start'), [], 'midi starts once per session')
	})

	test('runReplacesSession stops the previous jobs before the run unless it is turned off', async () => {
		const replacingMark = host.mark()
		await vscode.commands.executeCommand(RUN_TEXT, 'play :c4')
		await host.waitForMessage('/run-code', replacingMark, (message) => message.args[1].endsWith('play :c4'))
		assert.deepStrictEqual(
			host
				.sinceMark(replacingMark)
				.filter((entry) => entry.event === 'message' && ['/stop-all-jobs', '/run-code'].includes(entry.address))
				.map((entry) => entry.address),
			['/stop-all-jobs', '/run-code'],
		)

		await host.updateSetting('runReplacesSession', false)
		const layeringMark = host.mark()
		await vscode.commands.executeCommand(RUN_TEXT, 'play :e4')
		await host.waitForMessage('/run-code', layeringMark, (message) => message.args[1].endsWith('play :e4'))
		assert.deepStrictEqual(
			messagesBetween(layeringMark, '/stop-all-jobs'),
			[],
			'layering keeps the previous jobs alive',
		)
		await host.updateSetting('runReplacesSession', true)
	})
})
