#!/usr/bin/env node
// Per-cell stop lens: while a block's run is live (the daemon pushed /run/started for the
// workspace that block was run under), that block's lens row becomes '$(debug-stop) Stop cell'
// and dispatches the per-cell stop command instead of the session-wide Stop. Every other block
// keeps its plain row, and the file-level Stop keeps session semantics.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

const configuration = { showEditorControls: true }

class FakeRange {
	constructor(startLine, startCharacter, endLine, endCharacter) {
		this.start = { line: startLine, character: startCharacter }
		this.end = { line: endLine, character: endCharacter }
	}
}

class FakeCodeLens {
	constructor(range, command) {
		this.range = range
		this.command = command
	}
}

class FireEmitter extends EventEmitter {
	// vscode.EventEmitter.event is a bound accessor: the runner binds it off the instance.
	event = (listener) => {
		this.on('change', listener)
		return { dispose: () => this.off('change', listener) }
	}
	fire(value) {
		this.emit('change', value)
	}
}

const vscodeStub = {
	EventEmitter: FireEmitter,
	Range: FakeRange,
	CodeLens: FakeCodeLens,
	workspace: {
		getConfiguration: () => ({
			get: (key, defaultValue) => (key in configuration ? configuration[key] : defaultValue),
		}),
		onDidChangeConfiguration: () => ({ dispose() {} }),
		onDidChangeTextDocument: () => ({ dispose() {} }),
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const { SonicPiCodeLensProvider, STOP_CELL_COMMAND, cellKeyFor } = require('../../out/codelenses.js')
// Loaded after the stub: the module builds its emitters from vscode on load.
const { onRunStarted, onRunEnded } = require('../../out/source-runner/main-events.js')
const { LiveRuns } = require('../../out/live-runs.js')

const liveRuns = new LiveRuns()

// The extension's runner owns the run tracking: its activation binds /run/started and
// /run/ended to the run map and repaints the lens rows. The suite binds the same shape.
function trackRunsForLens(provider) {
	onRunStarted.event(({ jobId, workspace }) => {
		for (const cellKey of workspace.split('|')) liveRuns.runStarted(jobId, cellKey)
		provider.lensesChangedByRuns()
	})
	onRunEnded.event((jobId) => {
		if (liveRuns.runEnded(jobId)) provider.lensesChangedByRuns()
	})
	return provider
}

const providerWithLiveRuns = () => trackRunsForLens(new SonicPiCodeLensProvider(() => liveRuns))

const BLOCK_A = 'live_loop :a do\n  play 60\nend'
const BLOCK_B = 'live_loop :b do\n  play 62\nend'

const document = (text) => ({ languageId: 'sonic-pi', uri: { scheme: 'file' }, getText: () => text })

const rowsOf = (provider, text) =>
	provider
		.provideCodeLenses(document(text))
		.filter((lens) => lens.command.command !== 'vscode-sonic-pi.muteLoop')
		.map((lens) => {
			const { title, command, arguments: args } = lens.command
			return { line: lens.range.start.line, title, command, arguments: args }
		})

const stopCellRows = (provider, text) =>
	rowsOf(provider, text).filter((row) => row.command === STOP_CELL_COMMAND)

const tests = {
	async 'a live block row flips to $(debug-stop) Stop cell and reverts when the run ends'() {
		// given a two-block file whose first block was run under its own cell key
		const text = `${BLOCK_A}\n\n${BLOCK_B}`
		const provider = providerWithLiveRuns()
		let repaints = 0
		provider.onDidChangeCodeLenses(() => repaints++)

		// when the daemon announces that block's workspace as a live job
		onRunStarted.fire({ jobId: 7, workspace: cellKeyFor(0, BLOCK_A) })

		// then only that block's row flips, to a cell-scoped stop carrying the block key
		assert.deepStrictEqual(rowsOf(provider, text), [
			{ line: 0, title: '$(play) Run', command: 'vscode-sonic-pi.run', arguments: [text] },
			{ line: 0, title: '$(stop) Stop', command: 'vscode-sonic-pi.stop', arguments: undefined },
			{
				line: 0,
				title: '$(play) Run cell',
				command: 'vscode-sonic-pi.runWithText',
				arguments: [BLOCK_A, 0],
			},
			{
				line: 4,
				title: '$(play) Run cell',
				command: 'vscode-sonic-pi.runWithText',
				arguments: [BLOCK_B, 4],
			},
			{
				line: 0,
				title: '$(debug-stop) Stop cell',
				command: STOP_CELL_COMMAND,
				arguments: [7],
			},
		])
		assert.strictEqual(repaints, 1, 'the row repaints without a document edit')

		// when the run ends
		onRunEnded.fire(7)

		// then the block row is a plain Run cell again
		assert.deepStrictEqual(
			rowsOf(provider, text).map((row) => row.title),
			['$(play) Run', '$(stop) Stop', '$(play) Run cell', '$(play) Run cell'],
		)
		assert.strictEqual(repaints, 2, 'the end of the run repaints too')
	},

	async 'a non-playing block never shows a Stop cell row'() {
		// given one playing block, when the provider lenses the file
		const text = `${BLOCK_A}\n\n${BLOCK_B}`
		const provider = providerWithLiveRuns()
		onRunStarted.fire({ jobId: 8, workspace: cellKeyFor(4, BLOCK_B) })

		// then only that block offers a stop, and it carries its own key
		assert.deepStrictEqual(stopCellRows(provider, text), [
			{ line: 4, title: '$(debug-stop) Stop cell', command: STOP_CELL_COMMAND, arguments: [8] },
		])
		onRunEnded.fire(8)
	},

	async 'a live notebook run paints no editor lens because notebook cells have no lens rows'() {
		// given a notebook cell workspace announced as live
		onRunStarted.fire({
			jobId: 9,
			workspace: 'vscode-notebook-cell:/tmp/book.pibook#W0sZmlsZQ%3D%3D',
		})

		// when a sonic-pi file editor is lensed
		const lensed = providerWithLiveRuns().provideCodeLenses(document(`${BLOCK_A}\n\n${BLOCK_B}`))

		// then no row claims to stop the notebook's run
		assert.deepStrictEqual(
			lensed.filter((lens) => lens.command.command === STOP_CELL_COMMAND),
			[],
		)
		onRunEnded.fire(9)
	},

	async 'a joint run of two blocks marks both rows'() {
		// given one run whose workspace names both blocks
		const text = `${BLOCK_A}\n\n${BLOCK_B}`
		const provider = providerWithLiveRuns()
		onRunStarted.fire({ jobId: 10, workspace: `${cellKeyFor(0, BLOCK_A)}|${cellKeyFor(4, BLOCK_B)}` })

		// then both blocks offer the same job's stop - one click silences the joint run
		assert.deepStrictEqual(
			stopCellRows(provider, text).map((row) => row.arguments),
			[[10], [10]],
		)
		onRunEnded.fire(10)
	},

	async 'a block played after the provider was created still flips'() {
		// given a provider that was lensed before any run
		const provider = providerWithLiveRuns()
		const text = `${BLOCK_A}\n\n${BLOCK_B}`
		assert.deepStrictEqual(stopCellRows(provider, text), [])

		// when a run starts afterwards
		onRunStarted.fire({ jobId: 11, workspace: cellKeyFor(0, BLOCK_A) })

		// then the provider reads the live map on paint instead of a snapshot from its creation
		assert.deepStrictEqual(
			stopCellRows(provider, text).map((row) => row.arguments),
			[[11]],
		)
		onRunEnded.fire(11)
	},
}

async function runAll() {
	let failures = 0
	for (const [name, test] of Object.entries(tests)) {
		try {
			// given: no run left over from the previous case
			liveRuns.clear()
			await test()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.stack || error.message}`)
		}
	}
	console.log(
		failures === 0
			? 'stop-cell lens tests passed'
			: `${failures} of ${Object.entries(tests).length} stop-cell lens tests failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
