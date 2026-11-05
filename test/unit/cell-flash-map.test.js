#!/usr/bin/env node
// Notebook playing state: a notebook run sends the executed cells joined into one script, so
// /flash lines are joined-script lines. The offset map turns such a line back into the cell that
// owns it (and the line inside that cell), and tracks which cells flashed within the TTL.
const assert = require('assert')

const { CellFlashMap, flashPaintFor, flashedCellKey } = require('../../out/cell-flash-map.js')

function fakeClock() {
	let now = 1000
	return {
		now: () => now,
		advance(ms) {
			now += ms
		},
	}
}

function mapWithScript(cells) {
	const clock = fakeClock()
	const flashes = new CellFlashMap(clock.now)
	flashes.recordScript(cells)
	return { flashes, clock }
}

const tests = {
	'the joined script records each executed cell as a half-open line span'() {
		const { flashes } = mapWithScript([
			{ cellKey: 'cell-a', content: 'play 60\nsleep 1' },
			{ cellKey: 'cell-b', content: 'sample :bd_haus\nsleep 0.5\nplay 72' },
		])

		const firstCell = [flashes.resolve(1), flashes.resolve(2)]
		const secondCell = [flashes.resolve(3), flashes.resolve(4), flashes.resolve(5)]

		// The cells join with one newline, so cell-b starts on joined line 3 and its local line 1.
		assert.deepStrictEqual(firstCell, [
			{ cellKey: 'cell-a', localLine: 1 },
			{ cellKey: 'cell-a', localLine: 2 },
		])
		assert.deepStrictEqual(secondCell, [
			{ cellKey: 'cell-b', localLine: 1 },
			{ cellKey: 'cell-b', localLine: 2 },
			{ cellKey: 'cell-b', localLine: 3 },
		])
	},

	'a line outside every cell span resolves to nothing'() {
		const { flashes } = mapWithScript([{ cellKey: 'cell-a', content: 'play 60' }])

		assert.strictEqual(flashes.resolve(0), undefined)
		assert.strictEqual(flashes.resolve(2), undefined)
		assert.strictEqual(flashes.resolve(-1), undefined)
	},

	'the map finds the owning cell among many spans'() {
		const cells = Array.from({ length: 50 }, (_unused, index) => ({
			cellKey: `cell-${index}`,
			content: 'play 60\nsleep 1',
		}))
		const { flashes } = mapWithScript(cells)

		assert.deepStrictEqual(flashes.resolve(1), { cellKey: 'cell-0', localLine: 1 })
		assert.deepStrictEqual(flashes.resolve(2), { cellKey: 'cell-0', localLine: 2 })
		assert.deepStrictEqual(flashes.resolve(51), { cellKey: 'cell-25', localLine: 1 })
		assert.deepStrictEqual(flashes.resolve(100), { cellKey: 'cell-49', localLine: 2 })
		assert.strictEqual(flashes.resolve(101), undefined)
	},

	'an empty script tracks no cells'() {
		const { flashes } = mapWithScript([])

		assert.strictEqual(flashes.isTracking(), false)
		assert.strictEqual(flashes.resolve(1), undefined)
	},

	'a new joined script replaces the previous offsets'() {
		const { flashes } = mapWithScript([{ cellKey: 'old-cell', content: 'play 60\nsleep 1' }])

		flashes.recordScript([{ cellKey: 'new-cell', content: 'sample :bd_haus' }])

		assert.deepStrictEqual(flashes.resolve(1), { cellKey: 'new-cell', localLine: 1 })
		assert.strictEqual(flashes.resolve(2), undefined, 'the previous script no longer owns line 2')
	},

	'a flash keeps its cell active for the TTL and a repeat refreshes it'() {
		const { flashes, clock } = mapWithScript([{ cellKey: 'cell-a', content: 'play 60' }])

		flashes.noteFlash('cell-a')
		clock.advance(200)
		assert.deepStrictEqual([...flashes.activeCells().keys()], ['cell-a'], 'still playing at 200 ms')

		flashes.noteFlash('cell-a')
		clock.advance(200)
		assert.deepStrictEqual(
			[...flashes.activeCells().keys()],
			['cell-a'],
			'the repeat restarts the 250 ms',
		)

		clock.advance(60)
		assert.deepStrictEqual([...flashes.activeCells().keys()], [], 'dropped 250 ms after the last flash')
	},

	'activeCells reports only the cells that flashed within the TTL'() {
		const { flashes, clock } = mapWithScript([
			{ cellKey: 'cell-a', content: 'play 60' },
			{ cellKey: 'cell-b', content: 'play 72' },
		])

		flashes.noteFlash('cell-a')
		clock.advance(200)
		flashes.noteFlash('cell-b')
		clock.advance(100)
		assert.deepStrictEqual([...flashes.activeCells().keys()], ['cell-b'], 'cell-a expired at 250 ms')

		clock.advance(200)
		assert.deepStrictEqual([...flashes.activeCells().keys()], [], 'cell-b expired too')
	},

	'clear drops the offsets and every active cell'() {
		const { flashes } = mapWithScript([{ cellKey: 'cell-a', content: 'play 60' }])
		flashes.noteFlash('cell-a')

		flashes.clear()

		assert.strictEqual(flashes.isTracking(), false)
		assert.strictEqual(flashes.resolve(1), undefined)
		assert.deepStrictEqual([...flashes.activeCells().keys()], [])
	},

	'a plain file run keeps its file-absolute flash line'() {
		const flashes = new CellFlashMap(fakeClock().now)

		assert.deepStrictEqual(flashPaintFor(flashes, 'eval', 'file:///crash.pi', 61), {
			kind: 'file',
			line: 61,
		})
	},

	'a joined-script flash paints its own cell only while that cell is the active editor'() {
		const { flashes } = mapWithScript([
			{ cellKey: 'cell-a', content: 'play 60\nsleep 1' },
			{ cellKey: 'cell-b', content: 'sample :bd_haus' },
		])

		assert.deepStrictEqual(flashPaintFor(flashes, 'eval', 'cell-a', 2), {
			kind: 'in-cell',
			line: 2,
		})
		assert.deepStrictEqual(flashPaintFor(flashes, 'eval', 'cell-b', 3), {
			kind: 'in-cell',
			line: 1,
		})
		assert.deepStrictEqual(flashPaintFor(flashes, 'eval', 'cell-b', 2), { kind: 'none' })
		assert.deepStrictEqual(flashPaintFor(flashes, 'eval', undefined, 2), { kind: 'none' })
		assert.deepStrictEqual(flashPaintFor(flashes, 'eval', 'file:///crash.pi', 2), {
			kind: 'none',
		})
	},

	'a joined-script flash outside every cell and a foreign workspace paint nothing'() {
		const { flashes } = mapWithScript([{ cellKey: 'cell-a', content: 'play 60' }])

		assert.deepStrictEqual(flashPaintFor(flashes, 'eval', 'cell-a', 9), { kind: 'none' })
		assert.deepStrictEqual(flashPaintFor(flashes, 'buffer-0', 'cell-a', 1), { kind: 'none' })
	},

	'the flashed joined-script line names the cell that is making sound'() {
		const { flashes } = mapWithScript([
			{ cellKey: 'cell-a', content: 'play 60\nsleep 1' },
			{ cellKey: 'cell-b', content: 'sample :bd_haus' },
		])

		assert.strictEqual(flashedCellKey(flashes, 'eval', 1), 'cell-a')
		assert.strictEqual(flashedCellKey(flashes, 'eval', 3), 'cell-b')
		assert.strictEqual(flashedCellKey(flashes, 'eval', 4), undefined, 'no cell owns line 4')
		assert.strictEqual(flashedCellKey(flashes, 'buffer-0', 1), undefined, 'not our run')
	},
}

async function runAll() {
	let failures = 0
	for (const [name, test] of Object.entries(tests)) {
		try {
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
			? 'all cell-flash-map tests passed'
			: `${failures} of ${Object.entries(tests).length} tests failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
