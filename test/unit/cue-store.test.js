const assert = require('assert')
const { CueStore } = require('../../out/cue-store')

const cue = (time, id, address, args = '') => ({ time, id, address, args })

const test = async () => {
	// /incoming/osc push populates the buffer with parsed fields
	{
		const store = new CueStore()
		store.add(cue(1.5, 7, '/run/started', 'job=7'))
		const list = store.list()
		assert.strictEqual(list.length, 1)
		assert.deepStrictEqual(list[0], { time: 1.5, id: 7, address: '/run/started', args: 'job=7' })
	}

	// newest-first ordering
	{
		const store = new CueStore()
		store.add(cue(1, 1, '/a', ''))
		store.add(cue(2, 2, '/b', ''))
		assert.deepStrictEqual(
			store.list().map((c) => c.id),
			[2, 1],
		)
	}

	// pause freezes the visible list; paused events are DROPPED
	{
		const store = new CueStore()
		store.add(cue(1, 1, '/a', ''))
		store.pause()
		store.add(cue(2, 2, '/b', ''))
		assert.strictEqual(store.list().length, 1, 'paused event must be dropped, list frozen')
		store.resume()
		assert.strictEqual(store.list().length, 1, 'resumed list still frozen at pause point')
		store.add(cue(3, 3, '/c', ''))
		assert.deepStrictEqual(
			store.list().map((c) => c.id),
			[3, 1],
		)
	}

	// filter matches address substring case-insensitively
	{
		const store = new CueStore()
		store.add(cue(1, 1, '/run/started', ''))
		store.add(cue(2, 2, '/run/ended', ''))
		store.add(cue(3, 3, '/log', ''))
		store.setFilter('START')
		assert.deepStrictEqual(store.list().map((c) => c.id), [1])
		store.setFilter('EnD')
		assert.deepStrictEqual(store.list().map((c) => c.id), [2])
		store.setFilter(undefined)
		assert.strictEqual(store.list().length, 3, 'undefined clears the filter')
		store.setFilter('')
		assert.strictEqual(store.list().length, 3, 'empty string clears the filter')
	}

	// ring cap: adding 505 events keeps 500, oldest evicted
	{
		const store = new CueStore()
		for (let i = 1; i <= 505; i++) store.add(cue(i, i, '/c', ''))
		const list = store.list()
		assert.strictEqual(list.length, 500)
		assert.strictEqual(list[0].id, 505, 'newest first')
		assert.strictEqual(list[499].id, 6, 'oldest kept is id 6; ids 1-5 evicted')
	}

	// clear empties the buffer
	{
		const store = new CueStore()
		store.add(cue(1, 1, '/a', ''))
		store.clear()
		assert.strictEqual(store.list().length, 0)
	}

	console.log('cue-store tests passed')
}

test().catch((e) => {
	console.error(e)
	process.exit(1)
})
