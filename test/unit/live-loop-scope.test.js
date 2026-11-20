#!/usr/bin/env node
// Live-loop scope store: /live_loop/scope says a loop thread came alive and where its
// header sits; /live_loop/scope-ended says it died. Pure state, no daemon dependency.
const assert = require('assert')

const { LiveLoopScopeStore } = require('../../out/live-loop-scope')

const push = (name, line, jobid = 1, workspace = 'a') => ({ jobid, name, workspace, line, scopeNum: 0 })

const test = async () => {
	// scope push registers the loop and reports where it lives
	{
		const store = new LiveLoopScopeStore()
		const before = Date.now()
		store.apply(push('drums', 3, 7, 'buffer-a'))
		const [entry] = store.list()
		assert.deepStrictEqual(
			{ name: entry.name, jobid: entry.jobid, workspace: entry.workspace, line: entry.line },
			{ name: 'drums', jobid: 7, workspace: 'buffer-a', line: 3 },
		)
		assert.ok(entry.at >= before, 'the entry carries the arrival time')
	}

	// scope-ended removes exactly the named loop
	{
		const store = new LiveLoopScopeStore()
		store.apply(push('drums', 3))
		store.apply(push('bass', 9))
		store.end('drums')
		assert.deepStrictEqual(
			store.list().map((entry) => entry.name),
			['bass'],
		)
	}

	// re-registering a name refreshes it in place and keeps the insertion order
	{
		const store = new LiveLoopScopeStore()
		store.apply(push('drums', 3, 1))
		store.apply(push('bass', 9, 1))
		store.apply(push('drums', 42, 2))
		assert.deepStrictEqual(
			store.list().map((entry) => [entry.name, entry.line, entry.jobid]),
			[
				['bass', 9, 1],
				['drums', 42, 2],
			],
		)
	}

	// ending an unknown loop is a no-op
	{
		const store = new LiveLoopScopeStore()
		store.apply(push('drums', 3))
		assert.doesNotThrow(() => store.end('never-started'))
		assert.strictEqual(store.list().length, 1)
	}

	// restart clears every badge
	{
		const store = new LiveLoopScopeStore()
		store.apply(push('drums', 3))
		store.apply(push('bass', 9))
		store.clear()
		assert.deepStrictEqual(store.list(), [])
	}

	// the defensive cap drops the oldest loop once live names exceed it
	{
		const store = new LiveLoopScopeStore()
		for (let index = 0; index < 256; index++) store.apply(push('loop-' + index, index))
		store.apply(push('loop-late', 300))
		assert.strictEqual(store.list().length, 256)
		assert.ok(!store.list().some((entry) => entry.name === 'loop-0'), 'the oldest loop was dropped')
		assert.ok(
			store.list().some((entry) => entry.name === 'loop-late'),
			'the newest loop survived',
		)
	}

	console.log('live-loop-scope tests passed')
}

test().catch((error) => {
	console.error(error)
	process.exit(1)
})
