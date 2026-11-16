import * as vscode from 'vscode'
import { MuteRegistry } from './loop-mute'

const CONFIGURATION_SECTION = 'vscode-sonic-pi'
const LANGUAGE_ID = 'sonic-pi'
const NOTEBOOK_CELL_SCHEME = 'vscode-notebook-cell'
const RUN_COMMAND = 'vscode-sonic-pi.run'
const RUN_TEXT_COMMAND = 'vscode-sonic-pi.runWithText'
const STOP_COMMAND = 'vscode-sonic-pi.stop'
export const MUTE_COMMAND = 'vscode-sonic-pi.muteLoop'
export const UNMUTE_COMMAND = 'vscode-sonic-pi.unmuteLoop'

interface SonicPiBlock {
	line: number
	text: string
}

// The mute lens registry is module-level so the command handlers in extension.ts flip the
// same registry the provider renders from.
const muteRegistry = new MuteRegistry()

export class SonicPiCodeLensProvider implements vscode.CodeLensProvider {
	private readonly lensesChanged = new vscode.EventEmitter<void>()
	readonly onDidChangeCodeLenses = this.lensesChanged.event

	constructor() {
		vscode.workspace.onDidChangeConfiguration(() => this.lensesChanged.fire())
		vscode.workspace.onDidChangeTextDocument(() => this.lensesChanged.fire())
	}

	// The command handlers share this module's registry so a mute flips the lens.
	mute(cellKey: string, code: string): void {
		muteRegistry.mute([cellKey], code)
		this.lensesChanged.fire()
	}

	unmute(cellKey: string): void {
		muteRegistry.unmute([cellKey])
		this.lensesChanged.fire()
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (!showsControlsFor(document)) {
			return []
		}
		const text = document.getText()
		return [...fileLenses(text), ...blockLenses(text), ...muteLenses(text)]
	}
}

// A mute lens keys the block by its document line and text, so unmute can find the
// stored code again and the lens flips with the registry state.
export const cellKeyFor = (line: number, blockText: string): string => `file://${line}:${blockText}`

function muteLenses(text: string): vscode.CodeLens[] {
	if (blocksOf(text).length < 2) {
		return []
	}
	return blocksOf(text)
		.filter((block) => hasPlayableLine(block.text) && !isAssignmentOnly(block.text))
		.map((block) => {
			const cellKey = cellKeyFor(block.line, block.text)
			const muted = muteRegistry.isMuted(cellKey)
			return codeLens(
				block.line,
				muted ? '$(play) Unmute' : '$(debug-pause) Mute',
				muted ? UNMUTE_COMMAND : MUTE_COMMAND,
				[cellKey, block.text],
			)
		})
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
	return blocks
		.filter((block) => hasPlayableLine(block.text) && !isAssignmentOnly(block.text))
		.map((block) =>
			// The block's start line lets runCode pad the fragment so the daemon's flash and
			// error lines land on file positions.
			codeLens(block.line, lensTitle(block.text), RUN_TEXT_COMMAND, [block.text, block.line]),
		)
}

function hasPlayableLine(blockText: string): boolean {
	return blockText.split(/\r?\n/).some((raw) => {
		const line = raw.trim()
		return line !== '' && !line.startsWith('#') && !SETTING_LINE.test(line)
	})
}

function isAssignmentOnly(blockText: string): boolean {
	const codeLines = codeLinesOf(blockText)
	return codeLines.length > 0 && codeLines.every((line) => ASSIGNMENT_LINE.test(line))
}

function lensTitle(blockText: string): string {
	const firstCodeLine = codeLinesOf(blockText)[0]
	return firstCodeLine !== undefined && DEFINITION_LINE.test(firstCodeLine)
		? '$(sync) Load def'
		: '$(play) Run cell'
}

function codeLinesOf(blockText: string): string[] {
	return blockText.split(/\r?\n/).filter((raw) => {
		const line = raw.trim()
		return line !== '' && !line.startsWith('#')
	})
}

// Assignment-only cells are silent: plain locals die with the run and are invisible to later runs.
const ASSIGNMENT_LINE = /^\s*[a-z_]\w*\s*=[^=]/
// define/defonce blocks only register a function; they stay useful as a live-coding "Load def" cell.
const DEFINITION_LINE = /^\s*(define|defonce)\b/

const SETTING_LINE = /^(use_[a-z_]+|set_[a-z_]+!|set!)[ (]/

function codeLens(line: number, title: string, command: string, args?: (string | number)[]): vscode.CodeLens {
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
