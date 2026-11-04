import * as vscode from 'vscode'

const CONFIGURATION_SECTION = 'vscode-sonic-pi'
const LANGUAGE_ID = 'sonic-pi'
const NOTEBOOK_CELL_SCHEME = 'vscode-notebook-cell'
const RUN_COMMAND = 'vscode-sonic-pi.run'
const RUN_TEXT_COMMAND = 'vscode-sonic-pi.runWithText'
const STOP_COMMAND = 'vscode-sonic-pi.stop'

interface SonicPiBlock {
	line: number
	text: string
}

export class SonicPiCodeLensProvider implements vscode.CodeLensProvider {
	private readonly lensesChanged = new vscode.EventEmitter<void>()
	readonly onDidChangeCodeLenses = this.lensesChanged.event

	constructor() {
		vscode.workspace.onDidChangeConfiguration(() => this.lensesChanged.fire())
		vscode.workspace.onDidChangeTextDocument(() => this.lensesChanged.fire())
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (!showsControlsFor(document)) {
			return []
		}
		const text = document.getText()
		return [...fileLenses(text), ...blockLenses(text)]
	}
}

function showsControlsFor(document: vscode.TextDocument): boolean {
	return showsEditorControls() && document.languageId === LANGUAGE_ID && !isNotebookCell(document)
}

function showsEditorControls(): boolean {
	return vscode.workspace.getConfiguration(CONFIGURATION_SECTION).get('showEditorControls', true)
}

function isNotebookCell(document: vscode.TextDocument): boolean {
	return document.uri.scheme === NOTEBOOK_CELL_SCHEME
}

function fileLenses(text: string): vscode.CodeLens[] {
	return [codeLens(0, '$(play) Run', RUN_COMMAND, [text]), codeLens(0, '$(stop) Stop', STOP_COMMAND)]
}

function blockLenses(text: string): vscode.CodeLens[] {
	const blocks = blocksOf(text)
	if (blocks.length < 2) {
		return []
	}
	return blocks.map((block) => codeLens(block.line, '$(play) Run cell', RUN_TEXT_COMMAND, [block.text]))
}

function codeLens(line: number, title: string, command: string, args?: string[]): vscode.CodeLens {
	return new vscode.CodeLens(new vscode.Range(line, 0, line, 0), { title, command, arguments: args })
}

function blocksOf(text: string): SonicPiBlock[] {
	const blocks: SonicPiBlock[] = []
	let current: { line: number; lines: string[] } | undefined

	const closeCurrent = () => {
		if (!current) {
			return
		}
		blocks.push({ line: current.line, text: current.lines.join('\n') })
		current = undefined
	}

	text.split(/\r?\n/).forEach((raw, line) => {
		if (raw.trim() === '') {
			closeCurrent()
			return
		}
		if (!current) {
			current = { line, lines: [] }
		}
		current.lines.push(raw)
	})
	closeCurrent()
	return blocks
}
