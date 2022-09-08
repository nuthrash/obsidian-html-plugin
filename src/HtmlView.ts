import { WorkspaceLeaf, FileView, TFile, moment } from "obsidian";

export const HTML_FILE_EXTENSIONS = ["html", "htm"];
export const VIEW_TYPE_HTML = "html-view";
export const ICON_HTML = "doc-html";

export class HtmlView extends FileView {
  allowNoFile: false;

  constructor(leaf: WorkspaceLeaf, private settings: HtmlPluginSettings) {
    super(leaf);
  }
  
  async onLoadFile(file: TFile): Promise<void> {
    
    this.contentEl.empty();
    // const style = getComputedStyle(this.containerEl.parentElement.querySelector('div.view-header'));
    // const width = parseFloat(style.width);
    // const height = parseFloat(style.height);
    // const tocOffset = height < width ? height : 0;
	
	try {
		// whole HTML file strings
		const contents = await this.app.vault.adapter.read(file.path);
		
		// Obsidian's HTMLElement and Node API: https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
		// Note: some failed trials
		//   1. xmldom's DOMParser: error. not Node type...
		//   2. ReactDOM: extra unnecessary elements would display.
		var tmp = this.contentEl.createDiv();  // createEl('div');
		tmp.innerHTML = contents;
		this.contentEl.appendChild(tmp.firstChild);
	} catch (error) {
		showError(error);
	}
  }

  onunload(): void {
  }

  canAcceptExtension(extension: string) {
    return HTML_FILE_EXTENSIONS.includes(extension);
  }

  getViewType() {
    return VIEW_TYPE_HTML;
  }

  getIcon() {
    // built-in icons list: https://forum.obsidian.md/t/list-of-available-icons-for-component-seticon/16332
    return "code-glyph";  // </>
  }
}

export function showError(e: Error): void {
    const notice = new Notice("", 8000);
	// @ts-ignore
	notice.noticeEl.innerHTML = `<b>HTML reader Error</b>:<br/>${e.message}`;
}
