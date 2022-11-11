# Obsidian HTML reader Plugin

This is a plugin for Obsidian (https://obsidian.md). Can open document with `.html`  and `.htm` file extensions.

- [Obsidian HTML Reader Plugin](#obsidian-html-reader-plugin)
  - [How to use](#how-to-use)
  - [Install this plugin from Obsidian](#install-this-plugin-from-obsidian)
  - [Manually installing the plugin](#manually-installing-the-plugin)
  - [How to build this plugin from source code](#how-to-build-this-plugin-from-source-code)
  - [Known issues](#known-issues)

## How to use

1. Put .html or .htm files to any obsidian-html-plugin installed vault folder
2. Click any HTML or HTM item to open it
3. Reading

## Install this plugin from Obsidian

1. Head to "Settings" ⇨ "Community plugins" options page, make sure "Restricted mode" is turned off.
2. Click `Browse` button to open Community plugins browsing dialog.
3. Search for this plugin "**HTML Reader**" and click the corresponding result item.
4. Click `Install` button to install this plugin.
5. Once installed, click `Enable` button to enable this plugin.
6. Or, enable this plugin "**HTML Reader**" from the "Installed plugins" list of "Community plugins" options page.

## Manually installing the plugin

1. Copy the `main.js` and `manifest.json` files to your vault `<path>/<to>/<vaultFolder>/.obsidian/plugins/obsidian-html-plugin/`.
2. Relaunch Obsidian.
3. Head to "Settings" ⇨ "Community plugins" options page, make sure "Restricted mode" is turned off and enable this plugin "**HTML Reader**" from the "Installed plugins" list.


## How to build this plugin from source code

1. Clone this project to your system.
2. Under the local project folder, key the command `npm i` to install necessary packages.(You need Node.js installed on your development environment)
3. Then run `npm run dev` would build the plugin files.

## Known issues

- Cannot see local image files like `<img src="./image1.jpg" />` or `<img src="file:///C:/image1.jpg" />`
  - This is Obsidian's constraint, it disallow to directly access local files through HTML code.
  - One of the possible remedy ways is re-save the HTML file as a complete HTML file by dedicated browser extensions such as "[SingleFile](https://github.com/gildas-lormeau/SingleFile)", it can save a complete page (with CSS, images, fonts, frames, etc.) as a single HTML file. After got the complete HTML file, put it to obsidian-html-plugin installed vault folder then open it, you would see all images.
  - Another remedy way is add `app://local/` or `app://local//` prefix string to `src` attribute by hands(refer to "[Allow embed of Local images using `![](file:///...)`](https://forum.obsidian.md/t/allow-embed-of-local-images-using-file/1990/4)"). However, this workaround code would be sanitized out when using version 1.0.1 ~ 1.0.3 of obsidian-html-plugin, you shall take obsidian-html-plugin 1.0.0 or 1.0.4+ to make it work.

- After some .html files were opened, they look like blank pages and cannot see original contents.
  - In fact, currently (after 1.0.4), this plugin can handle only some kinds of HTML files:
    1. Standard [HTML5](https://html.spec.whatwg.org/) files
    2. Compressed HTML-like files made by [SingleFileZ](https://github.com/gildas-lormeau/SingleFileZ)
  - Therefore, when open unsupported file format, this plugin would notice related messages or show an almost blank page.
  - "open document with `.html`  and `.htm` file extensions" is the description written for end-users without technical background. It doesn't mean this plugin can open all kinds of files with .html or .htm file extensions, especially when the file actually is other document type but renamed to .html or .htm file extension.
  - If you want to open an ePub file, you shall install "ePub Reader" plugin to open it, instead rename it to xxx.html then ask why this plugin cannot open it.

- Some HTML elements disappeared
  - That might be caused by:
    1. Removed by HTML Sanitization mechanism
    2. Hide or become invisible
  - You could try to manually install obsidian-html-plugin 1.0.0 to see if the disappeared HTML elements become visibile. If YES, you could create a new issue in [Issues page](https://github.com/nuthrash/obsidian-html-plugin/issues) to let me know, and I will discuss it with you.
  - If you still cannot see the disappeared HTML elements after installing obsidian-html-plugin 1.0.0, that means they were hide or became invisible. This situation often occurs when the HTML element use some advanced features like "[Declarative Shadow DOM](https://web.dev/declarative-shadow-dom/)" (this feature has been supported after verion 1.0.4) and this plugin or Obsidian not supported yet. Then, you could create a new issue in [Issues page](https://github.com/nuthrash/obsidian-html-plugin/issues) to let me know, and I will discuss it with you.

- Almost all script code cannot work
  - That might be caused by:
    1. Blocked by HTML loading procedure
    2. Removed by HTML Sanitization mechanism
  - Obsidian's developer team is very concern about XSS attacks, so they want plugin developers follow this [tip](https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md#avoid-innerhtml-outerhtml-and-insertadjacenthtml) to prevent XSS attacks. Therefore, almost all script code resident inside `<script>` in the HTML file would be blocked, and the external script files are the same.
  - Meanwhile, HTML Sanitization mechanism would sanitize potential XSS code more deeper. So, the code such as `<... onload="alert(1)">` would be removed.

