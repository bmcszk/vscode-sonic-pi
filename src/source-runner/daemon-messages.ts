import * as vscode from 'vscode'

// OSC payloads from the Sonic Pi daemon: integer fields and text fields.
type OscArg = number | string
type OscMessage = { args: OscArg[] }

// Show information about the syntax error to the user
export const showSyntaxError = (
	message: OscMessage,
	errorHighlightDecorationType: vscode.TextEditorDecorationType,
) => {
	const job_id = message.args[0]
	const desc = message.args[1]
	const error_line = message.args[2]
	const line = Number(message.args[3])

	void vscode.window
		.showErrorMessage(
			'Syntax error on Ajob ' + job_id + ': ' + desc + '\nLine ' + line + ': ' + error_line,
			'Goto error',
		)
		.then((item) => {
			if (item) {
				const errorHighlight: vscode.DecorationOptions[] = []
				const editor = vscode.window.activeTextEditor!
				const range = editor.document.lineAt(line - 1).range
				editor.selection = new vscode.Selection(range.start, range.end)
				editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
				errorHighlight.push({ range })
				editor.setDecorations(errorHighlightDecorationType, errorHighlight)
			}
		})
}

// Show information about the error to the user
export const showError = (
	message: OscMessage,
	logOutput: vscode.OutputChannel,
	errorHighlightDecorationType: vscode.TextEditorDecorationType,
) => {
	const job_id = message.args[0]
	const desc = message.args[1]
	const backtrace = message.args[2]
	const line = Number(message.args[3])

	logOutput.appendLine('Error on job ' + job_id + ': ' + desc + '\nLine ' + line + ': ' + backtrace)
	const errorHighlight: vscode.DecorationOptions[] = []
	const editor = vscode.window.activeTextEditor!
	const range = editor.document.lineAt(line - 1).range
	editor.selection = new vscode.Selection(range.start, range.end)
	editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
	errorHighlight.push({ range })
	editor.setDecorations(errorHighlightDecorationType, errorHighlight)
}

// Process an incoming multi-message
export const processMultiMessage = (message: OscMessage, logOutput: vscode.OutputChannel) => {
	const job_id = message.args[0]
	const thread_name = message.args[1]
	const runtime = message.args[2]
	const count = Number(message.args[3])

	let toShow = '{run: ' + job_id + ', time: ' + runtime
	if (thread_name) {
		toShow += ', thread: ' + thread_name
	}
	toShow += '}'
	logOutput.appendLine(toShow)

	for (let i = 0; i < count; i++) {
		const str = String(message.args[4 + 1 + 2 * i])
		const lines = str.split(/\r?\n/)
		if (!str) {
			toShow = ' |'
		} else if (i === count - 1) {
			toShow = ' └─ '
		} else {
			toShow = ' ├─ '
		}
		logOutput.append(toShow)

		lines.forEach((line: string) => {
			logOutput.appendLine(line)
		})
	}
}
