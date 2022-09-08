import { addIcon, Plugin, WorkspaceLeaf } from 'obsidian';
import { HtmlPluginSettings, HtmlSettingTab, DEFAULT_SETTINGS } from './HtmlPluginSettings';
import { HtmlView, HTML_FILE_EXTENSIONS, ICON_HTML, VIEW_TYPE_HTML } from './HtmlView';

export default class HtmlPlugin extends Plugin {
	settings: HtmlPluginSettings;

	async onload() {
		await this.loadSettings();

		// Add your own icon: https://marcus.se.net/obsidian-plugin-docs/user-interface/icons#add-your-own-icon
		/*
		addIcon(ICON_HTML, `<circle cx="50" cy="50" r="50" fill="currentColor" />`);
		*/

		this.registerView(VIEW_TYPE_HTML, (leaf: WorkspaceLeaf) => {
			return new HtmlView(leaf, this.settings);
		});

		try {
			this.registerExtensions(HTML_FILE_EXTENSIONS, VIEW_TYPE_HTML);
		} catch (error) {
			console.log(`Existing file extensions ${HTML_FILE_EXTENSIONS}`);
		}

		this.addSettingTab(new HtmlSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}