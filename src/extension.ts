import * as vscode from 'vscode'
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
	muteCellByKeys,
	unmuteCellByKeys,
	serverIsRunning,
} from './source-runner/extension'
import { SonicPiCodeLensProvider } from './codelenses'

const selector = { language: 'sonic-pi' }

export function activate(context: vscode.ExtensionContext) {
	activate_runner(context)

	registerDocsView(context)
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.checkInstall', () => {
			void vscode.commands.executeCommand('setContext', 'sonicPiInstalled', true)
			void vscode.window.showInformationMessage('All Good!')
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.openExamples', () => {
			void vscode.commands.executeCommand(
				'vscode.openFolder',
				vscode.Uri.joinPath(context.extensionUri, 'examples'),
			)
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.openTutorial', () => {
			void vscode.commands.executeCommand(
				'vscode.openWith',
				vscode.Uri.joinPath(context.extensionUri, 'tutorial', '1_Welcome to Sonic Pi.pibook'),
				'sonic-pi-book',
			)
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.docs', () => {
			void showDocsBrowser()
		}),
	)

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

	// Mute lens click: args carry the block's cell key and text. Cell toolbar dispatch comes
	// without args and resolves the focused notebook cell instead. Cold-window dispatch stays
	// a silent no-op: a modal there hangs the activation gate (see the masterVolume guard in
	// the runner's activate).
	const codeLensProvider = new SonicPiCodeLensProvider()
	context.subscriptions.push(
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
				unmuteCellByKeys([cellKey])
				codeLensProvider.unmute(cellKey)
				return
			}
			const cell = focusedNotebookCell()
			if (cell) notebookController.unmuteCell(cell)
		}),
		vscode.languages.registerCodeLensProvider({ language: 'sonic-pi' }, codeLensProvider),
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
