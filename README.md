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
  - Another remedy way is add `app://local/` or `app://local//` prefix string to `src` attribute by hands(refer to "[Allow embed of Local images using `![](file:///...)`](https://forum.obsidian.md/t/allow-embed-of-local-images-using-file/1990/4)"). However, this workaround code would be sanitized out after version 1.0.1 of obsidian-html-plugin, you shall take obsidian-html-plugin 1.0.0 to make it work.
