const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ROOT = process.cwd();

// Matches markdown-syntax links only: [text](target) or ![text](target).
// A link's target may carry a trailing "title" in quotes, e.g. (path "title").
const LINK_PATTERN = /!?\[[^\]]*\]\(([^)]+)\)/g;

const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_ABSOLUTE_PATTERN = /^[a-zA-Z]:[\\/]/;

const IGNORE_FILE_PATH = path.join(PROJECT_ROOT, ".md-linkcheck-ignore");

// Files whose markdown links are intentionally illustrative (templates,
// example output, prompt snippets) rather than real navigable references.
function loadIgnoreFiles() {
  if (!fs.existsSync(IGNORE_FILE_PATH)) return [];
  return fs
    .readFileSync(IGNORE_FILE_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

// Link-like syntax inside fenced/inline code isn't a real link — markdown
// renderers show it as literal text, not a clickable link — so strip code
// before scanning for link targets. Fenced blocks are replaced with an
// equal number of newlines (not removed outright) so line numbers reported
// for links after the block stay accurate.
function stripCode(content) {
  return content
    .replace(/```[\s\S]*?```/g, (block) => "\n".repeat((block.match(/\n/g) || []).length))
    .replace(/`[^`\n]+`/g, "");
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

function listMarkdownFiles() {
  const output = execFileSync("git", ["ls-files", "*.md"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });
  const ignoreFiles = loadIgnoreFiles();
  return output
    .split("\n")
    .filter(Boolean)
    .filter((file) => !ignoreFiles.includes(file));
}

function extractTarget(rawTarget) {
  // Strip an optional trailing "title" (quoted) and surrounding whitespace.
  const withoutTitle = rawTarget.trim().replace(/\s+["'][^"']*["']$/, "");
  return withoutTitle.trim();
}

function isLocalFileLink(target) {
  if (target === "") return false;
  if (URI_SCHEME_PATTERN.test(target)) return false; // http(s):, mailto:, etc.
  if (target.startsWith("#")) return false; // same-file anchor
  return true;
}

function checkLink(fileRelPath, target) {
  const [rawPathPart] = target.split("#");
  const pathPart = rawPathPart.trim();

  if (pathPart === "") {
    return null; // fragment-only after stripping (shouldn't happen given isLocalFileLink)
  }

  if (WINDOWS_ABSOLUTE_PATTERN.test(pathPart)) {
    return `absolute filesystem path is not relative-to-file or relative-to-root: "${target}"`;
  }

  const fileDir = path.dirname(path.join(PROJECT_ROOT, fileRelPath));

  const candidates = pathPart.startsWith("/")
    ? [path.join(PROJECT_ROOT, pathPart.slice(1))]
    : [path.join(fileDir, pathPart), path.join(PROJECT_ROOT, pathPart)];

  const resolves = candidates.some((candidate) => fs.existsSync(candidate));

  if (!resolves) {
    return `dead link, does not resolve relative to file or project root: "${target}"`;
  }

  return null;
}

function main() {
  const files = listMarkdownFiles();
  const failures = [];

  for (const fileRelPath of files) {
    const content = stripCode(fs.readFileSync(path.join(PROJECT_ROOT, fileRelPath), "utf8"));
    let match;
    while ((match = LINK_PATTERN.exec(content)) !== null) {
      const target = extractTarget(match[1]);
      if (!isLocalFileLink(target)) continue;

      const error = checkLink(fileRelPath, target);
      if (error) {
        const line = lineNumberAt(content, match.index);
        failures.push(`${fileRelPath}:${line}: ${error}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("❌ Markdown link check failed:");
    for (const failure of failures) {
      console.error(`   ${failure}`);
    }
    process.exit(1);
  }

  console.log(`✅ Markdown link check passed (${files.length} files)`);
  process.exit(0);
}

main();
