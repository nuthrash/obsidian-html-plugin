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
		
		const contentDiv = this.contentEl.createDiv();
		
		// Unrestricted Mode
		if( this.settings.opMode === HtmlPluginOpMode.Unrestricted ) {
			const fragment = (new Range()).createContextualFragment(htmlStr);
			
			contentDiv.appendChild( fragment );
			dispatchEvent(new CustomEvent("DOMContentLoaded")); // patch from gildas-lormeau
			
			return;
		}
		
		const parserW = new window.DOMParser();
		
		contentDiv.setAttribute( 'style', 'transform: scale(1);' );
		const shadow = contentDiv.attachShadow( {mode: 'open'} );
		shadow.addEventListener( 'click', sdFixAnchorClickHandler );
		
		// Low Restricted Mode
		if( this.settings.opMode === HtmlPluginOpMode.LowRestricted ) {
			const domLR = parserW.parseFromString(htmlStr, 'text/html', { includeShadowRoots: true });
			
			// apply some patches
			applyUserInteractivePatches( domLR );
			await applyShadowDOMPatches( domLR );
			
			shadow.appendChild( domLR.documentElement );			
			return;
		}
		
		
		let domW = null;
		switch( this.settings.opMode ) {
			case HtmlPluginOpMode.Balance:
				domW = parserW.parseFromString( htmlStr, 'text/html', { includeShadowRoots: true } );
				await sanitizeAndApplyPatches( domW );
				break;
			
			case HtmlPluginOpMode.Text:
				const cleanHtmlText = (new window.DOMPurify()).sanitize( htmlStr, textModeConfig );
				domW = parserW.parseFromString( cleanHtmlText, 'text/html', { includeShadowRoots: true } );
				applyUserInteractivePatches( domW );
				break;
				
			case HtmlPluginOpMode.HighRestricted:
				const purifier = new window.DOMPurify();
				// disable some elements to avoid XSS attacks
				purifier.addHook( 'afterSanitizeAttributes' , ohpAfterSanitizeAttributes );
				const cleanHtmlHR = purifier.sanitize( htmlStr, hrModeConfig );
				domW = parserW.parseFromString( cleanHtmlHR, 'text/html', { includeShadowRoots: true } );
				await applyPatches( domW );
				break;
		}
		
		shadow.appendChild( domW.documentElement );
	
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

