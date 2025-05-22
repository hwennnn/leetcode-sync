const action = require("./src/action");
const config = require("./src/test_config");
const core = require("@actions/core");
const github = require("@actions/github");

const TEST_MODE = process.argv.includes("test");
const SYNC = process.argv.includes("sync");

async function main() {
  let githubToken, owner, repo, leetcodeCSRFToken, leetcodeSession;
  let filterDuplicateSecs, destinationFolder, verbose, commitHeader;

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
    verbose = config.VERBOSE.toString();
    commitHeader = config.COMMIT_HEADER;
  } else {
    // Check if we're running in GitHub Actions
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

    if (isGitHubActions) {
      githubToken = core.getInput("github-token");
      const context = github.context;
      owner = context.repo.owner;
      repo = context.repo.repo;
    } else {
      // Local execution
      if (!process.env.GITHUB_TOKEN) {
        throw new Error("GITHUB_TOKEN environment variable is required for local execution");
      }
      if (!process.env.GITHUB_REPOSITORY) {
        throw new Error("GITHUB_REPOSITORY environment variable is required for local execution (format: owner/repo)");
      }
      githubToken = process.env.GITHUB_TOKEN;
      [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
    }

    leetcodeCSRFToken = core.getInput("leetcode-csrf-token") || process.env.LEETCODE_CSRF_TOKEN;
    leetcodeSession = core.getInput("leetcode-session") || process.env.LEETCODE_SESSION;
    filterDuplicateSecs = core.getInput("filter-duplicate-secs") || process.env.FILTER_DUPLICATE_SECS;
    destinationFolder = core.getInput("destination-folder") || process.env.DESTINATION_FOLDER;
    verbose = core.getInput("verbose") || process.env.VERBOSE;
    commitHeader = core.getInput("commit-header") || process.env.COMMIT_HEADER;
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
