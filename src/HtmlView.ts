import { WorkspaceLeaf, FileView, TFile, sanitizeHTMLToDom } from "obsidian";
import { HtmlPluginSettings, HtmlPluginOpMode, isMacPlatform, DEFAULT_SETTINGS } from './HtmlPluginSettings';
import { HtmlPluginOpMode } from './HtmlPluginOpMode';

import { extract } from "single-filez-core/processors/compression/compression-extract.js";
import * as zip from  '@zip.js/zip.js';
import Mark from 'mark.js';
import NP from 'number-precision'

export const HTML_FILE_EXTENSIONS = ["html", "htm"];
export const VIEW_TYPE_HTML = "html-view";
export const ICON_HTML = "doc-html";


export class HtmlView extends FileView {
	settings: HtmlPluginSettings;
	mainView: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private settings: HtmlPluginSettings) {
		super(leaf);
		this.settings = settings;
	}
  
	async onLoadFile(file: TFile): Promise<void> {
		// const style = getComputedStyle(this.containerEl.parentElement.querySelector('div.view-header'));
		// const width = parseFloat(style.width);
		// const height = parseFloat(style.height);
		// const tocOffset = height < width ? height : 0;
	
		this.contentEl.empty();
	
		try {
			// whole HTML file ArrayBuffer
			const contents = await this.app.vault.readBinary(file);
			
			// Obsidian's HTMLElement and Node API: https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
			
			let htmlStr = null;
			
			try {
				// the HTML file made by SingleFileZ
				globalThis.zip = zip;
				const { docContent } = await extract(new Blob([new Uint8Array(contents)]), { noBlobURL: true });
				
				htmlStr = docContent;
			} catch {
				// the HTML file not made by SingleFileZ			
				const decoder = new TextDecoder();
				htmlStr = decoder.decode(contents); // decode with UTF8
			}
			
			// https://github.com/nefe/number-precision
			NP.enableBoundaryChecking(false); // default param is true
			
			this.mainView = this.contentEl.createDiv();
			this.mainView.setAttribute( "style", "display: flex; flex-direction: column; height: 100%; padding: 0;" );
			this.mainView.innerHTML = MAINVIEW_HTML; // direct assign safe HTML code
			const searchBar = this.mainView.querySelector( "#ohpMainView" );
			const iframe = this.mainView.querySelector( "#ohpIframe" );
			
			let dom = null, applyAnchorFix = true;
			switch( this.settings.opMode ) {
				case HtmlPluginOpMode.Balance:
					dom = (new window.DOMParser()).parseFromString( htmlStr, 'text/html' );
					await removeScriptTagsAndExtScripts( dom );
					await sanitizeAndApplyPatches( dom );
					await restoreStateBySettings( dom, this.settings );
					//iframe.sandbox = "allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-top-navigation-by-user-activation";
					iframe.csp = "script-src 'none'; require-trusted-types-for 'script'; object-src 'none'; frame-src https: http: mediastream: blob:;";
					iframe.srcdoc = dom.documentElement.outerHTML;
					break;
				
				case HtmlPluginOpMode.LowRestricted:
					dom = (new window.DOMParser()).parseFromString( htmlStr, 'text/html' );
					await removeScriptTagsAndExtScripts( dom );
					await restoreStateBySettings( dom, this.settings );
					iframe.srcdoc = dom.documentElement.outerHTML;
					break;
				
				case HtmlPluginOpMode.Unrestricted:
					iframe.srcdoc = htmlStr;
					break;
				
				case HtmlPluginOpMode.HighRestricted:
					const purifier = new window.DOMPurify();
					purifier.addHook( 'afterSanitizeAttributes' , ohpAfterSanitizeAttributes ); // disable some elements to avoid XSS attacks
					const cleanHtmlHR = purifier.sanitize( htmlStr, hrModeConfig );
					// iframe.sandbox = "allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-top-navigation-by-user-activation";
					iframe.csp = "default-src 'none'; script-src 'none'; object-src 'none'; frame-src https: http: mediastream: blob:; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self' data:; "; 
					iframe.srcdoc = cleanHtmlHR;
					break;
									
				case HtmlPluginOpMode.Text:
					const cleanHtmlText = (new window.DOMPurify()).sanitize( htmlStr, textModeConfig );
					iframe.sandbox = "allow-same-origin";
					iframe.csp = "default-src 'none'; script-src 'none'; object-src 'none'; frame-src 'none'; font-src 'self' data:; img-src 'none'; style-src 'unsafe-inline'; media-src 'none'; ";
					iframe.srcdoc = cleanHtmlText;
					applyAnchorFix = false
					break;
			}
				
			iframe.mainView = this.mainView;
			this.mainView.app = this.app;
			this.mainView.settings = this.settings;
			this.mainView.searchBar = searchBar;
			this.mainView.iframe = iframe;
			iframe.onload = async function() {
				if( applyAnchorFix ) {
					// fix some behaviors for consistency with Shadow DOM and Obsidian
					applyUserInteractivePatches( iframe.contentDocument );
					await modifyAnchorTarget( iframe.contentDocument );
					iframe.contentWindow.addEventListener( 'click', sdFixAnchorClickHandler );
				}
				
				await restoreStateBySettings( iframe.contentWindow.document, iframe.mainView.settings );
				buildUserInteractiveFacilities( iframe.mainView );
			};
			
			dispatchEvent(new CustomEvent("DOMContentLoaded"));
		
		} catch (error) {
			showError(error);
		}
	}

	onunload(): void {
	}
	
	onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
		if( source !== 'more-options' ) // only handle 'more-options' onMoreOptionsMenu()
			return;

		menu.addItem((item) => {
			item
				.setTitle( i18next.t("interface.menu.find") )
				.setIcon( "lucide-search" )
				.onClick(async () => {
					this.mainView.openSearch();
				} );
		});
		menu.addItem((item) => {
			item
				.setTitle( i18next.t("commands.zoom-in") )
				.setIcon( "plus-with-circle" )
				.onClick( async () => {
					 this.mainView.ZoomIn();
				} );
		});
		menu.addItem((item) => {
			item
				.setTitle( i18next.t("commands.zoom-out") )
				.setIcon( "minus-with-circle" )
				.onClick( async () => {
					 this.mainView.ZoomOut();
				} );
		});
		menu.addItem((item) => {
			item
				.setTitle( i18next.t("commands.reset-zoom") )
				.setIcon( "reset" )
				.onClick( async () => {
					 this.mainView.ResetZoom();
				} );
		});
		
		menu.addSeparator();
		super.onPaneMenu(menu, source);
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
	notice.noticeEl.createEl('strong', { text: 'HTML Reader error' });
	notice.noticeEl.createDiv({ text: `${e.message}` });
}

