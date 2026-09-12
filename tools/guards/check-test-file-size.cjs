const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ROOT = process.cwd();
const CONFIG_PATH = path.join(PROJECT_ROOT, ".testsize.config.json");

// Baseline exemptions for test files that already exceeded maximumLineCount
// when the guard was introduced. Each entry pins
// the file's line count *at the time it was recorded* — growing the file any
// further fails the guard, so touching one of these files forces a decision
// about the threshold instead of silently growing forever. Shrinking below
// the recorded value is always fine.
function loadConfig() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  return {
    maximumLineCount: raw.maximumLineCount,
    exceptions: new Map(raw.exceptions.map((entry) => [entry.path, entry.maxLines]))
  };
}

function listTestFiles() {
  const output = execFileSync("git", ["ls-files", "*.spec.ts", "*.test.ts"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });
  return output.split("\n").filter(Boolean);
}

function main() {
  const { maximumLineCount, exceptions } = loadConfig();
  const files = listTestFiles();
  const failures = [];

  for (const fileRelPath of files) {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, fileRelPath), "utf8");
    const lineCount = content.split("\n").length;
    const maxLines = exceptions.get(fileRelPath) ?? maximumLineCount;

    if (lineCount > maxLines) {
      failures.push(`${fileRelPath}: ${lineCount} lines (max ${maxLines})`);
    }
  }

  if (failures.length > 0) {
    console.error("❌ Test file size check failed:");
    for (const failure of failures) {
      console.error(`   ${failure}`);
    }
    process.exit(1);
  }

  console.log(`✅ Test file size check passed (${files.length} files)`);
  process.exit(0);
}

main();
