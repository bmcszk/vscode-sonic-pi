import * as vscode from 'vscode'
import * as os from 'os'
import {
	ArgumentsCompletionItemProvider,
	CommandCompletionItemProvider,
	FxCompletionItemProvider,
	SampleCompletionItemProvider,
	SynthCompletionItemProvider,
} from './completionItems'
import { registerDocsView, showDocsBrowser } from './docs-browser'
import { HoverProvider } from './HoverProvider'
import { flashedCellKey, notebookFlashMap } from './cell-flash-map'
import { CellFlashStatusBarProvider } from './cell-flash-provider'
import { serializer, NotebookController } from './notebook'
import {
	activate as activate_runner,
	onFlash,
	onRunStarted,
	onRunEnded,
	muteCellByKeys,
	unmuteCellByKeys,
	stopRun,
	liveRunsForTest,
	serverIsRunning,
	openInitFile,
	previewEntry,
} from './source-runner/extension'
import type { DocsEntry } from './docs-browser'
import { SonicPiCodeLensProvider, STOP_CELL_COMMAND } from './codelenses'

const selector = { language: 'sonic-pi' }

// One-shot informational and navigation commands: no runner or notebook state involved.
const registerStaticCommands = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.checkInstall', () => {
			void vscode.commands.executeCommand('setContext', 'sonicPiInstalled', true)
			void vscode.window.showInformationMessage('All Good!')
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.openExamples', () => {
			void vscode.commands.executeCommand(
				'vscode.openFolder',
				vscode.Uri.joinPath(context.extensionUri, 'examples'),
			)
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.openTutorial', () => {
			void vscode.commands.executeCommand(
				'vscode.openWith',
				vscode.Uri.joinPath(context.extensionUri, 'tutorial', '1_Welcome to Sonic Pi.pibook'),
				'sonic-pi-book',
			)
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.docs', () => {
			// Preview rides the silent run path, so it needs a server. A cold dispatch of the docs
			// picker stays available (reading docs needs no daemon); only the preview step is off.
			const previewWhenRunning = (entry: DocsEntry) => (serverIsRunning() ? previewEntry(entry) : false)
			void showDocsBrowser(previewWhenRunning)
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.openInitFile', () => {
			// Pure file I/O: init.rb is the user's boot script, and editing it never needs a server.
			void openInitFile(os.homedir())
		}),
	)
}

// Text-editor language features over sonic-pi documents: completions, hovers and the
// notebook serializer for .pibook files.
const registerLanguageFeatures = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			selector,
			new SampleCompletionItemProvider(),
			...SampleCompletionItemProvider.triggerCharacters,
		),
		vscode.languages.registerCompletionItemProvider(
			selector,
			new SynthCompletionItemProvider(),
			...SynthCompletionItemProvider.triggerCharacters,
		),
		vscode.languages.registerCompletionItemProvider(
			selector,
			new FxCompletionItemProvider(),
			...FxCompletionItemProvider.triggerCharacters,
		),
		vscode.languages.registerCompletionItemProvider(
			selector,
			new ArgumentsCompletionItemProvider(),
			...ArgumentsCompletionItemProvider.triggerCharacters,
		),
		vscode.languages.registerHoverProvider(selector, new HoverProvider()),
		vscode.languages.registerCompletionItemProvider(selector, new CommandCompletionItemProvider()),
		vscode.workspace.registerNotebookSerializer('sonic-pi-book', serializer, { transientOutputs: true }),
	)
}

