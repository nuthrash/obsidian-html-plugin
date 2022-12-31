import { WorkspaceLeaf, FileView, TFile, sanitizeHTMLToDom } from "obsidian";
import { HtmlPluginSettings, HtmlPluginOpMode, DEFAULT_SETTINGS } from './HtmlPluginSettings';
import { HtmlPluginOpMode } from './HtmlPluginOpMode';

import { extract } from "single-filez-core/processors/compression/compression-extract.js";
import * as zip from  '@zip.js/zip.js';

export const HTML_FILE_EXTENSIONS = ["html", "htm"];
export const VIEW_TYPE_HTML = "html-view";
export const ICON_HTML = "doc-html";


export class HtmlView extends FileView {
	settings: HtmlPluginSettings;

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
			
			//const parserW = new window.DOMParser();
			let iframe = this.contentEl.createEl( 'iframe' );
			iframe.setAttribute( "style", "border: none; height: 100%; width: 100%; overflow: hidden;" );
			iframe.loading = "eager";
			
			let dom = null, applyAnchorFix = true;
			switch( this.settings.opMode ) {
				case HtmlPluginOpMode.Balance:
					dom = (new window.DOMParser()).parseFromString( htmlStr, 'text/html' );
					await removeScriptTagsAndExtScripts( dom );
					await sanitizeAndApplyPatches( dom );
					//iframe.sandbox = "allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-top-navigation-by-user-activation";
					iframe.csp = "script-src 'none'; require-trusted-types-for 'script'; object-src 'none'; frame-src https: http: mediastream: blob:;";
					iframe.srcdoc = dom.documentElement.outerHTML;
					break;
				
				case HtmlPluginOpMode.LowRestricted:
					dom = (new window.DOMParser()).parseFromString( htmlStr, 'text/html' );
					await removeScriptTagsAndExtScripts( dom );
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
					iframe.sandbox = ""; // enable all restricted settings
					iframe.csp = "default-src 'none'; font-src 'self' data:; ";
					iframe.srcdoc = cleanHtmlText;
					applyAnchorFix = false
					break;
			}
				
				
			// fix some behaviors for consistency with Shadow DOM and Obsidian
			iframe.onload = async function() {
				if( applyAnchorFix ) {
					applyUserInteractivePatches( iframe.contentDocument );
					await modifyAnchorTarget( iframe.contentDocument );
					iframe.contentWindow.addEventListener( 'click', sdFixAnchorClickHandler );
				}
			};
			
			dispatchEvent(new CustomEvent("DOMContentLoaded"));
		
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

const desktopAppAddr = "app://obsidian.md/index.html#";

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

