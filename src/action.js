const axios = require("axios");
const path = require("path");
const fs = require('fs').promises;

const { generateContent } = require("./format");

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
    submissions,
    destinationFolder,
    questionData,
  } = params;
  if (!submissions) {
    throw "No submissions found";
  }

  const normalizedName = questionData["questionTitleSlug"];
  log(`Saving solution for ${normalizedName}...`);

  const prefix = !!destinationFolder ? destinationFolder : "problems";

  if (!questionData) {
    throw "Unable to fetch the Problem statement for " + normalizedName;
  }

  const fullPath = path.join(process.cwd(), prefix);

  // Create folder if it doesn't exist
  await fs.mkdir(fullPath, { recursive: true });

  const submissionsTimestamp = submissions.map(submission => submission.timestamp)
  const createdAt = new Date(Math.min(...submissionsTimestamp) * 1000).toLocaleDateString('en-SG', {
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
  const fullName = `${problemID}-${normalizedName}`;

  if (fullName === "2917-find-the-k-or-of-an-array") {
    log("Skipping problem 2917-find-the-k-or-of-an-array");
    return;
  }

  const generatedContent = await generateContent(
    problemID,
    problemTitle,
    problemSlug,
    problemDescription,
    problemDifficulty,
    problemTopics,
    createdAt,
    submissions
  )

  // Save md file
  const solutionFileName = `${fullName}.md`
  const solutionPath = path.join(fullPath, solutionFileName);

  // SKIP CHECKING FOR EXISTING SOLUTION
  // try {
  //   await fs.access(solutionPath);
  //   log(`Skipping existing solution for ${normalizedName}`);
  //   return;
  // } catch {
  //   // File doesn't exist, continue with writing
  // await fs.writeFile(solutionPath, generatedContent);
  // log(`Saved solution for ${normalizedName}`);
  // }

  // Write to file
  await fs.writeFile(solutionPath, generatedContent);
  log(`Saved solution for ${normalizedName}`);
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
    submissionTimestamp = Number(submission.timestamp) * 1000;
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
  } = inputs;
  let lastTimestamp = await getLastTimestamp();
  let response = null;
  let offset = 0;
  const submissions = [];
  const submissions_dict = {};
  let firstSubmissionTimestamp = null;

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

    if (offset === 0) {
      firstSubmissionTimestamp = Number(response.data.data.submissionList.submissions[0].timestamp * 1000);
    }

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

    offset += 20;
  } while (response.data.data.submissionList.hasNext);


  await updateLastTimestamp(firstSubmissionTimestamp);

  const processedSubmissions = await retrieveProcessedSubmissions();
  log(`Syncing ${submissions.length} submissions...`);

  for (i = 0; i < submissions.length; i++) {
    let submission = await getInfo(
      submissions[i],
      leetcodeSession,
      leetcodeCSRFToken
    );
    log(`index: ${i}, submission: ${submission}`)

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

    // Initialize map for this problem if it doesn't exist
    if (!processedSubmissions.has(submission.titleSlug)) {
      processedSubmissions.set(submission.titleSlug, {
        questionData,
        submissions: new Map() // lang -> submission
      });
    }

    const problemData = processedSubmissions.get(submission.titleSlug);

    // Update submission for this language if it's newer
    const existingSubmission = problemData.submissions.get(submission.lang);
    if (!existingSubmission ||
      Number(submission.timestamp) > Number(existingSubmission.timestamp)) {
      problemData.submissions.set(submission.lang, submission);
      log(`Added/Updated submission for ${submission.titleSlug} in ${submission.lang}`);
    } else {
      log(`Skipping older submission for ${submission.titleSlug} in ${submission.lang}`);
    }
  }

  // Dump processed submissions to JSON file
  const processedData = Object.fromEntries(
    Array.from(processedSubmissions.entries()).map(([titleSlug, data]) => [
      titleSlug,
      {
        questionData: data.questionData,
        submissions: Object.fromEntries(data.submissions)
      }
    ])
  );

  await fs.writeFile(
    'processed-submissions.json',
    JSON.stringify(processedData, null, 2)
  );

  log("Done syncing all submissions.");
}

async function retrieveProcessedSubmissions() {
  log('Reading from processed-submissions.json...');
  let processedData = {};
  try {
    const rawData = await fs.readFile('processed-submissions.json', 'utf8');
    processedData = JSON.parse(rawData);
  } catch (error) {
    log('Error reading processed-submissions.json: ' + error.message);
    return;
  }

  log(`Processing submissions from processed-submissions.json...`);

  // Convert the processed data back into the Map structure
  const processedSubmissions = new Map();
  for (const [titleSlug, data] of Object.entries(processedData)) {
    const submissionsMap = new Map();
    for (const [lang, submission] of Object.entries(data.submissions)) {
      submissionsMap.set(lang, submission);
    }
    processedSubmissions.set(titleSlug, {
      questionData: data.questionData,
      submissions: submissionsMap
    });
  }

  return processedSubmissions;
}

async function syncFromProcessedSubmissions(inputs) {
  const { destinationFolder } = inputs;

  const processedSubmissions = await retrieveProcessedSubmissions();

  // Process all collected submissions
  for (const [titleSlug, problemData] of processedSubmissions) {
    const { questionData, submissions } = problemData;

    await commit({
      submissions: Array.from(submissions.values()),
      destinationFolder,
      questionData,
    });
  }

  log("Done processing submissions from processed-submissions.json");
}

module.exports = { log, sync, syncFromProcessedSubmissions };
