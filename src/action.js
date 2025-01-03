const axios = require("axios");
const { Octokit } = require("@octokit/rest");
const path = require("path");
const fs = require('fs').promises;

const { generateContent } = require("./format");

const COMMIT_MESSAGE = "Sync LeetCode submission";
const LANG_TO_EXTENSION = {
  bash: "sh",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  dart: "dart",
  elixir: "ex",
  erlang: "erl",
  golang: "go",
  java: "java",
  javascript: "js",
  kotlin: "kt",
  mssql: "sql",
  mysql: "sql",
  oraclesql: "sql",
  php: "php",
  python: "py",
  python3: "py",
  pythondata: "py",
  postgresql: "sql",
  racket: "rkt",
  ruby: "rb",
  rust: "rs",
  scala: "scala",
  swift: "swift",
  typescript: "ts",
};
const LANG_TO_FULL_NAME = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  dart: "Dart",
  elixir: "Elixir",
  erlang: "Erlang",
  golang: "Go",
  java: "Java",
  javascript: "JavaScript",
  kotlin: "Kotlin",
  mssql: "MS SQL",
  mysql: "MySQL",
  oraclesql: "Oracle SQL",
  php: "PHP",
  python: "Python",
  python3: "Python",
  pythondata: "Python",
  postgresql: "PostgreSQL",
  racket: "Racket",
  ruby: "Ruby",
  rust: "Rust",
  scala: "Scala",
  swift: "Swift",
  typescript: "TypeScript"
};

const BASE_URL = "https://leetcode.com";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function log(message) {
  console.log(`[${new Date().toUTCString()}] ${message}`);
}

function pad(n) {
  if (n.length > 4) {
    return n;
  }
  var s = "000" + n;
  return s.substring(s.length - 4);
}

function normalizeName(problemName) {
  return problemName
    .toLowerCase()
    .replace(/\s/g, "-")
    .replace(/[^a-zA-Z0-9_-]/gi, "");
}

function graphqlHeaders(session, csrfToken) {
  return {
    "content-type": "application/json",
    origin: BASE_URL,
    referer: BASE_URL,
    cookie: `csrftoken=${csrfToken}; LEETCODE_SESSION=${session};`,
    "x-csrftoken": csrfToken,
  };
}

async function getInfo(submission, session, csrfToken) {
  let data = JSON.stringify({
    query: `query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        runtimePercentile
        memoryPercentile
        code
        timestamp
        question {
          questionId
        }
      }
    }`,
    variables: { submissionId: submission.id },
  });

  const headers = graphqlHeaders(session, csrfToken);

  // No need to break on first request error since that would be done when getting submissions
  const getInfo = async (maxRetries = 5, retryCount = 0) => {
    try {
      const response = await axios.post("https://leetcode.com/graphql/", data, {
        headers,
      });
      const submissionDetails = response.data?.data?.submissionDetails;

      const runtimePercentile =
        submissionDetails.runtimePercentile !== null &&
          submissionDetails.runtimePercentile !== undefined
          ? `${submissionDetails.runtimePercentile.toFixed(2)}%`
          : "N/A";

      const memoryPercentile =
        submissionDetails.memoryPercentile !== null &&
          submissionDetails.memoryPercentile !== undefined
          ? `${submissionDetails.memoryPercentile.toFixed(2)}%`
          : "N/A";

      const questionId = submissionDetails?.question?.questionId
        ? pad(submissionDetails.question.questionId.toString())
        : "N/A";

      log(`Got info for submission #${submission.id}`);
      return {
        runtimePerc: runtimePercentile,
        memoryPerc: memoryPercentile,
        qid: questionId,
        code: response.data.data.submissionDetails.code,
      };
    } catch (exception) {
      if (retryCount >= maxRetries) {
        // If problem is locked due to user not having LeetCode Premium
        if (exception.response && exception.response.status === 403) {
          log(`Skipping locked problem: ${submission.title}`);
          return null;
        }
        throw exception;
      }
      log(
        "Error fetching submission info, retrying in " +
        3 ** retryCount +
        " seconds..."
      );
      await delay(3 ** retryCount * 1000);
      return getInfo(maxRetries, retryCount + 1);
    }
  };

  info = await getInfo();
  return { ...submission, ...info };
}