// while clicking, fix internal links(in-page anchor) replaced by Shadow Root and IFrame at runtime
function sdFixAnchorClickHandler( evt ) {
	
	const aElm = evt.composedPath().find( elm => elm.nodeName === 'A' );
	const regex = /href\s*=\s*['"]\s*#/igm; // Regex for checking <a href="#xxx">
	
	// ignore non-internal link
	if( !aElm || !aElm.href || !regex.test(aElm.outerHTML) )
		return;
	
	const rootNode = aElm.getRootNode();
	if( !aElm.hash || aElm.hash.length <= 1 ) {
		// aElm.hash may be empty when hash == "#"
		if( rootNode.location )
			rootNode.location.hash = '#';
		else
			rootNode.scrollTop = 0;
	} else {
		const idInternal = decodeURIComponent( aElm.hash.slice(1) );
		const targetElm = rootNode.getElementById( idInternal );
		if( targetElm ) {
			if( rootNode.location ) {
				rootNode.location.hash = idInternal;
			} else {
				// this method could not trigger the :target CSS pseudo-class event
				targetElm.scrollIntoView();
			}
		}
	}
	
	evt.preventDefault();
}

// for High Restricted Mode HtmlPluginOpMode.HighRestricted DOMPurify
function ohpAfterSanitizeAttributes( node ) {
	if( !node.nodeName )
		return;
		
	switch(node.nodeName) {
		case 'INPUT':
		case 'BUTTON':
		case 'TEXTAREA':
		case 'SELECT':
		case 'OPTION':
			node.setAttribute('readOnly', 'true');
			node.setAttribute('disabled', 'disabled');
			break;
			
		case 'IFRAME':
			// force apply all restrictions
			node.setAttribute('sandbox', '');
			break;
	}
}

// for Balance Mode HtmlPluginOpMode.Balance
async function sanitizeAndApplyPatches( doc: HTMLDocument ): Promise<void> {
	for( const elm of doc.all ) {
		let illSet = new Set<string>();
		for( const attr of elm.attributes ) {
			let name = attr.name;
			if( name.indexOf('-') > 0 )
				name = `${name.split('-')[0]}-*`;
				
			if( !BM_ALLOWED_ATTRS.contains(name) && !illSet.has(attr.name) )
				illSet.add( attr.name );
		}
		
		for( const attrName of illSet ) {
			elm.removeAttribute( attrName );
		}
		
		if( elm instanceof HTMLAnchorElement ) {
			// ESLint
			/*			
			if( elm.target === '_blank') {
				if( !elm.rel.contains('noopener') )
					elm.rel += ' noopener';
				if( !elm.rel.contains('noreferrer') )
					elm.rel += ' noreferrer';
			}
			*/
			
			// avoid XSS attack
			if( elm.href && elm.protocol.contains("javascript:") ) {
				elm.setAttribute( 'href', 'javascript:void(0)' );
				elm.setAttribute( 'style', 'cursor: default;' );
			}
		} else if( elm instanceof HTMLInputElement ) {
			// This is ignored if the value of the type attribute is hidden, range, color, checkbox, radio, file, or a button type.
			elm.readOnly = true;
		} else if( elm instanceof HTMLTextAreaElement ) {
			elm.setAttribute( 'disabled', 'disabled' );
		} else if( elm instanceof HTMLIFrameElement ) {
			if( elm.src && elm.src !== "about:blank" ) {
				// avoid XSS attack
				try {
					let url = new URL( elm.src );
					if( url.protocol.contains("javascript:") )
						elm.removeAttribute( 'src' );
				} catch {
					elm.removeAttribute( 'src' );
				}
			}
			
			// force apply all restrictions
			elm.setAttribute( 'sandbox', '' );
		}
	}
}

function applyUserInteractivePatches( doc: HTMLDocument ) {
	if( !doc.body.style ) {
		doc.body.setAttribute( 'style', "overflow: auto; user-select: text;" );
		return;
	}
	
	// avoid some HTML files unable to scroll, only when 'overflow' is not set
	if( doc.body.style.overflow === '' )
		doc.body.style.overflow = 'auto';
	// avoid some HTML files unable to select text, only when 'user-select' is not set
	if( doc.body.style.userSelect === '' )
		doc.body.style.userSelect = 'text';
}

async function removeScriptTagsAndExtScripts( doc: HTMLDocument ): Promise<void> {
	let allNodes = doc.querySelectorAll( 'script' );
	for( var node of allNodes ) {
		node.parentNode.removeChild( node );
	}
	
	allNodes = doc.querySelectorAll( 'link' );
	for( var node of allNodes ) {
		if( !node.rel )
			continue;
		
		if( node.rel.contains('script') )
			node.parentNode.removeChild( node );
		else if( node.rel.contains('preload') && node.as && node.as.contains('script') )
			node.parentNode.removeChild( node );
	}
}

async function modifyAnchorTarget( doc: HTMLDocument ): Promise<void> {
	let baseElm = doc.querySelector( 'base' );
	if( !baseElm ) {
		baseElm = doc.createElement( 'base' );
		doc.head.appendChild( baseElm );
	}
	
	// force modify <base>'s target to "_blank" for IFrame
	baseElm.target = "_blank";
		
	const regex = /href\s*=\s*['"]\s*#/igm; // Regex for checking <a href="#xxx">
	// force modify <a>'s target to "_blank" for IFrame
	const aElms = doc.querySelectorAll( 'a' );
	for( const aElm of aElms ) {
		if( aElm.target === '_self' )
			aElm.target = '_blank';
			
		if( !aElm.href )
			continue;
			
		// internal links are prefix with follow:
		// 1. app://obsidian.md/index.html#xxxxx at Desktop version of Obsidian
		// 2. http://localhost/#xxxxx at Mobile version of Obsidian
		if( !regex.test(aElm.outerHTML) ) {
			// external links
			if( !aElm.rel ) {
				aElm.rel = "noopener noreferrer";
			} else {
				if( !aElm.rel.contains('noopener') )
					aElm.rel += ' noopener';
				if( !aElm.rel.contains('noreferrer') )
					aElm.rel += ' noreferrer';
			}
		}
	}
}

async function restoreStateBySettings( doc: HTMLDocument, settings: HtmlPluginSettings ): Promise<void> {
	doc.body.style.transformOrigin = "left top"; // CSS transform-origin
	doc.body.style.transform = `scale(${settings.zoomValue})`;
}

function isUnselectableElement( elm: HTMLElement ): boolean {
	var style = getComputedStyle(elm);
	return ((style.display === 'none') || (elm.offsetWidth === 0))
}

let isMacPlat = isMacPlatform();
function mapNativeHotkeys( app: App, cmdId: string ): Hotkey[] {
	let ohks = app.hotkeyManager.getHotkeys(cmdId) || app.hotkeyManager.getDefaultHotkeys(cmdId);

	const nhks: Hotkey[] = [];
	if( !ohks || ohks.length <= 0 )
		return nhks;
		
	const nhksNoMod: Hotkey[] = [];
	for( let ohk of ohks ) {
		const hk = new Hotkey();
		hk.key = ohk.key;
		hk.modifiers = [];
		if( ohk.modifiers && ohk.modifiers.length > 0 ) {
			for( let mod of ohk.modifiers ) {
				if( mod === 'Mod' ) {
					// replace Obsidian's Mod modifier string to native platform's modifier
					hk.modifiers.push( isMacPlat ? 'Meta' : 'Ctrl' );
				} else {
					hk.modifiers.push( mod );
				}
			}
			nhks.push( hk );
		} else {
			nhksNoMod.push( hk );
		}
	}
	
	return nhks.concat(nhksNoMod); 
}

function checkHotkeyModifier( modifiers: Modifier[], evt: KeyboardEvent | MouseEvent ): boolean {
	if( !modifiers || modifiers.length <= 0 )
		return true;
	
	// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState
	// https://w3c.github.io/uievents-key/#keys-modifier
	// https://github.com/obsidianmd/obsidian-api/blob/bceb489fc25ceba5973119d6e57759d64850f90d/obsidian.d.ts#L2498
	for( let mod of modifiers ) {
		switch( mod ) {
			case 'Ctrl': // Ctrl = Ctrl key for every OS
				if( !evt.ctrlKey )
					return false;
				break;
			case 'Meta': // Meta = Cmd on MacOS and Win key on other OS
				// This key value is used for the "Windows Logo" key and the Apple Command or ⌘ key. 
				if( !evt.metaKey )
					return false;
				break;
			case 'Shift':
				if( !evt.shiftKey )
					return false;
				break;
			case 'Alt':
				if( !evt.altKey ) // This key value is also used for the Apple Option key. 
					return false;
				break;
			case 'Mod': // Mod = Cmd on MacOS and Ctrl on other OS
				if( isMacPlat ? !evt.metaKey : !evt.ctrlKey)
					return false;
				break;
		}
	}
	return true;
}

async function buildUserInteractiveFacilities( mainView: HTMLElement ): Promise<void> {
	const searchBar: HTMLElement = mainView.searchBar;
	const iframe: HTMLElement = mainView.iframe;
	const settings: HtmlPluginSettings = mainView.settings;
	
	let isSearchBarVisible: boolean = false, hltAllNodes: boolean = false;
	let curText: string;
	let curIndex: number = -1;
	
	const allMatched = []; // array of array of mark element(s)
	const tmpMatched = []; // array of temp. mark elements for combining later
	const mark = new Mark( iframe.contentWindow.document.body );
	const addMatched = (node) => {
		if( isUnselectableElement(node.parentElement) )
			return;
		
		if( node.textContent && node.textContent.length != curText.length ) {
			if( tmpMatched.length <= 0 ) {
				tmpMatched.push( new Array(node) );
				return;
			}
			
			// check existed tmpMatched array
			let tmpText = "";
			for( let idx = 0; idx < tmpMatched.length; ++idx ) {
				tmpText += tmpMatched[idx].textContent;
				let tmpText2 = tmpText + node.textContent;
				if( tmpText2.length === curText.length ) {
					if( tmpText2.toLowerCase() === curText ) {
						// found all matched elements, then put them to allMatched
						let tmpMA = [];
						for( let i = 0; i <= idx; ++i )
							tmpMA.push( tmpMatched[i] );
							
						tmpMA.push( node );
						allMatched.push( tmpMA );
					} 
					
					// remove compared elements
					for( let i = 0; i <= idx; ++i )
						tmpMatched.shift();
					break;
				}
			}
		} else {
			allMatched.push( new Array(node) );
		}
	}
	const obsOpt = { 
		"element": "span",
		"className": `ohp-temp-search-class ${HIGHLIGHT_CLASS_NAME}`,
		"separateWordSearch": false,
		"acrossElements": true,
		"each" : addMatched
	};
	const tmpOpt = { 
		"element": "span",
		"className": `ohp-temp-search-class`,
		"separateWordSearch": false,
		"acrossElements": true,
		"each" : addMatched
	};
	
	const clearObsMark = (array) => {
		if( !array || array.length <= 0 ) 
			return;
		
		for( let elm of array ) {
			if( elm.classList.contains( HIGHLIGHT_CLASS_NAME ) )
				elm.classList.remove( HIGHLIGHT_CLASS_NAME );
				// elm.classList.toggle( HIGHLIGHT_CLASS_NAME );
		}
	};
	const setObsMark = (array) => {
		if( !array || array.length <= 0 ) 
			return;
			
		for( let elm of array ) {
			if( !elm.classList.contains( HIGHLIGHT_CLASS_NAME ) )
				elm.classList.add( HIGHLIGHT_CLASS_NAME );
		}
	};
	const clearAllMarks = (includeTags) => {
		if( includeTags ) {
			mark.unmark( obsOpt );
			mark.unmark( tmpOpt );
			hltAllNodes = false;
		} else {
			for( const elm of allMatched ) {
				clearObsMark( elm );
			}
		}
		hltAllNodes = false;
	};
	const setAllMarks = (includeObs) => {
		if( allMatched.length <= 0 ) {
			if( includeObs )
				mark.mark( curText, obsOpt );
			else
				mark.mark( curText, tmpOpt );
		} else if( includeObs ) {
			for( const elm of allMatched ) {
				setObsMark( elm );
			}
		}
		
		if( allMatched.length > 0 )
			hltAllNodes = true;
	};
	const toggleInputError = (showError) => {
		if( showError ) {
			clearAllMarks( true );
			if( !input.classList.contains( "mod-no-match" ) )
				input.classList.add( "mod-no-match" );
		} else {
			if( input.classList.contains( "mod-no-match" ) )
				input.classList.remove( "mod-no-match" );
		}
	};
	const findNext = () => {
		if( hltAllNodes )
			clearAllMarks( false );
			
		// no matched
		if( !curText || allMatched.length <= 0 )
			return;
		
		// unmark old node
		if( curIndex >= 0 && curIndex < allMatched.length )
			clearObsMark( allMatched[curIndex] );
		
		if( curIndex + 1 >= allMatched.length )
			curIndex = 0;
		else
			curIndex++;
			
		setObsMark( allMatched[curIndex] );
		(allMatched[curIndex])[0].scrollIntoView( { behavior: 'smooth', block: 'center' } );
	};
	const findPrev = () => {
		if( hltAllNodes )
			clearAllMarks( false );
		 
		// no matched
		if( !curText || allMatched.length <= 0 )
			return;
		
		// unmark old node
		if( curIndex >= 0 && curIndex < allMatched.length )
			clearObsMark( allMatched[curIndex] );
		
		if( curIndex - 1 < 0 )
			curIndex = allMatched.length - 1;
		else
			curIndex--;
		
		setObsMark( allMatched[curIndex] );
		(allMatched[curIndex])[0].scrollIntoView( { behavior: 'smooth', block: 'center' } );
	};
	
	// mark all searching text with tmpOpt/obsOpt
	const findAll = (text, markAll, selObj) => {
		clearAllMarks( true );
		
		allMatched.length = 0; // clear array to empty
		tmpMatched.length = 0;
		curText = text;
		if( markAll )
			mark.mark( curText, obsOpt );
		else 
			mark.mark( curText, tmpOpt );
			
		if( allMatched.length <= 0 ) {
			toggleInputError( true ); // found nothing
		} else {
			// update curIndex
			if( curIndex > allMatched.length )
				curIndex = allMatched.length - 1;
			else if( selObj && selObj.anchorNode ) {
				// select nearest element as curIndex
				const sibNode = selObj.anchorNode.nextElementSibling || selObj.anchorNode.parentElement;
				if( sibNode && sibNode.nodeName === 'SPAN' && sibNode.classList.contains('ohp-temp-search-class') ) {
					for( let idx = 0; idx < allMatched.length; ++idx ) {
						for( let node of allMatched[idx] ) {
							if( node.isSameNode(sibNode) ) { // found next node
								if( idx >= 1 )
									curIndex = idx - 1;
								else 
									curIndex = idx;
								return;
							}
						}
					}
				}
			}
		}
	};
	
	const checkAndUpdateMatches = () => {
		let newText = input.value.trim().toLowerCase();
		if( newText === curText )
			return;
		
		// newText !== curText, so update related bookkeeping data
		toggleInputError( false );
		if( !newText ) {
			// newText is null or an empty string
			clearAllMarks( true );
		} else {
			findAll( newText, false );
		}
		curText = newText;
	};
	
	const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
	iframe.contentWindow.focus();
	
	// add MenuItem polyfill methods
	mainView.openSearch = () => {
		searchBar.style.display = 'inherit'; // show Search box
		isSearchBarVisible = true;
		input.focus();
		
		let newText = curText;
		const selObj = iframe.contentWindow.getSelection();
		if( selObj ) // get selected text for newText
			newText = selObj.toString().trim().toLowerCase();
		
		let reIndex = false;
		if( newText && newText !== curText ) {
			findAll( newText, false, selObj );
			reIndex = true;
		}			
		
		if( !curText )
			return;
		
		input.value = curText;
		if( reIndex ) {
			// search new text
			findNext();
			return;
		}
		
		if( hltAllNodes ) {
			setAllMarks( true );
		} else if( curIndex >= 0 && curIndex < allMatched.length ) {
			setObsMark( allMatched[curIndex] );
			(allMatched[curIndex])[0].scrollIntoView( { behavior: 'smooth', block: 'center' } );
		}
	};
	mainView.ZoomIn = () => {
		settings.zoomValue = NP.plus( settings.zoomValue, 0.1 );
		iframeDoc.body.style.transform = `scale(${settings.zoomValue})`;
		iframe.contentWindow.focus();
	};
	mainView.ZoomOut = () => {
		let scaleValue = NP.minus( settings.zoomValue, 0.1 );
		if( scaleValue <= 0.1 )
			scaleValue = 0.1;
		settings.zoomValue = scaleValue;
		iframeDoc.body.style.transform = `scale(${settings.zoomValue})`;
		iframe.contentWindow.focus();
	};
	mainView.ResetZoom = () => {
		settings.zoomValue = 1.0;
		iframeDoc.body.style.transform = `scale(${settings.zoomValue})`;
		iframe.contentWindow.focus();
	};
	
	// build hotkeys from Obsidian's global hotkeys settings
	const hksSearch = mapNativeHotkeys( mainView.app, 'editor:open-search' );
	const hksZoomIn = mapNativeHotkeys( mainView.app, 'window:zoom-in' );
	const hksZoomOut = mapNativeHotkeys( mainView.app, 'window:zoom-out' );
	const hksResetZoom = mapNativeHotkeys( mainView.app, 'window:reset-zoom' );
	
	// add event handlers
	const input = searchBar.querySelector( '#ohpSearchInput' );
	input.addEventListener( 'keyup', (evt) => {
		if( (evt.altKey && evt.keyCode === 13) ) { // handle "select all" command when press Alt+Enter
			sall.click();
		}		
		else if( evt.keyCode === 13 ) { // when press Enter key then perform search next
			next.click();
		}
	} );
	const next = searchBar.querySelector( '#ohpSearchNext' );
	next.addEventListener( 'click', (evt) => {
		checkAndUpdateMatches();
		findNext();
	} );
	const prev = searchBar.querySelector( '#ohpSearchPrev' );
	prev.addEventListener( 'click', (evt) => {
		checkAndUpdateMatches();
		findPrev();
	} );
	const sall = searchBar.querySelector( '#ohpSearchSelectAll' );
	sall.addEventListener( 'click', (evt) => {
		checkAndUpdateMatches();
		if( !curText ) {
			clearAllMarks( true );
		} else {
			setAllMarks( true );
		}
	} );
	const exit = searchBar.querySelector( '#ohpSearchExit' );
	exit.addEventListener( 'click', (evt) => {
		// clear highlight marks, but keep curText and tmp class
		let preAllNodes = hltAllNodes;
		clearAllMarks( false );
		hltAllNodes = preAllNodes;
		
		searchBar.style.display = 'none'; // hide Search box
		isSearchBarVisible = false;
		iframe.contentWindow.focus();
	} );
	searchBar.addEventListener( 'keydown', (evt) => {
		if( evt.shiftKey && evt.keyCode === 114 ) {
			// search previous Shift+F3
			prev.click();
		}
		
		// else if( evt.keyCode === 114 ) {
		else if( evt.key === 'F3' ) {
			// search next F3
			next.click();
		}
		else if( evt.key === 'Escape' ) {
			// close search box
			exit.click();
		}
	} );
	
	iframe.contentWindow.addEventListener( 'keydown', (evt) => {
		if( evt.shiftKey && evt.keyCode === 114 ) {
			// search previous Shift+F3
			if( isSearchBarVisible )
				prev.click();
		}		
		else if( evt.altKey && evt.keyCode === 13 ) {
			// search select all Alt+Enter
			if( isSearchBarVisible )
				sall.click();
		}
		else if( evt.key === 'F3' ) {
			// search next F3
			if( isSearchBarVisible )
				next.click();
		}	
		else if( evt.key === 'Escape' ) {
			// close search bar
			if( isSearchBarVisible )
				exit.click();
		}
		
		else {
			// ignore Mod keys
			switch( evt.key ) {
				case 'Control':
				case 'Meta':
				case 'Shift':
				case 'Alt':
					return;
			}
			
			const ek = evt.key.toUpperCase();
			// match other
			if( hksSearch && hksSearch.length > 0 ) {
				for( let hk of hksSearch ) {
					if( checkHotkeyModifier(hk.modifiers, evt) && ek === hk.key ) {
						evt.preventDefault();
						mainView.openSearch();
						return;
					}
				}
			}
			
			if( hksZoomIn && hksZoomIn.length > 0 ) {
				for( let hk of hksZoomIn ) {
					if( checkHotkeyModifier(hk.modifiers, evt) && ek === hk.key ) {
						evt.preventDefault();
						mainView.ZoomIn();
						return;
					}
				}
			}
			
			if( hksZoomOut && hksZoomOut.length > 0 ) {
				for( let hk of hksZoomOut ) {
					if( checkHotkeyModifier(hk.modifiers, evt) && ek === hk.key ) {
						evt.preventDefault();
						mainView.ZoomOut();
						return;
					}
				}
			}
			
			if( hksResetZoom && hksResetZoom.length > 0 ) {
				for( let hk of hksResetZoom ) {
					if( checkHotkeyModifier(hk.modifiers, evt) && evt.key === hk.key ) {
						evt.preventDefault();
						mainView.ResetZoom();
						return;
					}
				}
			}
		}
	});
	
	// insert HIGHLIGHT_STYLE into HTMLDocument
	let hlt_style = iframe.contentDocument.createElement( 'style' );
	hlt_style.textContent = HIGHLIGHT_STYLE;
	if( iframe.contentDocument.body.children.length > 0 )
		iframe.contentDocument.body.insertBefore( hlt_style, iframe.contentDocument.body.children[0] );
	else
		iframe.contentDocument.body.appendChild( hlt_style );


	if( !settings.zoomByWheelAndGesture )
		return;
		
	// settings.zoomByWheelAndGesture is enabled
	iframe.contentWindow.addEventListener( 'wheel', (evt) => {
		if( !evt.ctrlKey )
			return;
		
		evt.preventDefault(); // prevent scrolling page	
		
		const cy = evt.clientY, py = evt.pageY, delta = evt.deltaY;
		let origPy = NP.divide( py, settings.zoomValue );
		if( delta < 0 )
			mainView.ZoomIn();
		else if( delta > 0 )
			mainView.ZoomOut();
		
		if( py > cy ) {
			iframe.contentWindow.scroll( { top: NP.minus(NP.times(origPy, settings.zoomValue), cy), behavior: "auto",} );
		}
	}, { passive: false });
	
	// cal. distance between two touch points
	const getTouchDistance = (touches) => {
		const touch1 = touches[0];
		const touch2 = touches[1];
		const dx = NP.minus(touch1.clientX, touch2.clientX);
		const dy = NP.minus(touch1.clientY, touch2.clientY);
		return Math.sqrt(dx * dx + dy * dy);
	};
	
	// let pointX: number = 0, pointY: number = 0, mouseX: number, mouseY: number;
	let pinchStartDistance: number = 0, pinchPageY: number = 0, pinchClientY = 0;
	let touchMoving: number = 0;
	iframe.contentWindow.addEventListener( 'touchstart', (evt) => {
		// only handle two finger gesture
		if( evt.touches.length === 2 ) {
			evt.preventDefault(); // prevent touchstart event
			pinchStartDistance = getTouchDistance( evt.touches );
			// set pinch start page/client y
			pinchClientY = NP.divide( NP.plus(evt.touches[0].clientY, evt.touches[1].clientY), 2 );
			pinchPageY =  NP.divide( NP.plus(evt.touches[0].pageY, evt.touches[1].pageY), 2 );
		}
	}, { passive: false });
	
	iframe.contentWindow.addEventListener( 'touchmove', (evt) => {
		if( evt.touches.length !== 2 ) // TouchEvent
			return;
			
		if( evt.cancelable ) {
			evt.preventDefault();
			evt.stopPropagation();
		}
		if( touchMoving++ !== 3 )
			return;
		touchMoving++;
		
		const pinchDistance = getTouchDistance( evt.touches );
		const cy = pinchClientY, py = pinchPageY;
		let origPy = NP.divide( py, settings.zoomValue );
		if( pinchDistance > pinchStartDistance ) {
			mainView.ZoomIn();
		} else if( pinchDistance < pinchStartDistance ) {
			mainView.ZoomOut();
		}
		pinchStartDistance = pinchDistance;

		if( py > cy ) {
			pinchPageY = NP.times( origPy, settings.zoomValue );
			iframe.contentWindow.scroll( { top: NP.minus( pinchPageY, cy ), behavior: "auto", } );
		}
		
		touchMoving = 0;
	}, { passive: false });
}


// https://github.com/obsidianmd/obsidian-api/blob/bceb489fc25ceba5973119d6e57759d64850f90d/obsidian.d.ts#LL1555C18-L1555C25
class Hotkey {
	// https://github.com/obsidianmd/obsidian-api/blob/bceb489fc25ceba5973119d6e57759d64850f90d/obsidian.d.ts#L2498
	public modifiers: Modifier[];
	public key: string;
}

const desktopAppAddr: string = "app://obsidian.md/index.html#";

// const HIGHLIGHT_CLASS_NAME: string = 'obsidian-search-match-highlight';
const HIGHLIGHT_CLASS_NAME: string = 'obsidian-search-match-mark'; // block mark for across elements
const MARK_CLASS_NAME: string = 'obsidian-search-match-mark'; // block mark for across elements

const MAINVIEW_HTML: string = `
<div class="document-search-container" style="display: none; border: none; width: 100%" width="100%" id="ohpMainView">
  <div class="document-search">
    <input class="document-search-input" type="search" placeholder="${i18next.t("editor.search.placeholder-find")}" id="ohpSearchInput">
    <div class="document-search-buttons">
      <button class="document-search-button" aria-label="${isMacPlat ? "⇧F3" : "Shift + F3"}" aria-label-position="top" id="ohpSearchPrev">${i18next.t("editor.search.label-previous")}</button>
      <button class="document-search-button" aria-label="F3" aria-label-position="top" id="ohpSearchNext">${i18next.t("editor.search.label-next")}</button>
      <button class="document-search-button" aria-label="${isMacPlat ? "⌥Enter" : "Alt + Enter"}" aria-label-position="top" id="ohpSearchSelectAll">${i18next.t("editor.search.label-all")}</button>
	  <span class="document-search-close-button" aria-label="${i18next.t("editor.search.label-exit-search")}" aria-label-position="top" id="ohpSearchExit"></span>
    </div>
  </div>
</div>

<iframe style="border: none; flex-grow: 1; width: 100%; overflow: hidden;" loading="eager" margin="0" padding="0"  width="100%" height="100%" id="ohpIframe">
</iframe>
`;

const HIGHLIGHT_STYLE: string = `

  span.obsidian-search-match-highlight {
    box-shadow: 0 0 0px 3px hsl(254, 80%, 68%);
    mix-blend-mode: darken;
	border-radius: 2px;
  }
  span.obsidian-search-match-mark {
    background-color: mark;
    color: marktext;
	border-radius: 2px;
  }

`;

// https://github.com/cure53/DOMPurify
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/dompurify/index.d.ts
// for Text Mode HtmlPluginOpMode.Text
const textModeConfig = {
	WHOLE_DOCUMENT: true,
	
	// Default TAGs ATTRIBUTEs allow list & blocklist https://github.com/cure53/DOMPurify/wiki/Default-TAGs-ATTRIBUTEs-allow-list-&-blocklist
	// allowed tags https://github.com/cure53/DOMPurify/blob/main/src/tags.js
	
	ADD_TAGS: [ 'meta', 'noscript', 'slot' ],
	FORBID_TAGS: [ 'a', 'area', 'audio', 'button', 'canvas', 'datalist', 'img', 'input', 'map', 'menu', 'menuitem', 'nobr', 'object', 'picture', 'source', 'style', 'textarea', 'track', 'video',
		// 'svg',
	],
	
	// allowed attributes https://github.com/cure53/DOMPurify/blob/main/src/attrs.js

	ADD_ATTR: [ 'target', 'charset', 'contenteditable', 'dirname', 'http-equiv', 'sandbox', 'wrap', 'shadowroot', ],
	FORBID_ATTR: [ 'accept', 'action', 'autopictureinpicture', 'autoplay', 'background', 'capture', 'controls', 'controlslist', 'crossorigin', 'decoding', 'default', 'download', 'href', 'hreflang', 'inputmode', 'integrity', 'ismap', 'loop', 'media', 'method', 'novalidate', 'pattern', 'playsinline', 'poster', 'preload', 'spellcheck', 'shape', 'sizes', 'src', 'style', 'type', 'usemap', ],
	
	CUSTOM_ELEMENT_HANDLING: {
		tagNameCheck: (tagName) => tagName, // allow all tags with custom element format "xxx-yyy"
		attributeNameCheck: null, // default / standard attribute allow-list is used
		allowCustomizedBuiltInElements: true, // customized built-ins are allowed
	},
	
	// the USE_PROFILES setting will override the ALLOWED_TAGS setting so don't use them together
	USE_PROFILES: {html: true},
};

// for High Restricted Mode HtmlPluginOpMode.HighRestricted
const hrModeConfig = {
	WHOLE_DOCUMENT: true,
	ADD_TAGS: [ 'link', 'meta', 'slot' ],
	ADD_ATTR: [ 'charset', 'content', 'http-equiv', 'sandbox', 'shadowroot' ],
	ADD_DATA_URI_TAGS: ['a', 'area', 'img', 'link'],
	
	// allow external protocol handlers in URL attributes (default is false, be careful, XSS risk)
	// by default only http, https, ftp, ftps, tel, mailto, callto, cid and xmpp are allowed.
	// ALLOW_UNKNOWN_PROTOCOLS: true,
	ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|app):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
	// extend the existing array of elements that are safe for URI-like values (be careful, XSS risk)
	//ADD_URI_SAFE_ATTR: ['my-attr']
	
	CUSTOM_ELEMENT_HANDLING: {
		tagNameCheck: (tagName) => tagName, // allow all tags with custom element format "xxx-yyy"
		attributeNameCheck: null, // default / standard attribute allow-list is used
		allowCustomizedBuiltInElements: true, // customized built-ins are allowed
	},
};

// for Balance Mode HtmlPluginOpMode.Balance
export const BM_ALLOWED_ATTRS = [
	// default allowed attributes of sanitize-html
	'center', 'target',

	// extra allowed attributes from DOMPurify
	// https://github.com/cure53/DOMPurify/blob/main/src/attrs.js
	'accept', 'action', 'align', 'alt', 'autocapitalize', 'autocomplete', 'autopictureinpicture', 'autoplay', 'background', 'bgcolor', 'border', 'capture', 'cellpadding', 'cellspacing', 'checked', 'cite', 'class', 'clear', 'color', 'cols', 'colspan', 'controls', 'controlslist', 'coords', 'crossorigin', 'datetime', 'decoding', 'default', 'dir', 'disabled', 'disablepictureinpicture',   'disableremoteplayback', 'download', 'draggable', 'enctype', 'enterkeyhint', 'face', 'for', 'headers', 'height', 'hidden', 'high', 'href', 'hreflang', 'id', 'inputmode', 'integrity', 'ismap','kind', 'label', 'lang', 'list', 'loading', 'loop', 'low', 'max', 'maxlength', 'media', 'method', 'min','minlength', 'multiple', 'muted', 'name', 'nonce', 'noshade', 'novalidate', 'nowrap', 'open', 'optimum', 'pattern', 'placeholder', 'playsinline', 'poster', 'preload', 'pubdate', 'radiogroup', 'readonly', 'rel', 'required', 'rev', 'reversed', 'role', 'rows', 'rowspan', 'spellcheck', 'scope', 'selected', 'shape',  'size', 'sizes', 'span', 'srclang', 'start', 'src', 'srcset', 'step', 'style', 'summary',  'tabindex', 'title', 'translate', 'type', 'usemap', 'valign', 'value', 'width', 'xmlns', 'slot',
	// SVG
	'accent-height', 'accumulate', 'additive', 'alignment-baseline', 'ascent', 'attributename',  'attributetype', 'azimuth', 'basefrequency', 'baseline-shift', 'begin', 'bias', 'by', 'class', 'clip', 'clippathunits', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile', 'color-rendering', 'cx', 'cy', 'd', 'dx', 'dy', 'diffuseconstant', 'direction', 'display', 'divisor', 'dur', 'edgemode', 'elevation', 'end', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'filterunits', 'flood-color','flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'fx', 'fy', 'g1', 'g2', 'glyph-name', 'glyphref', 'gradientunits', 'gradienttransform', 'image-rendering', 'in', 'in2', 'k', 'k1', 'k2', 'k3', 'k4', 'kerning', 'keypoints', 'keysplines', 'keytimes', 'lengthadjust', 'letter-spacing', 'kernelmatrix', 'kernelunitlength', 'lighting-color', 'local', 'marker-end', 'marker-mid', 'marker-start', 'markerheight', 'markerunits', 'markerwidth', 'maskcontentunits', 'maskunits', 'mask', 'mode', 'numoctaves', 'offset', 'operator', 'opacity', 'order', 'orient', 'orientation', 'origin', 'overflow', 'paint-order', 'path', 'pathlength', 'patterncontentunits', 'patterntransform', 'patternunits', 'points', 'preservealpha', 'preserveaspectratio', 'primitiveunits', 'r', 'rx', 'ry', 'radius', 'refx', 'refy',  'repeatcount', 'repeatdur', 'restart', 'result', 'rotate', 'scale', 'seed', 'shape-rendering', 'specularconstant', 'specularexponent', 'spreadmethod', 'startoffset', 'stddeviation', 'stitchtiles', 'stop-color', 'stop-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke', 'stroke-width', 'surfacescale', 'systemlanguage', 'tabindex', 'targetx', 'targety', 'transform', 'transform-origin', 'text-anchor', 'text-decoration', 'text-rendering', 'textlength', 'u1', 'u2', 'unicode', 'values', 'viewbox', 'visibility', 'version', 'vert-adv-y', 'vert-origin-x', 'vert-origin-y', 'word-spacing', 'wrap', 'writing-mode', 'xchannelselector', 'ychannelselector', 'x', 'x1', 'x2', 'y', 'y1', 'y2', 'z', 'zoomandpan',
	// mathML is not supported by Obsidian/Chrome/Chromium, ref: https://caniuse.com/mathml
	//'accent', 'accentunder', 'bevelled', 'close', 'columnsalign', 'columnlines', 'columnspan', 'denomalign', 'depth', 'displaystyle', 'encoding', 'fence', 'frame', 'largeop', 'length', 'linethickness', 'lspace', 'lquote', 'mathbackground', 'mathcolor', 'mathsize', 'mathvariant', 'maxsize', 'minsize', 'movablelimits', 'notation', 'numalign', 'open', 'rowalign', 'rowlines', 'rowspacing', 'rowspan', 'rspace', 'rquote', 'scriptlevel', 'scriptminsize', 'scriptsizemultiplier', 'selection', 'separator', 'separators', 'stretchy', 'subscriptshift', 'supscriptshift', 'symmetric', 'voffset',
	// XML
	'xlink:href', 'xml:id', 'xlink:title', 'xml:space', 'xmlns:xlink',

	// default allowed attributes by this plugin
	'async', 'charset', 'collapse', 'collapsed', 'content', 'data', 'defer', 'external', 'frameborder', 'http-equiv', 'property', 'sandbox', 'scoped', 'scrolling', 'shadowroot', 'text', 'url', 'var',
	'aria-*', 'data-*', 'href-*', 'src-*', 'style-*',
];

