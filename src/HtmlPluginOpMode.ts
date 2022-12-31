
export const enum HtmlPluginOpMode {
	Text = "TextMode",
	HighRestricted = "HighRestrictedMode",
	Balance = "BalanceMode",
	LowRestricted = "LowRestrictedMode",
	Unrestricted = "UnestrictedMode"
}

export const OP_MODE_INFO_DATA: Record<string, string> = {
	[HtmlPluginOpMode.Text]: "Text Mode",
	[HtmlPluginOpMode.HighRestricted]: "High Restricted Mode",
	[HtmlPluginOpMode.Balance]: "Balance Mode",
	[HtmlPluginOpMode.LowRestricted]: "Low Restricted Mode",
	[HtmlPluginOpMode.Unrestricted]: "Unrestricted Mode"
}

export const OP_MODE_INFO_HTML: string = `
<pre><b>※ Remember to reload the file after change the mode.</b></pre>
<style>
  #ophCompTable {
    border: 1px solid var(--table-border-color);
    border-collapse: collapse;
    padding: 5px;
    margin: 5px;
  }
  #ophCompTable caption {
    border: 1px solid var(--table-border-color);
    padding: 5px;
    background: var(--background-primary-alt);
  }
  #ophCompTable th {
    border: 1px solid var(--table-border-color);
    padding: 5px;
    background: var(--background-modifier-hover);
  }
  #ophCompTable td {
    padding: 5px;
    text-align: center;
  }
  #ophCompTable span {
    font-weight: bold;
    float: right;
  }
  
  code {
    background: var(--code-background);
    font-family: -apple-system, BlinkMacSystemFont, var(--font-monospace);
  }  
</style>
<table id="ophCompTable">
  <caption>Comparison<br></caption>
  <thead>
  <tr>
	<th> </th>
	<th>Images</th>
	<th>Styles</th>
	<th>Scripting</th>
	<th>DSD<sup>*</sup></th>
	<th>CSP<sup>#</sup></th>
	<th>HTML Sanitization</th>
	<th>Isolated</th>
  </tr>
  </thead>
  <tbody>
  <tr>
	<td><span> Text Mode </span></td>
	<td> No </td>
	<td> No </td>
	<td> No </td>
	<td> Yes </td>
	<td> Yes </td>
	<td> Yes </td>
	<td> Yes </td>
  </tr>
  <tr>
	<td><span> High Restricted Mode </span></td>
	<td> Yes<sup>[1]</sup> </td>
	<td> Partial </td>
	<td> No </td>
	<td> Yes </td>
	<td> Yes </td>
	<td> Yes </td>
	<td> Yes </td>
  </tr>
  <tr>
	<td><span> Balance Mode </span></td>
	<td> Yes </td>
	<td> Yes </td>
	<td> No </td>
	<td> Yes </td>
	<td> Yes </td>
	<td> Yes </td>
	<td> Yes </td>
  </tr>
  <tr>
	<td><span> Low Restricted Mode </span></td>
	<td> Yes </td>
	<td> Yes </td>
	<td> Partial<sup>[2]</sup> </td>
	<td> Yes </td>
	<td> No </td>
	<td> No </td>
	<td> Yes </td>
  </tr>
  <tr>
	<td><span> Unrestricted Mode </span></td>
	<td> Yes </td>
	<td> Yes </td>
	<td> Yes<sup>[3]</sup> </td>
	<td> Yes </td>
	<td> No </td>
	<td> No </td>
	<td> Yes </td>
  </tr>
  <tbody>
</table>

<div><b>*</b>: <a href="https://web.dev/declarative-shadow-dom/">Declarative Shadow DOM</a></div>
<div><b>#</b>: <a href="https://en.wikipedia.org/wiki/Content_Security_Policy">Content Security Policy</a></div>
<div>[1]: The external image sources would be blocked by CSP.</div>
<div>[2]: The script codes inside <code>&lt;script&gt;</code> and external script files are still not executable.</div>
<div>[3]: The external script files may not executable due to Obsidian's limitation.</div>

<br />
<details>
<summary>Detail Explanation</summary>
<ol>
  <li><b>Text Mode</b> - Highly recommended for the files came from untrusted source! This mode almost sanitized all visual effects, script codes, and styles out. Meanwhile, it keeps text parts for reading the content of HTML files with HTML layout elements.</li>
  <li><b>High Restricted Mode</b> - This mode recommended for the user who wants more security. It would keep custom elements but sanitize unsafe HTML elements out, as well as unsafe attributes and their contents. The external image sources would be blocked by CSP, and the images are only available from the HTML files themselves.</li>
  <li><b>Balance Mode</b> - This mode is the default mode for this plugin. It would keep all custom elements and HTML elements, but sanitize unsafe attributes and their contents out.</li>
  <li><b>Low Restricted Mode</b> - This mode would not sanitize anything, all elements and their content would be keeped. The script codes inside <code>&lt;script&gt;</code> still not executable, nor the external script files. </li>
  
  <li><b style="color: red;">Unrestricted Mode</b> - This mode is <b style="color: red;">very dangerous</b> and may cause the Obsidian app crash, <b style="color: red; text-transform: uppercase;">the Obsidian and this plugin cannot assume responsibility or liability for switching to this mode</b>. It would not sanitize anything, and all elements and their content would be keeped. The Obsidian app itself might adjust something. The external script files may not executable due to Obsidian's limitation. Strongly recommended not switching to this mode for normal usage.<br />
    If you encounter troubles after switch to this mode, it is recommended to take these recovery steps:
	<ul>
	  <li>Turn back to previous file which can open normally.</li>
	  <li><ins>Delete or move the bad opened file to trash can. Otherwise, Obsidian would still open it after re-launched.</ins></li>
	  <li>Return to this settings page to switch another Operating Mode.</li>
	</ul>
	<br />
	Sometimes you still cannot see what you want, then you should check the content of HTML file. This mode is just leave the content alone (only <ins>adjust the external link anchor tags to let them open in default browser windows</ins>), but the file might has some self-contained security protection facilities (such as CSP) and they would block something to avoid XSS attacks. If you find something like <code>&lt;meta http-equiv="Content-Security-Policy" /&gt;</code> inside the HTML file, it means the file is protected by CSP mechanism. You might 
	<ul>
	  <li>Modify or remove the CSP <code>&lt;meta&gt;</code> tag by hands.</li>
	  <li>Change the capture settings of the original web page saving app to disable CSP or something else, and re-save the web page.</li>
	</ul>
  </li>
</ol>
</details>
`;