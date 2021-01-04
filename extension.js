const vscode = require('vscode');
const camelcase = require('camelcase');
const snakecase = require('snake-case').snakeCase;
const humanizeString = require('humanize-string');
const googleTranslate = require('google-translate-open-api').default;

const options = require('./options');
const baiduTranslate = require('./lib/baidu-translate');
const { translators, namingRules } = require('./options');

/**
 * @typedef TranslateRes
 * @property {vscode.Selection} selection Selection
 * @property {string} translation Result
 */

/**
* The list of recently used translators
*
* @type {Array.<string>}
*/
const recentlyUsedTranslators = [];

/**
 * The list of recently used naming rules
 * 
 * @type {Array.<string>}
 */
const recentlyUsedNamingRules = [];

/**
 * Updates recently used lists for the convenience of users
 *
 * @param {string} selected The new selected
 * @returns {undefined}
 */
function updateRecentList(selected, type) {
	const list = type === 'translator' ? recentlyUsedTranslators : recentlyUsedNamingRules;
	const index = list.findIndex((r) => r === selected);
	if (index !== -1) {
		list.splice(index, 1);
	}
	list.unshift(selected);
}

/**
 * Extracts a text from the active document selection
 * 
 * @param {vscode.TextDocument} document The current document
 * @param {vscode.Selection} selection The current selection
 * @returns {string} A text
 */
function getSelectedText(document, selection) {
	return document.getText(selection);
}

/**
 * Get translator according selected translatorType
 * 
 * @param {string} selectedTranslator selected translatorType
 * @returns {Function}
 */
function getTranslate(selectedTranslator) {
	switch (selectedTranslator) {
		case 'Baidu':
			return (selectedText, translationConfiguration) => baiduTranslate(selectedText, translationConfiguration);
		case 'Google':
			return (selectedText, translationConfiguration) => googleTranslate(selectedText, translationConfiguration);
		default:
			return (selectedText, translationConfiguration) => googleTranslate(selectedText, translationConfiguration);
	}
}

function getNameCase(selectedNamingRule) {
	switch(selectedNamingRule) {
		case 'camelcase':
			return text => camelcase(text);
		case 'snakecase':
			return text => snakecase(text);
		default:
			return text => camelcase(text);
	}
}

/**
 * Convert the selectedText to the name of variable like a Promise
 * 
 * @param {string} selectedText selected text
 * @param {string} selectedTranslator selected translatorType
 * @param {string} selectedNamingRule selected naming rule
 * @param {vscode.Selection} selection selection
 * @returns {Promise}
 */
async function getVarNamesPromise(selectedText, selectedTranslator, selectedNamingRule, selection) {
	const translationConfiguration = {
		to: 'en',	
	};
	try {
		const translate = getTranslate(selectedTranslator);
		const namecase = getNameCase(selectedNamingRule);
		const res = await translate(selectedText, translationConfiguration);
		// console.log('translation:', selectedText, res);
		if (!!res && !!res.data) {
			if (res.data[0] === selectedText) {
				const res = await translate(humanizeString(selectedText), translationConfiguration);
				if (!!res && !!res.data) {
					return {
						selection,
						translation: camelcase(res.data[0]),
					}
				} else {
					throw new Error('Translation API issue');
				}
			} else {
				return {
					selection,
					translation: namecase(res.data[0]),
				};
			}
		} else {
			throw new Error('Translation API issue');
		}
	} catch (err) {
		console.error(err.message);
		vscode.window.showErrorMessage(err.message);
		return new Error('Translation API issue:', err.message);
	}
}

/**
 * 
 * @param {vscode.Selection} selections the current selection
 * @param {vscode.TextDocument} document the current document
 * @param {string} selectedTranslator
 * @param {string} selectedNamingRule 
 * @returns {Array.<Promise>}
 */
function getVarNamesPromiseArray(selections, document, selectedTranslator, selectedNamingRule) {
	return selections.map(selection => {
		const selectedText = getSelectedText(document, selection);
		return getVarNamesPromise(selectedText, selectedTranslator, selectedNamingRule, selection);
	});
}

function getPreferredTranslator() {
	return (
		vscode.workspace
			.getConfiguration('randvar')
			.get('preferredTranslator') || setPreferredTranslator()
	);
}

async function setPreferredTranslator() {
	const quickPickData = recentlyUsedTranslators
		.map(r => ({
			label: r,
			description: '(recently used)',
		}))
		.concat(options.translators.map(r => ({ label: r.name })));

	const selectedTranslator = await vscode.window.showQuickPick(quickPickData);
	if (!selectedTranslator) return;

	vscode.workspace
		.getConfiguration('randvar')
		.update(
			'preferredTranslator',
			selectedTranslator.label,
			vscode.ConfigurationTarget.Global
		);
	return selectedTranslator.label;
}

