// A static local fixture page exercising every target/action/condition kind the DSL driver
// supports — loaded via page.setContent() so tests never depend on a network resource or the
// real target application.
export const FIXTURE_HTML = `<!doctype html>
<html>
<body>
	<h1>Fixture</h1>
	<button name="search">Search</button>
	<input placeholder="Search accounts" />
	<label for="accountNumber">Account number</label>
	<input id="accountNumber" value="ACCT-1042" />
	<div id="balance">1234.50</div>
	<div contenteditable="true" id="notes"></div>
	<select id="accountType">
		<option value="checking">Checking</option>
		<option value="savings">Savings</option>
	</select>
	<button id="save" disabled>Save</button>
	<div id="hidden" style="display:none">Hidden</div>
	<button class="duplicate">Duplicate</button>
	<button class="duplicate">Duplicate</button>
	<div id="belowFold" style="position:absolute; top: 1800px; left: 200px;">Below the fold</div>
	<input id="belowFoldInput" style="position:absolute; top: 1900px; left: 200px;" value="deep-value" />
	<div style="height: 2500px;"></div>
</body>
</html>`;
