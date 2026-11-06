const assert = require('assert')
const vscode = require('vscode')
const host = require('../harness/host')

const NOTEBOOK = 'book.pibook'

// The deserializer turns a markdown heading + fenced block into one markdown cell and one code
// cell, so the two playable cells of this fixture are its code cells.
const BOOK = [
	'# Cold plucks',
	'',
	'```',
	'play :c4',
	'```',
	'',
	'# Answer',
	'',
	'```',
	'play :d4',
	'```',
].join('\n')

function flashMap() {
	return host.extensionModule('cell-flash-map.js')
}

function codeCells(notebook) {
	return notebook.getCells().filter((cell) => cell.kind === vscode.NotebookCellKind.Code)
}

function isPlaying(cell) {
	return flashMap().notebookFlashMap.activeCells().has(cell.document.uri.toString())
}

// The notebook UI's Run button drives the same built-in command the suite uses, so an execution
// started here is indistinguishable from a click on the cell's play icon. The command settles only
// when the execution does, and this suite holds every run open, so callers fire it without awaiting
// and assert on what the daemon received instead.
function runCell(notebook, cell) {
	const index = notebook.getCells().indexOf(cell)
	return vscode.commands.executeCommand('notebook.cell.execute', {
		ranges: [{ start: index, end: index + 1 }],
		document: notebook.uri,
	})
}

suite('Notebook run', () => {
	let notebook
	let first
	let second

	suiteSetup(async () => {
		await host.activateExtension()
		const runner = host.extensionModule('source-runner/extension.js')
		if (!runner.serverIsRunning()) await runner.startServer()
		// Every run in this suite stays in flight until the suite ends it, so the states under
		// test (playing, interrupted, replaced) exist for as long as the assertions need them.
		host.writeSpec({ holdRuns: true })
		const mark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.restartserver')
		await host.waitUntil(() => host.boots(mark)[0], 'the held-run daemon to boot')
		// A playing cell must not be the reason the daemon dies when an editor closes.
		await host.updateSetting('stopServerOnLastEditorClose', false)
		host.writeFixture(NOTEBOOK, BOOK)
		notebook = await host.openNotebook(NOTEBOOK)
		;[first, second] = codeCells(notebook)
	})

	suiteTeardown(async () => {
		await host.sendControl('stop-all')
		host.writeSpec({})
	})

	test('the notebook fixture offers its code cells to the Sonic Pi kernel', async () => {
		assert.strictEqual(notebook.cellCount, 4, 'two markdown cells and two code cells')
		assert.deepStrictEqual(
			codeCells(notebook).map((cell) => cell.document.getText()),
			['play :c4', 'play :d4'],
		)
	})

	test('playing one cell sends only that cell, not the whole notebook', async () => {
		const mark = host.mark()
		void runCell(notebook, first)
		const run = await host.waitForMessage('/run-code', mark)
		assert.match(run.args[1], /play :c4/, 'the played cell reached the daemon')
		assert.doesNotMatch(run.args[1], /play :d4/, 'the unplayed cell stayed silent')
	})

	test('a playing cell stays marked for the whole run and clears when the run ends', async () => {
		const mark = host.mark()
		void runCell(notebook, second)
		await host.waitForMessage('/run-code', mark, (message) => message.args[1].includes('play :d4'))
		await host.waitUntil(() => isPlaying(second), 'the played cell to be marked playing')

		// The flash highlight is a quarter-second blink; the playing mark is not.
		await host.delay(flashMap().FLASH_TTL_MS + 150)
		assert.ok(isPlaying(second), 'the mark outlives the flash TTL of a single trigger')

		await host.sendControl('stop-all')
		await host.waitUntil(() => !isPlaying(second), 'the mark to clear when the run ends')
	})

	test('the cell Stop button interrupts the cell and stops every job on the daemon', async () => {
		const mark = host.mark()
		void runCell(notebook, first)
		await host.waitForMessage('/run-code', mark, (message) => message.args[1].includes('play :c4'))
		await host.waitUntil(() => isPlaying(first), 'the cell to be playing before the stop')

		const stopMark = host.mark()
		await vscode.commands.executeCommand('notebook.interruptExecution')
		await host.waitForMessage('/stop-all-jobs', stopMark)
		await host.waitUntil(() => !isPlaying(first), 'the interrupted cell to stop playing')
	})

	test('whole-song mode replays the executed cells on the next play', async () => {
		await host.updateSetting('notebookRunsWholeSong', true)
		try {
			const mark = host.mark()
			void runCell(notebook, second)
			const run = await host.waitForMessage('/run-code', mark, (message) =>
				message.args[1].includes('play :d4'),
			)
			assert.match(run.args[1], /play :c4/, 'the earlier cell is part of the notebook as one instrument')
		} finally {
			await host.updateSetting('notebookRunsWholeSong', false)
		}
	})

	test('a server restart abandons the runs in flight instead of leaving the cells spinning', async () => {
		const mark = host.mark()
		void runCell(notebook, first)
		await host.waitForMessage('/run-code', mark, (message) => message.args[1].includes('play :c4'))
		await host.waitUntil(() => isPlaying(first), 'the cell to be playing before the restart')

		const restartMark = host.mark()
		// The restarted daemon holds no runs: the restart itself is what abandons them. Its
		// completion delay stays wide enough for the playing mark of the next run to be visible.
		host.writeSpec({ completeDelayMs: 300 })
		await vscode.commands.executeCommand('vscode-sonic-pi.restartserver')
		await host.waitUntil(() => host.boots(restartMark)[0], 'the restarted daemon to boot')
		await host.waitUntil(() => !isPlaying(first), 'the abandoned run to stop playing')

		// The restarted daemon numbers runs from zero again; a play must still start and end.
		const afterMark = host.mark()
		// Not awaited: the command settles when this run ends, and the assertions below need the
		// run still in flight.
		void runCell(notebook, second)
		await host.waitForMessage('/run-code', afterMark, (message) => message.args[1].includes('play :d4'))
		await host.waitUntil(() => isPlaying(second), 'the play after the restart to run')
		await host.waitUntil(() => !isPlaying(second), 'the completed run to clear its mark')
	})
})
