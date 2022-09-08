import { App, PluginSettingTab, Setting, TFolder, Vault } from "obsidian";
import HtmlPlugin from "./HtmlPlugin";

export interface HtmlPluginSettings {
	tags: string;
}

export const DEFAULT_SETTINGS: HtmlPluginSettings = {
	tags: 'notes/htmlnotes'
}

export class HtmlSettingTab extends PluginSettingTab {
	plugin: HtmlPlugin;

	constructor(app: App, plugin: HtmlPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'HTML Settings' });

		new Setting(containerEl)
			.setName("Tags")
			.setDesc("Tags added to new note metadata.")
			.addText(text => {
				text.inputEl.size = 50;
				text
					.setValue(this.plugin.settings.tags)
					.onChange(async (value) => {
						this.plugin.settings.tags = value;
						await this.plugin.saveSettings();
					})
			});
	}
}
