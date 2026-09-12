const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

try {
  const gitDir = execSync("git rev-parse --git-dir").toString().trim();
  const SUMMARY_PATH = path.join(gitDir, "review_summary.json");

  // 1. Check if the file exists
  if (!fs.existsSync(SUMMARY_PATH)) {
    console.error("❌ Error: No code review summary found.");
    console.error("👉 Run your \"multi-persona-review\" skill before pushing.");
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8"));
  
  // 2. Verify the Commit Hash (Staleness Check)
  const currentSha = execSync("git rev-parse HEAD").toString().trim();
  if (summary.head_sha !== currentSha) {
    console.error("❌ Error: Review is stale!");
    console.error(`Review SHA: ${summary.head_sha.substring(0, 7)}`);
    console.error(`Local HEAD:  ${currentSha.substring(0, 7)}`);
    console.error("👉 Re-run the \"multi-persona-review\" skill on your latest changes.");
    process.exit(1);
  }

  // 3. Verify Critical Findings
  const criticals = summary?.counts?.critical;
  if (criticals == undefined || typeof criticals != "number" || criticals > 0) {
    console.error(`❌ Push blocked: ${criticals ?? "[undefined]"} CRITICAL finding(s) in review.`);
    process.exit(1);
  }

  console.log("✅ Review verified: No critical showstoppers and review is up to date.");
  process.exit(0);

}
 catch (err) {
  console.error("❌ Hook failed to execute:", err.message);
  process.exit(1);
}
