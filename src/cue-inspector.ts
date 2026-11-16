import * as vscode from 'vscode'
import { Cue, CueStore } from './cue-store'

export class CueInspector implements vscode.TreeDataProvider<Cue> {
	private store: CueStore
	private filterText: string | undefined
	private paused = false

	constructor(store: CueStore) {
		this.store = store
	}

	getTreeItem(element: Cue): vscode.TreeItem {
		const item = new vscode.TreeItem(
			`${element.address} ${element.args}`,
			vscode.TreeItemCollapsibleState.None,
		)
		item.contextValue = 'cue'
		item.tooltip = `Time: ${element.time}ms\nAddress: ${element.address}\nArgs: ${element.args}`
		return item
	}

	getChildren(): Cue[] {
		if (this.paused) {
			return []
		}
		const cues = this.store.list()
		if (this.filterText) {
			const needle = this.filterText.toLowerCase()
			return cues.filter((c) => c.address.toLowerCase().includes(needle))
		}
		return cues
	}

	setFilter(filter: string | undefined): void {
		this.filterText = filter
	}

	getFilter(): string | undefined {
		return this.filterText
	}

	setPaused(paused: boolean): void {
		this.paused = paused
	}

	isPaused(): boolean {
		return this.paused
	}

	clear(): void {
		this.store.clear()
	}

	async insertSync(cue: Cue): Promise<void> {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return
		}
		const text = `sync :${cue.address}`
		await editor.edit((editBuilder) => {
			editBuilder.insert(editor.selection.active, text)
		})
	}
}