// while clicking, fix internal links(in-page anchor) replaced by Shadow Root at runtime
function sdFixAnchorClickHandler( evt ) {
	
	for( const elm of evt.composedPath() ) {
		if( elm instanceof HTMLAnchorElement == false )
			continue;
			
		// ignore non-internal link
		if( !elm.href || !elm.hash || elm.hash.length <= 1 )
			continue;
		
		let idInternal = null;
		if( elm.pathname === '/' ) {
			// http://localhost/#xxxxx at Mobile version of Obsidian
			idInternal = decodeURIComponent( elm.hash.slice(1) );
		} else if ( elm.href.startsWith(desktopAppAddr) ) {
			// app://obsidian.md/index.html#xxxxx at Desktop version of Obsidian
			idInternal = decodeURIComponent( elm.hash.slice(1) );
		}
		const targetElm = elm.getRootNode().getElementById( idInternal );
		if( targetElm ) {
			// but this method could not trigger the :target CSS pseudo-class event
			targetElm.scrollIntoView();
		}
		
		return; // all done
	}
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

function applyUserInteractivePatches( doc: HTMLDocument ) {
	// avoid some HTML files unable to scroll, only when 'overflow' is not set
	if( doc.body.style.overflow === '' )
		doc.body.style.overflow = 'auto';
	// avoid some HTML files unable to select text, only when 'user-select' is not set
	if( doc.body.style.userSelect === '' )
		doc.body.style.userSelect = 'text';
}

async function cutCssVariables( doc: HTMLDocument, cssElementName: string, removeVar: boolean ) : Map<string, string> {
	let map = new Map<string, string>();
	
	let allStyles = doc.getElementsByTagName('style');
	if( !allStyles || allStyles.length <= 0 )
		return map;
	
	let removeSet = new Set<CSSStyleDeclaration>();
	Array.from(allStyles).forEach( (styleEle) => {
		try {
			Array.from(styleEle.sheet.cssRules).forEach((rule) => {
				// type 1 is CSSStyleRule https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleRule
				if( rule.type != 1 || !rule.selectorText.contains(cssElementName) )
					return;
					
				// rule.style is CSSStyleDeclaration https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration
				for( const propName of rule.style ) {
					let pn = propName.trim();
					if( !pn.startsWith("--") )
						continue;
					
					if( map.has(pn) ) {
						// latter overwrite previous
						map.delete( pn );
					}
					map.set( pn, rule.style.getPropertyValue(propName).trim() );
					if( removeVar && !removeSet.has(rule.style) )
						removeSet.add( rule.style );
				}
			});
		} catch {
			//ignore different domain of styleSheet.href
		}
	});
	
	// remove old variables and its content
	if( removeVar && removeSet.size > 0 && map.size > 0 ) {
		for( const style of removeSet ) {
			for( const kvp of map ) {
				if( style.cssText.contains(kvp[0]) )
					style.removeProperty( kvp[0] );
			}
		}
	}
	
	return map;
}

async function applyShadowDOMPatches( doc: HTMLDocument ): Promise<void> {
	// fix CSS :root global variables to :host for Shadow DOM
	let cssVars = await cutCssVariables( doc, ":root", true );
	if( cssVars.size > 0  ) {
		const hostVars = Array.from(cssVars).map( cssVar => `${cssVar[0]}: ${cssVar[1]}` ).join('; ');
		const styleEle = doc.createElement( "style" );
		styleEle.textContent = `:host { ${hostVars}; }`;
		doc.body.appendChild( styleEle );
	}
}

// for Balance Mode HtmlPluginOpMode.Balance
async function sanitizeAndApplyPatches( doc: HTMLDocument ) : Promise<void> {
	const cssRootSelector = ":root";
	const cssVars = new Map<string, string>();
	const removeSet = new Set<CSSStyleDeclaration>();
	
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
		
		if( elm instanceof HTMLStyleElement ) {
			try {
				Array.from(elm.sheet.cssRules).forEach((rule) => {
					// type 1 is CSSStyleRule https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleRule
					if( rule.type != 1 || !rule.selectorText.contains(cssRootSelector) )
						return;
						
					// rule.style is CSSStyleDeclaration https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration
					for( const propName of rule.style ) {
						let pn = propName.trim();
						
						if( !pn.startsWith("--") )
							continue;
						
						if( cssVars.has(pn) ) {
							// latter overwrite previous
							cssVars.delete( pn );
						}
						cssVars.set( pn, rule.style.getPropertyValue(propName).trim() );
						if( !removeSet.has(rule.style) )
							removeSet.add( rule.style );
					}
				});
			} catch {
				//ignore different domain of styleSheet.href
			}
		} else if( elm instanceof HTMLAnchorElement ) {
			// ESLint 
			if( elm.target === '_blank') {
				if( !elm.rel.contains('noopener') )
					elm.rel += ' noopener';
				if( !elm.rel.contains('noreferrer') )
					elm.rel += ' noreferrer';
			}
			
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
		}else if( elm instanceof HTMLIFrameElement ) {
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
	
	// from SingleFile
	// <meta http-equiv=content-security-policy content="default-src 'none'; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self' data:; script-src 'unsafe-inline' data:; object-src 'self' data:;">
	
	const cspElm = doc.createElement( 'meta' );
	cspElm.setAttribute( 'http-equiv', "Content-Security-Policy" );
	cspElm.setAttribute( 'content', "script-src 'none'; require-trusted-types-for 'script'; object-src 'none'; frame-src https: http: mediastream: blob:" ); // disallow all scripts...
	doc.head.appendChild( cspElm ); // CSP must be placed inside <head> on Obsidian platform
	
	
	applyUserInteractivePatches( doc );		
	
	// remove old variables and its content
	if( removeSet.size > 0 && cssVars.size > 0 ) {
		for( const style of removeSet ) {
			for( const kvp of cssVars ) {
				if( style.cssText.contains(kvp[0]) )
					style.removeProperty( kvp[0] );
			}
		}
	}
	
	// move CSS :root global variables to :host for Shadow DOM
	if( cssVars.size > 0  ) {
		const hostVars = Array.from(cssVars).map( cssVar => `${cssVar[0]}: ${cssVar[1]}` ).join('; ');
		const styleEle = doc.createElement( "style" );
		styleEle.textContent = `:host { ${hostVars}; }`;
		doc.body.appendChild( styleEle );
	}
}

// for High Restricted Mode HtmlPluginOpMode.HighRestricted
async function applyPatches( doc: HTMLDocument ): Promise<void> {

	applyUserInteractivePatches( doc );

	await applyShadowDOMPatches( doc );
	
	// ESLint 
	Array.from(doc.links).forEach( (ele) => {
		if( ele.instanceOf(HTMLAnchorElement) && ele.getAttribute("target") === "_blank" )
			ele.setAttribute( "rel", "noreferrer noopener" );
	});
	
	// CSP
	const cspElm = doc.createElement( 'meta' );
	cspElm.setAttribute( 'http-equiv', "Content-Security-Policy" );
	cspElm.setAttribute( 'content', "default-src 'none'; script-src 'none'; object-src 'none'; frame-src https: http: mediastream: blob:; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self' data:; " ); // disallow all scripts, objects...
	doc.head.appendChild( cspElm ); // CSP must be placed inside <head> on Obsidian platform
}

const desktopAppAddr = "app://obsidian.md/index.html#";

// https://github.com/cure53/DOMPurify
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/dompurify/index.d.ts
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
	// mathML
	'accent', 'accentunder', 'bevelled', 'close', 'columnsalign', 'columnlines', 'columnspan', 'denomalign', 'depth', 'displaystyle', 'encoding', 'fence', 'frame', 'largeop', 'length', 'linethickness', 'lspace', 'lquote', 'mathbackground', 'mathcolor', 'mathsize', 'mathvariant', 'maxsize', 'minsize', 'movablelimits', 'notation', 'numalign', 'open', 'rowalign', 'rowlines', 'rowspacing', 'rowspan', 'rspace', 'rquote', 'scriptlevel', 'scriptminsize', 'scriptsizemultiplier', 'selection', 'separator', 'separators', 'stretchy', 'subscriptshift', 'supscriptshift', 'symmetric', 'voffset',
	// XML
	'xlink:href', 'xml:id', 'xlink:title', 'xml:space', 'xmlns:xlink',

	// default allowed attributes by this plugin
	'async', 'charset', 'collapse', 'collapsed', 'content', 'data', 'defer', 'external', 'frameborder', 'http-equiv', 'property', 'sandbox', 'scoped', 'scrolling', 'shadowroot', 'text', 'url', 'var',
	'aria-*', 'data-*', 'href-*', 'src-*', 'style-*',
];

