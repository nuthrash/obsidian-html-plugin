import { App, PluginSettingTab, Setting, TFolder, Vault } from "obsidian";
import HtmlPlugin from "./HtmlPlugin";
import { HtmlPluginOpMode, OP_MODE_INFO_DATA, OP_MODE_INFO_HTML } from "./HtmlPluginOpMode";

export interface HtmlPluginSettings {
	opMode: HtmlPluginOpMode;
}

export const DEFAULT_SETTINGS: HtmlPluginSettings = {
	opMode: HtmlPluginOpMode.Balance,
}

export class HtmlSettingTab extends PluginSettingTab {
	plugin: HtmlPlugin;
	opModeInfoFrag: DocumentFragment;

	constructor(app: App, plugin: HtmlPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'HTML Reader Settings' });

		const opModeSetting = new Setting(containerEl);
		opModeSetting
			.setName("Operating Mode")
			.setDesc("Set operating mode for this plugin to protect user and app.")
			.addDropdown( (dropdown) => {
				dropdown.addOptions(OP_MODE_INFO_DATA);
				dropdown
					.setValue(this.plugin.settings.opMode)
					.onChange( async (opMode) => {
						this.plugin.settings.opMode = opMode;
						await this.plugin.saveSettings();
					});
			});
			
		if( !this.opModeInfoFrag || this.opModeInfoFrag.childNodes.length <= 0 ) {
			this.opModeInfoFrag = (new Range()).createContextualFragment(OP_MODE_INFO_HTML);
		}
		
		opModeSetting.infoEl.appendChild( this.opModeInfoFrag.cloneNode(true) );
	}
}