export function activate(context: vscode.ExtensionContext) {
	activate_runner(context)

	registerDocsView(context)
	registerStaticCommands(context)

	registerLanguageFeatures(context)

	const notebookController = new NotebookController(
		'sonic-pi-book-kernel',
		'sonic-pi-book',
		'Sonic Pi Player',
		notebookFlashMap,
	)

	context.subscriptions.push(notebookController)

	// A notebook editor cannot be decorated, so the cell that is making sound says so in its own
	// cell status bar while the daemon keeps flashing its lines of the joined script.
	const playingCellStatusBars = new CellFlashStatusBarProvider({ playingCells: notebookFlashMap })
	context.subscriptions.push(
		vscode.notebooks.registerNotebookCellStatusBarItemProvider('sonic-pi-book', playingCellStatusBars),
		onFlash(({ workspace, line }) => {
			const cellKey = flashedCellKey(notebookFlashMap, workspace, line)
			if (cellKey !== undefined) {
				playingCellStatusBars.noteFlash(cellKey)
			}
		}),
		{ dispose: () => playingCellStatusBars.dispose() },
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.runCell', async () => {
			const cellUri = vscode.window.activeTextEditor?.document.uri
			if (cellUri) {
				void notebookController.playCellFromURI(cellUri.toString())
			}
		}),
	)

	// Cell toolbar mute: the focused cell editor's uri finds the cell whose playing jobs the
	// mute/unmute must target; the controller knows the cell's last-run content.
	const focusedNotebookCell = (): vscode.NotebookCell | undefined => {
		const cellUri = vscode.window.activeTextEditor?.document.uri
		if (!cellUri || cellUri.scheme !== 'vscode-notebook-cell') {
			return undefined
		}
		for (const notebook of vscode.workspace.notebookDocuments) {
			const cell = notebook
				.getCells()
				.find((cell) => cell.document.uri.toString() === cellUri.toString())
			if (cell) {
				return cell
			}
		}
		return undefined
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.stopNotebook', async () => {
			const cellUri = vscode.window.activeTextEditor?.document.uri
			if (cellUri) {
				notebookController.stopNotebook(cellUri.toString())
			}
		}),
	)

	// This side owns the only lens provider for 'sonic-pi' (and with it the mute registry), so a
	// mute flips the lens title of the row that was clicked - never of a duplicate row. The
	// runner's live-run map decides which block rows are stops, so each run start and end
	// repaints the rows instead of waiting for a document edit.
	// Cold-window dispatch of the lens commands stays a silent no-op: a modal there hangs the
	// activation gate (see the masterVolume guard in the runner's activate).
	const codeLensProvider = new SonicPiCodeLensProvider(liveRunsForTest)
	context.subscriptions.push(
		onRunStarted(() => codeLensProvider.lensesChangedByRuns()),
		onRunEnded(() => codeLensProvider.lensesChangedByRuns()),
		// The playing block's stop carries the job id its lens saw start, so the click kills
		// that run and no other.
		vscode.commands.registerCommand(STOP_CELL_COMMAND, (jobId: unknown) => {
			if (!serverIsRunning()) return
			if (typeof jobId === 'number' && Number.isFinite(jobId)) stopRun(jobId)
		}),
		// Mute lens click: args carry the block's cell key and text. Cell toolbar dispatch comes
		// without args and resolves the focused notebook cell instead.
		vscode.commands.registerCommand('vscode-sonic-pi.muteLoop', (...args: unknown[]) => {
			if (!serverIsRunning()) return
			const [cellKey, code] = args
			if (typeof cellKey === 'string' && typeof code === 'string') {
				muteCellByKeys([cellKey], code)
				codeLensProvider.mute(cellKey, code)
				return
			}
			const cell = focusedNotebookCell()
			if (cell) notebookController.muteCell(cell)
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.unmuteLoop', (...args: unknown[]) => {
			if (!serverIsRunning()) return
			const [cellKey] = args
			if (typeof cellKey === 'string') {
				if (unmuteCellByKeys([cellKey])) codeLensProvider.unmute(cellKey)
				return
			}
			const cell = focusedNotebookCell()
			if (cell) notebookController.unmuteCell(cell)
		}),
		vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.newNotebook', async () => {
			await vscode.commands.executeCommand('workbench.action.files.newUntitledFile', {
				viewType: 'sonic-pi-book',
			})
		}),
	)
}
export function deactivate() {}
