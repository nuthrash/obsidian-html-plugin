import { WorkspaceLeaf, FileView, TFile, sanitizeHTMLToDom } from "obsidian";

import { extract } from "single-filez-core/processors/compression/compression-extract.js";
import * as zip from  '@zip.js/zip.js';

export const HTML_FILE_EXTENSIONS = ["html", "htm"];
export const VIEW_TYPE_HTML = "html-view";
export const ICON_HTML = "doc-html";


export class HtmlView extends FileView {
  allowNoFile: false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
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
			
		// using Obsidian's internal DOMParser to build Declarative Shadow DOM
		const domW = (new window.DOMParser()).parseFromString(htmlStr, 'text/html', { includeShadowRoots: true });
		
		await sanitizeAndApplyPatches( domW );
		
		const contentDiv = this.contentEl.createDiv();
		
		// using Shadow DOM element and CSS style attr. to isolate the contents of HTML file to avoid CSS Style Pollution
		contentDiv.setAttribute( 'style', 'transform: scale(1);' );
		let shadow = contentDiv.attachShadow({mode: 'open'});
		
		// while clicking, fix internal links(in-page anchor) replaced by Shadow Root at runtime
		shadow.addEventListener('click', (evt) => {	
					for( const elm of evt.composedPath() ) {
						if( elm instanceof HTMLAnchorElement == false )
							continue;
							
						// ignore non-internal link
						if( !elm.href || !elm.hash || elm.hash.length <= 1 )
							continue;
						
						let idInteral = null;
						if( elm.pathname === '/' ) {
							// http://localhost/#xxxxx at Mobile version of Obsidian
							idInteral = decodeURIComponent( elm.hash.slice(1) );
						} else if ( elm.href.startsWith(desktopAppAddr) ) {
							// app://obsidian.md/index.html#xxxxx at Desktop version of Obsidian
							idInteral = decodeURIComponent( elm.href.slice(desktopAppAddr.length) );
						}
						
						const targetElm = elm.getRootNode().getElementById( idInteral );
						if( targetElm )
							targetElm.scrollIntoView();
							
						return; // all done
					}
				});
		
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
				
			if( !ALLOWED_ATTRS.contains(name) && !illSet.has(attr.name) )
				illSet.add( attr.name );
		}
		
		for( const attrName of illSet ) {
			elm.removeAttribute( attrName );
		}
		
		if( elm.instanceOf(HTMLStyleElement) ) {
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
						
						if( !cssVars.has(pn) ) {
							cssVars.set( pn, rule.style.getPropertyValue(propName).trim() );
						}
						if( !removeSet.has(rule.style) )
							removeSet.add( rule.style );
					}
				});
			} catch {
				//ignore different domain of styleSheet.href
			}
		}
		
		
		if( elm.instanceOf(HTMLIFrameElement) ) {
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
		
		if( elm.instanceOf(HTMLAnchorElement) ) {
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
		}
	}
	
	
	const bodyElm = doc.body;
	
	// avoid some HTML files unable to scroll, only when 'overflow' is not set
	if( bodyElm.style.overflow === '' )
		bodyElm.style.overflow = 'auto';
	// avoid some HTML files unable to select text, only when 'user-select' is not set
	if( bodyElm.style.userSelect === '' )
		bodyElm.style.userSelect = 'text';
		
	
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
		bodyElm.appendChild( styleEle );
	}
}

const desktopAppAddr = "app://obsidian.md/index.html#";

export const ALLOWED_ATTRS = [
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

export async function showError(e: Error): Promise<void> {
    const notice = new Notice("", 8000);
	// @ts-ignore
	notice.noticeEl.createEl('strong', { text: 'HTML Reader error' });
	notice.noticeEl.createDiv({ text: `${e.message}` });
}
