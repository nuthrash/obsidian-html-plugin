import { App, PluginSettingTab, Setting, TFolder, Vault } from "obsidian";
import HtmlPlugin from "./HtmlPlugin";
import { HtmlPluginOpMode, OP_MODE_INFO_DATA, OP_MODE_INFO_HTML } from "./HtmlPluginOpMode";

export interface HtmlPluginSettings {
	bgColorEnabled: boolean;
	bgColor: string; // Hex strings are 6-digit hash-prefixed rgb strings in lowercase form.
	opMode: HtmlPluginOpMode;
	zoomByWheelAndGesture: boolean;
	zoomValue: number;
	extraFileExt: string;
}

export const DEFAULT_SETTINGS: HtmlPluginSettings = {
	bgColorEnabled: false,
	bgColor: "#ffffff",
	opMode: HtmlPluginOpMode.Balance,
	zoomByWheelAndGesture: true,
	zoomValue: 1.0,
	extraFileExt: '',
}

export class HtmlSettingTab extends PluginSettingTab {
	app: App;
	plugin: HtmlPlugin;
	opModeInfoFrag: DocumentFragment;

	constructor(app: App, plugin: HtmlPlugin) {
		super(app, plugin);
		this.app = app;
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h1', { text: 'HTML Reader Settings' });
		containerEl.createEl('pre', { text: '※ Remember to reload the file after changing any setting.'})
						.setAttribute('style', 'color:red');
			
		// ----- General Settings -----
		containerEl.createEl('h2', { text: 'General Settings' });

		// ----- General Settings: Operating Mode -----
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
		
		// ----- General Settings: Background Color -----
		const bgColorSetting = new Setting(containerEl);
		bgColorSetting
			.setName("Background Color")
			.setDesc("Set HTML <body> element background color forcely.")
			.addColorPicker((picker) => {
				picker
					.setValue(this.plugin.settings.bgColor)
					.onChange( async (newColor: string) => {
						this.plugin.settings.bgColor = newColor;
						await this.plugin.saveSettings();
					});
			})
			.addToggle( (toggle) => {
				toggle
					.setValue(this.plugin.settings.bgColorEnabled)
					.onChange( async (enabled: boolean) => {
						this.plugin.settings.bgColorEnabled = enabled;
						await this.plugin.saveSettings();
					});
			});
		
		// ----- General Settings: Extra File Extensions -----
		const extraFileExtSetting = new Setting(containerEl);
		extraFileExtSetting
			.setName("Extra File Extensions")
			.setDesc("Open HTML format files with user defined file extensions (list of comma separated strings). Change this setting may cause other plugins un-workable, so you shall know very clearly what you are doing. Remember to relaunch the Obsidian app after change this setting!")
			.addText((val) =>
				val
					.setValue(this.plugin.settings.extraFileExt)
					.setPlaceholder("e.g. xhtml, htm123")
					.onChange( async (value: string) => {
						this.plugin.settings.extraFileExt = value;
						await this.plugin.saveSettings();
					})
      );
		
		// ----- HotKeys and Touch Gestures Settings -----
		containerEl.createEl('h2', { text: 'HotKeys and Touch Gestures Settings' });
		containerEl.createEl('small', { text: `Almost all keyboard hotkeys are taken from Obsidian's global hotkey settings, so you shall modify them via ⚙"Settings" ⇨ "Hotkeys" options page.` });
		
		this.buildHotkeySettings();
		
		new Setting(containerEl)
			.setName( 'Quick document zoom in and out' )
			.setDesc( 'Zoom the document using Ctrl + Wheel (zoom in: ↑, zoom out: ↓), or using the trackpad/touch screen/touch panel two-finger pinch-zoom gesture (zoom in: ← →, zoom out: → ←).' )
			.addToggle( (toggle) => {
				toggle
					.setValue(this.plugin.settings.zoomByWheelAndGesture)
					.onChange( async (enabled: boolean) => {
						this.plugin.settings.zoomByWheelAndGesture = enabled;
						await this.plugin.saveSettings();
					});
			});
		
	}
	