async function commit(params) {
  const {
    submission,
    destinationFolder,
    questionData,
  } = params;
  const name = submission.title;
  log(`Saving solution for ${name}...`);

  if (!LANG_TO_EXTENSION[submission.lang]) {
    throw `Language ${submission.lang} does not have a registered extension.`;
  }

  const prefix = !!destinationFolder ? destinationFolder : "problems";

  if ("runtimePerc" in submission) {
    qid = `${submission.qid}-`;
  } else {
    qid = "";
  }

  if (!questionData) {
    throw "Unable to fetch the Problem statement for " + name;
  }

  const fullPath = path.join(process.cwd(), prefix);

  // Create folder if it doesn't exist
  await fs.mkdir(fullPath, { recursive: true });

  const language = LANG_TO_EXTENSION[submission.lang]
  const code = `${submission.code}\n`

  const submissionTime = new Date(submission.timestamp * 1000).toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('/').reverse().join('-');
  const problemID = questionData["questionFrontendId"]
  const problemTitle = questionData["questionTitle"]
  const problemSlug = questionData["questionTitleSlug"]
  const problemDescription = questionData["content"]
  const problemDifficulty = questionData["difficulty"]
  const problemTopics = questionData["topicTags"]
  const fullName = `${problemID}-${name}`;
  const languageFullName = LANG_TO_FULL_NAME[submission.lang]

  const generatedContent = await generateContent(
    problemID,
    problemTitle,
    problemSlug,
    problemDescription,
    code,
    problemDifficulty,
    problemTopics,
    language,
    submissionTime,
    languageFullName
  )

  // Save md file
  const solutionFileName = `${fullName}.md`
  const solutionPath = path.join(fullPath, solutionFileName);
  await fs.writeFile(solutionPath, generatedContent);

  log(`Saved solution for ${name}`);
}

async function getQuestionData(titleSlug, leetcodeSession, csrfToken) {
  log(`Getting question data for ${titleSlug}...`);

  const headers = graphqlHeaders(leetcodeSession, csrfToken);
  const graphql = JSON.stringify({
    query: `query getQuestionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        content
        difficulty
        questionTitleSlug
        questionTitle
        questionFrontendId
        topicTags {
          name
          slug
        }
      }
    }`,
    variables: { titleSlug: titleSlug },
  });

  try {
    const response = await axios.post(
      "https://leetcode.com/graphql/",
      graphql,
      { headers }
    );
    const result = await response.data;
    return result.data.question;
  } catch (error) {
    // If problem is locked due to user not having LeetCode Premium
    if (error.response && error.response.status === 403) {
      log(`Skipping locked problem: ${titleSlug}`);
      return null;
    }
    console.log("error", error);
  }
}

// Returns false if no more submissions should be added.
function addToSubmissions(params) {
  const {
    response,
    lastTimestamp,
    filterDuplicateSecs,
    submissions_dict,
    submissions,
  } = params;

  for (const submission of response.data.data.submissionList.submissions) {
    submissionTimestamp = Number(submission.timestamp);
    if (submissionTimestamp <= lastTimestamp) {
      return false;
    }
    if (submission.statusDisplay !== "Accepted") {
      continue;
    }
    const name = normalizeName(submission.title);
    const lang = submission.lang;
    if (!submissions_dict[name]) {
      submissions_dict[name] = {};
    }
    // Filter out other accepted solutions less than one day from the most recent one.
    if (
      submissions_dict[name][lang] &&
      submissions_dict[name][lang] - submissionTimestamp < filterDuplicateSecs
    ) {
      continue;
    }
    submissions_dict[name][lang] = submissionTimestamp;
    submissions.push(submission);
  }
  return true;
}