function getPreferredNamingRule() {
	return (
		vscode.workspace
			.getConfiguration('randvar')
			.get('preferredNamingRule') || setPreferredNamingRule()
	);
}

async function setPreferredNamingRule() {
	const quickPickData = recentlyUsedNamingRules
		.map(r => ({
			label: r,
			description: '(recently used)',
		}))
		.concat(options.namingRules.map(r => ({ label: r.name })));

	const selectedNamingRule = await vscode.window.showQuickPick(quickPickData);
	if (!selectedNamingRule) return;

	vscode.workspace
		.getConfiguration('randvar')
		.update(
			'preferredNamingRule',
			selectedNamingRule.label,
			vscode.ConfigurationTarget.Global
		);

	return selectedNamingRule.label;
}

/**
 * this method is called when your extension is activated
 * your extension is activated the very first time the command is executed
 * 
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// console.log('Congratulations, your extension randvar is now active!');

	const { subscriptions } = context;

	const start = vscode.commands.registerCommand('randvar.start', () => {
		const message = 'randvar is ready now!'
		vscode.window.showInformationMessage(message);
	});

	subscriptions.push(start);

	const variableHandler = vscode.commands.registerCommand('randvar.convertVariableName', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return; // no open text editor

		const { document, selections } = editor;
		try {
			/**
			 * Google translation open api is temporarily unavailable
			 */
			// // 1. select translator
			// const quickPickTranslatorData = recentlyUsedTranslators
			// 	.map((r) => ({
			// 		label: r,
			// 		description: '(recently used)',
			// 	}))
			// 	.concat(options.translators.map((r) => ({ label: r.name })));
			// const selectedTranslator = await vscode.window.showQuickPick(quickPickTranslatorData, 'Select preferred translator');
			// if (!selectedTranslator) return;
			// updateRecentList(selectedTranslator.label, 'translator');

			// 2. select naming rule
			const quickPickRuleData = recentlyUsedNamingRules
				.map(r => ({
					label: r,
					description: '(recently used)',
				}))
				.concat(options.namingRules.map(r => ({ label: r.name })));
			const selectedNamingRule = await vscode.window.showQuickPick(quickPickRuleData, 'Select preferred naming rule');
			if (!selectedNamingRule) return;
			updateRecentList(selectedNamingRule.label, 'namingRule');

			// 3. get variable name
			const varNamesPromiseArray = getVarNamesPromiseArray(
				selections,
				document,
				// translators.find(r => r.name === selectedTranslator.label).value,
				'Baidu',
				namingRules.find(r => r.name === selectedNamingRule.label).value,
			);
			const results = await Promise.all(varNamesPromiseArray);
			editor.edit(builder => {
				results.forEach(r => {
					if (!r.translation) return;
					builder.replace(r.selection, r.translation);
				})
			});
		} catch (err) {
			vscode.window.showErrorMessage(err.message);
		}
	});
	subscriptions.push(variableHandler);

	const variablePreferredHandler = vscode.commands.registerCommand('randvar.convertVariableNamePreferred', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return; // no open text editor

		const { document, selections } = editor;
		try {
			// TODO: get preferred translator
			// const selectedTranslator = await getPreferredTranslator();
			const selectedTranslator = 'Baidu';
			const selectedNamingRule = await getPreferredNamingRule();
			if (!selectedTranslator || !selectedNamingRule) {
				vscode.window.showWarningMessage('Please set your preferred translator and naming rule first!');
				return;
			}

			const varNamesPromiseArray = getVarNamesPromiseArray(
				selections,
				document,
				selectedTranslator,
				selectedNamingRule,
				translators.find(r => r.name === selectedTranslator).value,
				namingRules.find(r => r.name === selectedNamingRule).value,
			);
			const results = await Promise.all(varNamesPromiseArray);
			editor.edit(builder => {
				results.forEach(r => {
					if (!r.translation) return;
					builder.replace(r.selection, r.translation);
				})
			});
		} catch (err) {
			vscode.window.showErrorMessage(err.message);
		}
	});
	subscriptions.push(variablePreferredHandler);

	const setPreferredNamingRuleHandler = vscode.commands.registerCommand(
		'randvar.setPreferredNamingRule',
		setPreferredNamingRule
	);
	subscriptions.push(setPreferredNamingRuleHandler);

	const setPreferredTranslatorHandler = vscode.commands.registerCommand(
		'randvar.setPreferredTranslator',
		setPreferredTranslator,
	);
	subscriptions.push(setPreferredTranslatorHandler);
}

// this method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}
