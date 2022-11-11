import { WorkspaceLeaf, FileView, TFile, sanitizeHTMLToDom } from "obsidian";
import sanitizeHtml from 'sanitize-html';

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
					
		// https://github.com/apostrophecms/sanitize-html
		// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/sanitize-html/index.d.ts
		const purifyConfig = {
						allowedTags: false,  // allow all tags
						
						// allowedAttributes: false, // allow all attributes // {}, // disallow all attributes
						allowedAttributes: {
							'*': ALLOWED_ATTRS
						},

						allowedClasses: false, // allow all classes
						// allowedStyles: false, // allow all styles
						
						allowedIframeHostnames: false, // allow all Iframe Hostnames ['www.youtube.com', 'player.vimeo.com']

						// default allowed schemes: http, https, ftp, mailto
						allowedSchemes: sanitizeHtml.defaults.allowedSchemes.concat([ 'app', 'callto', 'cid', 'data', 'ftps', 'tel', 'xmpp' ])
					};
		
		const cleanHtml = sanitizeHtml( htmlStr, purifyConfig );
			
		// using Obsidian's internal DOMParser to build Declarative Shadow DOM
		const domW = new window.DOMParser().parseFromString(cleanHtml, 'text/html', { includeShadowRoots: true });
		
		await applyPatches( domW );
		
		const contentDiv = this.contentEl.createDiv();
		
		// using Shadow DOM element and CSS style attr. to isolate the contents of HTML file to avoid CSS Style Pollution
		contentDiv.setAttribute( 'style', 'transform: scale(1);' );
		let shadow = contentDiv.attachShadow({mode: 'open'});
		
		// while clicking, fix internal links(in-place anchor) replaced by Obsidian at runtime
		shadow.addEventListener('click', (event) => {
							const elem = event.target, appAddr = "app://obsidian.md/index.html#";
						
							function scrollAnchorRecursive(node) {
								if( node == null || node.nodeName == null || node.nodeName === "BODY" )
									return;
								
								if( node.nodeName === 'A' ) {
									if( node.href && node.href.startsWith(appAddr) ) {
										const idInteral = decodeURIComponent( node.href.slice(appAddr.length) );
										
										const targetElem = node.getRootNode().getElementById( idInteral );
										if( targetElem )
											targetElem.scrollIntoView();
									}
								} else {
									return scrollAnchorRecursive(node.parentNode);
								}
							}
							
							return scrollAnchorRecursive(elem)
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

// return Map's each item => [0] for variableName, [1] for it's valueContent
async function cutCssVariables( doc: HTMLDocument, cssElementName: string, removeVar: boolean ) : Map<string, string> {
	let map = new Map<string, string>();
	
	// Obsidian's internal DOMParser does not genreate HTMLDocument's styleSheets property,
	// therefore all style sheets shall be collected by other way!
	
	let allStyles = doc.getElementsByTagName('style');
	if( !allStyles || allStyles.length <= 0 )
		return map;
	
	let removeSet = new Set<CSSStyleDeclaration>();
	Array.from(allStyles).forEach( (styleEle) => {
		try {
			Array.from(styleEle.sheet.cssRules).forEach((rule) => {
				// type 1 is CSSStyleRule https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleRule
				if( rule.type != 1 || rule.selectorText !== cssElementName )
					return;
					
				// rule.style is CSSStyleDeclaration https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration
				for( const propName of rule.style ) {
					let pn = propName.trim();
					if( !pn.startsWith("--") )
						continue;
					
					if( !map.has(pn) ) {
						map.set( pn, rule.style.getPropertyValue(propName).trim() );
					}
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

async function applyPatches( doc: HTMLDocument ): Promise<void> {
	const bodyEle = doc.body;
	
	// avoid some HTML files unable to scroll, only when 'overflow' is not set
	if( bodyEle.style.overflow === '' )
		bodyEle.style.overflow = 'auto';
	// avoid some HTML files unable to select text, only when 'user-select' is not set
	if( bodyEle.style.userSelect === '' )
		bodyEle.style.userSelect = 'text';
		
	// fix CSS :root global variables to :host for Shadow DOM
	let cssVars = await cutCssVariables( doc, ":root", true );
	if( cssVars.size > 0  ) {
		const hostVars = Array.from(cssVars).map( cssVar => `${cssVar[0]}: ${cssVar[1]}` ).join('; ') + ";";
		const styleEle = doc.createElement( "style" );
		styleEle.innerText = `:host { ${hostVars} }`;
		bodyEle.appendChild( styleEle );
	}

	// ESLint 
	Array.from(doc.links).forEach( (ele) => {
		if( ele.instanceOf(HTMLAnchorElement) && ele.getAttribute("target") === "_blank" )
			ele.setAttribute( "rel", "noreferrer noopener" );
	});
}

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
	'async', 'charset', 'collapse', 'collapsed', 'content', 'data', 'defer', 'external', 'http-equiv', 'property', 'sandbox', 'scoped', 'shadowroot', 'text', 'url', 'var',
	'aria-*', 'data-*', 'href-*', 'src-*', 'style-*',
];

export async function showError(e: Error): Promise<void> {
    const notice = new Notice("", 8000);
	// @ts-ignore
	notice.noticeEl.createEl('strong', { text: 'HTML Reader error' });
	notice.noticeEl.createDiv({ text: `${e.message}` });
}
