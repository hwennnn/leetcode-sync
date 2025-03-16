const action = require("./src/action");
const config = require("./src/test_config");

const TEST_MODE = process.argv.includes("test");
const SYNC = process.argv.includes("sync");

async function main() {
  let githubToken, owner, repo, leetcodeCSRFToken, leetcodeSession;
  let filterDuplicateSecs, destinationFolder;
  if (TEST_MODE) {
    if (
      !config.GITHUB_TOKEN ||
      !config.GITHUB_REPO ||
      !config.LEETCODE_CSRF_TOKEN ||
      !config.LEETCODE_SESSION
    ) {
      throw new Error(
        "Missing required configuration in src/test_config.js needed to run the test",
      );
    }
    githubToken = config.GITHUB_TOKEN;
    [owner, repo] = config.GITHUB_REPO.split("/");
    leetcodeCSRFToken = config.LEETCODE_CSRF_TOKEN;
    leetcodeSession = config.LEETCODE_SESSION;
    filterDuplicateSecs = config.FILTER_DUPLICATE_SECS;
    destinationFolder = config.DESTINATION_FOLDER;
    verbose = config.VERBOSE.toString(); // Convert to string to match core.getInput('verbose') return type
    commitHeader = config.COMMIT_HEADER;
  } else {
    githubToken = core.getInput("github-token");
    owner = context.repo.owner;
    repo = context.repo.repo;
    leetcodeCSRFToken = core.getInput("leetcode-csrf-token");
    leetcodeSession = core.getInput("leetcode-session");
    filterDuplicateSecs = core.getInput("filter-duplicate-secs");
    destinationFolder = core.getInput("destination-folder");
    verbose = core.getInput("verbose");
    commitHeader = core.getInput("commit-header");
  }

  if (SYNC) {
    // first write to processed-submissions.jsons
    await action.sync({
      githubToken,
      owner,
      repo,
      leetcodeCSRFToken,
      leetcodeSession,
      filterDuplicateSecs,
      destinationFolder,
      verbose,
      commitHeader,
    });
  }

  // then read from processed-submissions.json and generate the markdown files
  await action.syncFromProcessedSubmissions({
    destinationFolder,
  });
}

main().catch((error) => {
  action.log(error.stack);
});