const TIMESTAMP_FILE = 'last_timestamp.json';

async function getLastTimestamp() {
  try {
    const data = await fs.readFile(TIMESTAMP_FILE, 'utf8');
    const timestamp = JSON.parse(data).lastTimestamp;
    log(`Retrieved last timestamp: ${timestamp}`);
    return timestamp;
  } catch (error) {
    log('No previous timestamp found, starting from 0');
    return 0;
  }
}

async function updateLastTimestamp(timestamp) {
  try {
    await fs.writeFile(TIMESTAMP_FILE, JSON.stringify({ lastTimestamp: timestamp }, null, 2));
    log(`Updated last timestamp to: ${timestamp}`);
  } catch (error) {
    console.error('Error updating timestamp:', error);
  }
}

async function sync(inputs) {
  const {
    leetcodeCSRFToken,
    leetcodeSession,
    filterDuplicateSecs,
    destinationFolder,
    verbose,
  } = inputs;

  let lastTimestamp = await getLastTimestamp();
  let response = null;
  let offset = 0;
  const submissions = [];
  const submissions_dict = {};

  do {
    log(`Getting submission from LeetCode, offset ${offset}`);

    const getSubmissions = async (maxRetries, retryCount = 0) => {
      try {
        const slug = undefined;
        const graphql = JSON.stringify({
          query: `query ($offset: Int!, $limit: Int!, $slug: String) {
              submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
                  hasNext
                  submissions {
                      id
                      lang
                      timestamp
                      statusDisplay
                      runtime
                      title
                      memory
                      titleSlug
                  }
              }
          }`,
          variables: {
            offset: offset,
            limit: 20,
            slug,
          },
        });

        const headers = graphqlHeaders(leetcodeSession, leetcodeCSRFToken);
        const response = await axios.post(
          "https://leetcode.com/graphql/",
          graphql,
          { headers }
        );
        log(`Successfully fetched submission from LeetCode, offset ${offset}`);
        return response;
      } catch (exception) {
        if (retryCount >= maxRetries) {
          throw exception;
        }
        log(
          "Error fetching submissions, retrying in " +
          3 ** retryCount +
          " seconds..."
        );
        // There's a rate limit on LeetCode API, so wait with backoff before retrying.
        await delay(3 ** retryCount * 1000);
        return getSubmissions(maxRetries, retryCount + 1);
      }
    };
    // On the first attempt, there should be no rate limiting issues, so we fail immediately in case
    // the tokens are configured incorrectly.
    const maxRetries = response === null ? 0 : 5;
    if (response !== null) {
      // Add a 1 second delay before all requests after the initial request.
      await delay(1000);
    }
    response = await getSubmissions(maxRetries);
    if (
      !addToSubmissions({
        response,
        lastTimestamp,
        filterDuplicateSecs,
        submissions_dict,
        submissions,
      })
    ) {
      break;
    }

    if (offset === 0) {
      const recordedLastTimestamp = Number(response.data.data.submissionList.submissions[0].timestamp * 1000);
      await updateLastTimestamp(recordedLastTimestamp);
    }

    offset += 20;
  } while (false);

  log(`Syncing ${submissions.length} submissions...`);
  for (i = submissions.length - 1; i >= 0; i--) {
    submission = await getInfo(
      submissions[i],
      leetcodeSession,
      leetcodeCSRFToken
    );

    if (submission === null) {
      // Skip this submission if it is null (locked problem)
      continue;
    }

    // Get the question data for the submission.
    const questionData = await getQuestionData(
      submission.titleSlug,
      leetcodeSession,
      leetcodeCSRFToken
    );
    if (questionData === null) {
      // Skip this submission if question data is null (locked problem)
      continue;
    }
    await commit({
      submission,
      destinationFolder,
      questionData,
    });
  }
  log("Done syncing all submissions.");
}

module.exports = { log, sync };