	buildHotkeySettings(): void {
		const { containerEl } = this;
		
		// default hotkeys: app.commands.commands app.hotkeyManager.defaultKeys
		// custom hotkeys: app.hotkeyManager.customKeys
		
		let gSearch = this.app.hotkeyManager.getHotkeys('editor:open-search') || this.app.hotkeyManager.getDefaultHotkeys('editor:open-search');
		const hkSearch = new Setting(containerEl);
		hkSearch
			.setName( "Search document text" )
			// .setDesc( `${this.app.commands.findCommand("editor:open-search").name}` )
			.setDesc( `Search current file.` );
			
		let hotkeyPairs = [
			{ elm: hkSearch, settings: gSearch } 
		];
			
		if( !this.app.isMobile ) {
			// following Hotkey settings would not appear on Mobile platforms!!
			
			let gZoomIn = this.app.hotkeyManager.getHotkeys('window:zoom-in') || this.app.hotkeyManager.getDefaultHotkeys('window:zoom-in');
			const hkZoomIn = new Setting(containerEl)
								.setName( "Zoom in document" )
								.setDesc( `Zoom in current file.` );
			hotkeyPairs.push( { elm: hkZoomIn, settings: gZoomIn } );
			
			let gZoomOut = this.app.hotkeyManager.getHotkeys('window:zoom-out') || this.app.hotkeyManager.getDefaultHotkeys('window:zoom-out');
			const hkZoomOut = new Setting(containerEl)
								.setName( "Zoom out document" )
								.setDesc( `Zoom out current file.` );
			hotkeyPairs.push( { elm: hkZoomOut, settings: gZoomOut } );
								
			let gZoomReset = this.app.hotkeyManager.getHotkeys('window:reset-zoom') || this.app.hotkeyManager.getDefaultHotkeys('window:reset-zoom');
			const hkZoomReset = new Setting(containerEl)
								.setName( "Reset document zoom" )
								.setDesc( `Reset current file zoom.` );
			hotkeyPairs.push( { elm: hkZoomReset, settings: gZoomReset } );
		}
							
		for( let pair of hotkeyPairs ) {
			if( pair.settings && pair.settings.length > 0 ) {
				for( let i = 0; i < pair.settings.length; ++i ) {
					if( i >= 2 ) {
						// only show first two hotkeys
						let eps = pair.elm.controlEl.createEl('span');
						eps.textContent = '...';
						break;
					}
					
					let hk = pair.settings[i];
					pair.elm.addButton( (btn) => {
						if( hk.modifiers && hk.modifiers.length > 0 )
							btn.setButtonText( `${this.toNativeModifierString(hk.modifiers, hk.key)}` );
						else
							btn.setButtonText( `${hk.key}` );
						btn.setDisabled( true );
					});
				}
			} else {
				pair.elm.addButton( (btn) => {
					btn.setButtonText( `Blank` );
					// btn.setButtonText( `${i18next.t("setting.hotkeys.label-blank-hotkey")}` );
					btn.setDisabled( true );
				});
			}
		}
		
	}
	
	toNativeModifierString( modifiers: Modifier[], key: string ): string {
		if( isMacPlatform() || isIosPlatform() ) {
			return modifiers.join('')
					.replace( 'Mod', '⌘' ).replace( 'Meta', '⌘' )
					.replace( 'Shift', '⇧' ).replace( 'Alt', '⌥' )
					.replace( 'Ctrl', '^' ).concat( key );
		} else {
			return modifiers.join( ' + ' ).replace( 'Mod', 'Ctrl' ).replace( 'Meta', 'Win' ).concat( ` + ${key}` );
		}
	}
}

// https://forum.obsidian.md/t/identify-platform-operating-system/27878/3
export function isMacPlatform(): boolean {
	const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
	if( macosPlatforms.indexOf(window.navigator.platform) !== -1 )
		return true;
	return false;
}
export function isIosPlatform(): boolean {
	const iosPlatforms = ['iPhone', 'iPad', 'iPod'];
	const userAgent = window.navigator.userAgent;
	for( let plat of iosPlatforms )
		if( userAgent.contains(plat) )
			return true;
	return false;
}

