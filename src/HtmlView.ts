import { WorkspaceLeaf, FileView, TFile, moment } from "obsidian";
import DOMPurify from 'dompurify';

export const HTML_FILE_EXTENSIONS = ["html", "htm"];
export const VIEW_TYPE_HTML = "html-view";
export const ICON_HTML = "doc-html";

export class HtmlView extends FileView {
  allowNoFile: false;

  constructor(leaf: WorkspaceLeaf, private settings: HtmlPluginSettings) {
    super(leaf);
  }
  
  async onLoadFile(file: TFile): Promise<void> {
    // const style = getComputedStyle(this.containerEl.parentElement.querySelector('div.view-header'));
    // const width = parseFloat(style.width);
    // const height = parseFloat(style.height);
    // const tocOffset = height < width ? height : 0;
	
	this.contentEl.empty();
	
	try {
		// whole HTML file strings
		const contents = await this.app.vault.read(file);
		
		// Obsidian's HTMLElement and Node API: https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
		// Note: some failed trials
		//   1. jsdom, xmldom's DOMParser: error. not Node type...
		//   2. ReactDOM: extra unnecessary elements would display.
		
		// https://github.com/cure53/DOMPurify
		// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/dompurify/index.d.ts
		const purifyConfig = {
			RETURN_DOM: true,        // return DOM object 
			WHOLE_DOCUMENT: true,    // include <html>
			
			// Default TAGs ATTRIBUTEs allow list & blocklist https://github.com/cure53/DOMPurify/wiki/Default-TAGs-ATTRIBUTEs-allow-list-&-blocklist
			// allowed tags https://github.com/cure53/DOMPurify/blob/main/src/tags.js
			ADD_TAGS: ['link'],  // allow external css files
			// allowed attributes https://github.com/cure53/DOMPurify/blob/main/src/attrs.js
		};
		
		DOMPurify.addHook('afterSanitizeAttributes', function (node) {
			if(node.nodeName) {
				switch(node.nodeName) {
					// disable some interactive elements to avoid XSS attacks
					// case 'INPUT':
					// case 'BUTTON':
					// case 'TEXTAREA':
					// case 'SELECT':
						// node.setAttribute('disabled', 'disabled');
						// break;
						
					case 'BODY':
						// avoid some HTML files unable to scroll, only when 'overflow' is not set
						if( node.style.overflow === '' )
							node.style.overflow = 'auto';
						
						// avoid some HTML files unable to select text, only when 'user-select' is not set
						if( node.style.userSelect === '' )
							node.style.userSelect = 'text';
						break;
				}
			}
		});
		
		const cleanDom = DOMPurify.sanitize( contents, purifyConfig );
		this.contentEl.appendChild( cleanDom );
		DOMPurify.removeHook( 'afterSanitizeAttributes' );
		
		// const cleanContents = DOMPurify.sanitize(contents); // sanitize HTML, svg, MathML codes to string
		// this.contentEl.insertAdjacentHTML("beforeend", cleanContents);
		// this.contentEl.setHTML(cleanContents); // not supported yet, need Chrome 105+(maybe obsidian 0.20+ ?)
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

export async function showError(e: Error): Promise<void> {
    const notice = new Notice("", 8000);
	// @ts-ignore
	notice.noticeEl.innerHTML = `<b>HTML reader Error</b>:<br/>${e.message}`;
}
