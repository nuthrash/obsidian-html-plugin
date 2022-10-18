import { addIcon, Plugin, WorkspaceLeaf } from 'obsidian';
import { HtmlView, showError, HTML_FILE_EXTENSIONS, ICON_HTML, VIEW_TYPE_HTML } from './HtmlView';

export default class HtmlPlugin extends Plugin {
	async onload() {

		// Add your own icon: https://marcus.se.net/obsidian-plugin-docs/user-interface/icons#add-your-own-icon
		/*
		addIcon(ICON_HTML, `<circle cx="50" cy="50" r="50" fill="currentColor" />`);
		*/

		this.registerView(VIEW_TYPE_HTML, (leaf: WorkspaceLeaf) => {
			return new HtmlView(leaf);
		});

		try {
			this.registerExtensions(HTML_FILE_EXTENSIONS, VIEW_TYPE_HTML);
		} catch (error) {
			await showError(`File extensions ${HTML_FILE_EXTENSIONS} had been registered by other plugin!`);
		}
	}

	onunload() {
	}
}