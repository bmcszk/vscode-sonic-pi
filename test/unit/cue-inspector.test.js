#!/usr/bin/env node
// Cue Inspector TreeDataProvider: unit tests over the provider with stubbed TreeItem.
// Follows the docs-browser.test.js pattern with vscode stubbing via Module._load.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

const vscodeCalls = {
	treeViews: [],
	commands: [],
	items: [],
	editors: [],
	selections: [],
	edits: [],
}

const vscodeStub = {
	EventEmitter,
	TreeItem: class TreeItem {
		constructor(label, collapsibleState) {
			this.label = label
			this.collapsibleState = collapsibleState
			this.contextValue = undefined
			this.tooltip = undefined
			this.description = undefined
			this.command = undefined
		}
	},
	TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
	TreeView: class TreeView {
		constructor(viewId, options) {
			this.viewId = viewId
			this.options = options
			this.visible = false
			this.description = undefined
			this.badge = undefined
			this.onDidChangeVisibility = new EventEmitter()
			this.onDidCollapseElement = new EventEmitter()
			this.onDidExpandElement = new EventEmitter()
			vscodeCalls.treeViews.push(this)
		}
		reveal() {}
		dispose() {}
	},
	commands: {
		registerCommand: (command, callback) => {
			vscodeCalls.commands.push({ command, callback })
			return { dispose() {} }
		},
		executeCommand: async (command, ...args) => {
			vscodeCalls.executedCommands = vscodeCalls.executedCommands || []
			vscodeCalls.executedCommands.push({ command, args })
		},
	},
	workspace: {
		openTextDocument: async (uri) => {
			const doc = { uri, text: '', lineCount: 1 }
			vscodeCalls.docs = vscodeCalls.docs || []
			vscodeCalls.docs.push(doc)
			return doc
		},
		getTextDocument: (uri) => {
			return vscodeCalls.docs?.find((d) => d.uri === uri) || { uri, text: '', lineCount: 1 }
		},
		onDidChangeTextDocument: new EventEmitter(),
	},
	Uri: {
		parse: (value) => value,
		file: (path) => `file://${path}`,
		joinPath: (base, ...paths) => `${base}/${paths.join('/')}`,
	},
	Position: class Position {
		constructor(line, character) {
			this.line = line
			this.character = character
		}
	},
	Range: class Range {
		constructor(start, end) {
			this.start = start
			this.end = end
		}
	},
	Selection: class Selection {
		constructor(anchor, active) {
			this.anchor = anchor
			this.active = active
		}
	},
	TextEditorEdit: class TextEditorEdit {
		constructor() {
			this.edits = []
		}
		replace(range, text) {
			this.edits.push({ range, text })
		}
	},
	window: {
		createTreeView: (viewId, options) => {
			const view = new vscodeStub.TreeView(viewId, options)
			return view
		},
		registerTreeDataProvider: (viewId, provider) => {
			vscodeCalls.providers = vscodeCalls.providers || []
			vscodeCalls.providers.push({ viewId, provider })
			return { dispose() {} }
		},
		activeTextEditor: {
			document: { uri: 'file:///test.pi', getText: () => '', lineCount: 1 },
			selection: null,
			edit: async (callback) => {
				const edit = new vscodeStub.TextEditorEdit()
				await callback(edit)
				vscodeCalls.edits = vscodeCalls.edits || []
				vscodeCalls.edits.push(edit)
				return true
			},
		},
		showTextDocument: async (doc) => {
			vscodeCalls.editors.push(doc)
			return doc
		},
		showInformationMessage: (msg) => {
			vscodeCalls.infoMessages = vscodeCalls.infoMessages || []
			vscodeCalls.infoMessages.push(msg)
		},
		withProgress: async (options, task) => {
			return await task({ report: () => {} })
		},
	},
	ProgressLocation: { SourceControl: 1, Window: 2, Notification: 3 },
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

// Import the CueStore first
const { CueStore } = require('../../out/cue-store')

// Now we can write the tests for the CueInspector
const runTests = async () => {
	const { CueInspector } = require('../../out/cue-inspector')
	let failures = 0
	let testCount = 0

	function assertTest(name, fn) {
		testCount++
		try {
			fn()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.stack || error.message}`)
		}
	}

	// Test 1: panel lists recent cues (time, address, args) newest-first
	assertTest('panel lists recent cues newest-first', () => {
		const store = new CueStore()
		store.add({ time: 1000, id: 1, address: '/osc/msg1', args: 'arg1' })
		store.add({ time: 2000, id: 2, address: '/osc/msg2', args: 'arg2' })
		store.add({ time: 3000, id: 3, address: '/osc/msg3', args: 'arg3' })

		const inspector = new CueInspector(store)
		const children = inspector.getChildren()
		assert.strictEqual(children.length, 3)
		// Newest first: id 3, 2, 1
		assert.strictEqual(children[0].id, 3)
		assert.strictEqual(children[1].id, 2)
		assert.strictEqual(children[2].id, 1)
	})

	// Test 2: getTreeItem returns TreeItem with address/args/time, contextValue 'cue'
	assertTest('getTreeItem returns TreeItem with address/args/time and contextValue cue', () => {
		const store = new CueStore()
		store.add({ time: 1500, id: 42, address: '/run/started', args: 'job=7' })

		const inspector = new CueInspector(store)
		const children = inspector.getChildren()
		const item = inspector.getTreeItem(children[0])

		assert.ok(item instanceof vscodeStub.TreeItem, 'should return a TreeItem')
		assert.strictEqual(item.contextValue, 'cue', 'contextValue should be "cue"')
		assert.ok(item.label.includes('/run/started'), 'label should include address')
		assert.ok(item.label.includes('job=7'), 'label should include args')
		assert.ok(item.label.includes('1500') || item.tooltip?.includes('1500'), 'should include time')
	})

	// Test 3: filter command narrows the list
	assertTest('filter command narrows the list', () => {
		const store = new CueStore()
		store.add({ time: 1000, id: 1, address: '/run/started', args: '' })
		store.add({ time: 2000, id: 2, address: '/run/ended', args: '' })
		store.add({ time: 3000, id: 3, address: '/log/message', args: '' })

		const inspector = new CueInspector(store)

		// Initially all 3
		assert.strictEqual(inspector.getChildren().length, 3)

		// Apply filter for 'run'
		inspector.setFilter('run')
		const filtered = inspector.getChildren()
		assert.strictEqual(filtered.length, 2)
		assert.ok(filtered.every((c) => c.address.toLowerCase().includes('run')))

		// Clear filter
		inspector.setFilter('')
		assert.strictEqual(inspector.getChildren().length, 3)
	})

	// Test 4: pause command freezes the list (returns empty when paused)
	assertTest('pause command freezes the list', () => {
		const store = new CueStore()
		store.add({ time: 1000, id: 1, address: '/a', args: '' })

		const inspector = new CueInspector(store)
		assert.strictEqual(inspector.getChildren().length, 1)

		inspector.setPaused(true)
		assert.strictEqual(inspector.getChildren().length, 0, 'paused should return empty list')

		inspector.setPaused(false)
		assert.strictEqual(inspector.getChildren().length, 1, 'resumed should show list again')
	})

	// Test 5: clear command empties the store
	assertTest('clear command empties the store', () => {
		const store = new CueStore()
		store.add({ time: 1000, id: 1, address: '/a', args: '' })
		store.add({ time: 2000, id: 2, address: '/b', args: '' })

		const inspector = new CueInspector(store)
		assert.strictEqual(inspector.getChildren().length, 2)

		inspector.clear()
		assert.strictEqual(inspector.getChildren().length, 0)
		assert.strictEqual(store.list().length, 0, 'store itself should be cleared')
	})

	// Test 6: insert-sync writes 'sync :address' at cursor in active editor
	assertTest('insert-sync writes sync :address at cursor', async () => {
		const store = new CueStore()
		store.add({ time: 1000, id: 1, address: '/run/started', args: '' })

		const inspector = new CueInspector(store)
		const children = inspector.getChildren()
		const cue = children[0]

		// The insertSync should be callable
		await inspector.insertSync(cue)

		// Check that an edit was made to the active editor
		assert.ok(vscodeCalls.edits && vscodeCalls.edits.length > 0, 'should have made an edit')
		const edit = vscodeCalls.edits[0]
		assert.ok(edit.edits && edit.edits.length > 0, 'edit should have replacements')
		const replacement = edit.edits[0]
		assert.ok(replacement.text.includes('sync :/run/started'), `should insert 'sync :/run/started', got: ${replacement.text}`)
	})

	// Test 7: filter state persists via view state
	assertTest('filter state persists', () => {
		const store = new CueStore()
		store.add({ time: 1000, id: 1, address: '/run/started', args: '' })
		store.add({ time: 2000, id: 2, address: '/log/msg', args: '' })

		const inspector = new CueInspector(store)
		inspector.setFilter('run')
		assert.strictEqual(inspector.getFilter(), 'run', 'filter should be retrievable')
	})

	// Test 8: pause state persists
	assertTest('pause state persists', () => {
		const store = new CueStore()
		store.add({ time: 1000, id: 1, address: '/a', args: '' })

		const inspector = new CueInspector(store)
		inspector.setPaused(true)
		assert.strictEqual(inspector.isPaused(), true, 'paused should be retrievable')
		inspector.setPaused(false)
		assert.strictEqual(inspector.isPaused(), false, 'resumed should be retrievable')
	})

	console.log(`\n${failures === 0 ? 'all cue-inspector tests passed' : `${failures} of ${testCount} tests failed`}`)
	return failures === 0 ? 0 : 1
}

runTests().then((code) => process.exit(code))