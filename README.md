# Obsidian HTML reader Plugin

This is a plugin for Obsidian (https://obsidian.md). Can open document with `.html`  and `.htm` file extensions.

- [Obsidian HTML Reader Plugin](#obsidian-html-reader-plugin)
  - [How to use](#how-to-use)
  - [Manually installing the plugin](#manually-installing-the-plugin)
  - [How to build this plugin from source code](#how-to-build-this-plugin-from-source-code)
  - [Known issues](#known-issues)

## How to use

1. Put .html or .htm files to any obsidian-html-plugin installed vault folder
2. Click any HTML or HTM item to open it
3. Reading


## Manually installing the plugin

1. Copy the `main.js` and `manifest.json` files to your vault `<path>/<to>/<vaultFolder>/.obsidian/plugins/obsidian-html-plugin/`.
2. Relaunch Obsidian.
3. Head to "Settings" ⇨ "Community plugins", make sure "Restricted mode" is turned off and enable this plugin "**HTML Reader**" from the "Installed plugins" list.


## How to build this plugin from source code

1. Clone this project to your system.
2. Under the local project folder, key the command `npm i` to install necessary packages.(You need Node.js installed on your development environment)
3. Then run `npm run dev` would build the plugin files.

## Known issues

- Cannot see local image files like `<img src="./image1.jpg" />` or `<img src="file:///C:/image1.jpg" />`
  - This is Obsidian's constraint, it disallow to directly access local files through HTML code.
  - One of the remedy ways is re-save the HTML file as a complete HTML file by dedicated browser extensions such as "[SingleFile](https://github.com/gildas-lormeau/SingleFile)", it can save a complete page (with CSS, images, fonts, frames, etc.) as a single HTML file. After got the complete HTML file, put it to obsidian-html-plugin installed vault folder then open it, you would see all images.
