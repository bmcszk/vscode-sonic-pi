#!/usr/bin/env node
// Live-loop badges: an alive loop renders as a '♪ :name' badge on its live_loop header line.
// Pure renderer: store + document text in, decoration positions out.
const assert = require('assert')

const { LiveLoopScopeStore } = require('../../out/live-loop-scope')
const { badgeDecorations } = require('../../out/live-loop-badges')

const push = (name, line, jobid = 1, workspace = 'a') => ({ jobid, name, workspace, line, scopeNum: 0 })

const test = async () => {
	// a stored loop badges its live_loop header line, named
	{
		const store = new LiveLoopScopeStore()
		store.apply(push('drums', 1))
		const text = ['live_loop :drums do', '  sample :bd_haus', '  sleep 1', 'end'].join('\n')
		assert.deepStrictEqual(badgeDecorations(store, text), [{ line: 1, text: '♪ :drums' }])
	}

	// the header line wins over the pushed line, and every live loop gets its own badge
	{
		const store = new LiveLoopScopeStore()
		store.apply(push('drums', 1))
		store.apply(push('bass', 1))
		const text = [
			'# intro',
			'live_loop :drums do',
			'  sample :bd_haus',
			'  sleep 1',
			'end',
			'',
			"live_loop :'bass' do",
			'  play 40',
			'  sleep 2',
			'end',
		].join('\n')
		assert.deepStrictEqual(badgeDecorations(store, text), [
			{ line: 2, text: '♪ :drums' },
			{ line: 7, text: '♪ :bass' },
		])
	}

	// no textual header (notebook cell, fragment): the pushed line carries the badge
	{
		const store = new LiveLoopScopeStore()
		store.apply(push('drums', 4))
		const text = ['## the drums', 'sample :bd_haus', 'sleep 1', 'live_loop(:drums) do'].join('\n')
		assert.deepStrictEqual(badgeDecorations(store, text), [{ line: 4, text: '♪ :drums' }])
	}

	// ended loops render nothing
	{
		const store = new LiveLoopScopeStore()
		store.apply(push('drums', 1))
		const text = ['live_loop :drums do', '  sleep 1', 'end'].join('\n')
		store.end('drums')
		assert.deepStrictEqual(badgeDecorations(store, text), [])
	}

	// a loop defined in the text but never reported alive gets no badge
	{
		const store = new LiveLoopScopeStore()
		const text = ['live_loop :drums do', '  sleep 1', 'end', 'live_loop :bass do', 'end'].join('\n')
		assert.deepStrictEqual(badgeDecorations(store, text), [])
	}

	console.log('live-loop-badges tests passed')
}

test().catch((error) => {
	console.error(error)
	process.exit(1)
})
