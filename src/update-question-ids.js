const fs = require('fs').promises;
const axios = require('axios');
const path = require('path');
const config = require("./test_config");
// Configuration - you'll need to set these environment variables or update directly
const LEETCODE_SESSION = config.LEETCODE_SESSION;
const LEETCODE_CSRF_TOKEN = config.LEETCODE_CSRF_TOKEN;

const BASE_URL = "https://leetcode.com";

function log(message) {
    console.log(new Date().toISOString() + " - " + message);
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

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function getQuestionData(titleSlug, leetcodeSession, csrfToken) {
    log(`Getting question data for ${titleSlug}...`);

    const headers = graphqlHeaders(leetcodeSession, csrfToken);
    const graphql = JSON.stringify({
        query: `query getQuestionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
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
        return null;
    }
}

async function updateQuestionIds() {
    if (!LEETCODE_SESSION || !LEETCODE_CSRF_TOKEN) {
        console.error('Error: LEETCODE_SESSION and LEETCODE_CSRF_TOKEN environment variables must be set');
        console.error('Usage: LEETCODE_SESSION=your_session LEETCODE_CSRF_TOKEN=your_token node update-question-ids.js');
        process.exit(1);
    }

    const filePath = 'processed-submissions.json';

    try {
        // Read the current processed submissions
        log('Reading processed-submissions.json...');
        const rawData = await fs.readFile(filePath, 'utf8');
        const processedData = JSON.parse(rawData);

        const problemSlugs = Object.keys(processedData);
        log(`Found ${problemSlugs.length} problems to update`);

        let updatedCount = 0;
        let errorCount = 0;

        // Process each problem
        for (let i = 0; i < problemSlugs.length; i++) {
            const slug = problemSlugs[i];
            const problemData = processedData[slug];

            // Check if questionId is already present
            if (problemData.questionData && problemData.questionData.questionId) {
                log(`Problem ${slug} already has questionId: ${problemData.questionData.questionId}`);
                continue;
            }

            try {
                // Add delay between requests to avoid rate limiting
                if (i > 0) {
                    await delay(1000); // 1 second delay between requests
                }

                // Fetch updated question data
                const updatedQuestionData = await getQuestionData(slug, LEETCODE_SESSION, LEETCODE_CSRF_TOKEN);

                if (updatedQuestionData && updatedQuestionData.questionId) {
                    // Update the question data with the new information
                    processedData[slug].questionData = {
                        ...problemData.questionData,
                        ...updatedQuestionData
                    };
                    updatedCount++;
                    log(`✅ Updated ${slug} with questionId: ${updatedQuestionData.questionId}`);
                } else {
                    log(`❌ Failed to get questionId for ${slug}`);
                    errorCount++;
                }
            } catch (error) {
                log(`❌ Error processing ${slug}: ${error.message}`);
                errorCount++;
            }
        }

        // Write the updated data back to the file
        log('Writing updated data back to processed-submissions.json...');
        await fs.writeFile(filePath, JSON.stringify(processedData, null, 2));

        log(`✅ Update complete!`);
        log(`📊 Summary:`);
        log(`   - Total problems: ${problemSlugs.length}`);
        log(`   - Updated: ${updatedCount}`);
        log(`   - Errors: ${errorCount}`);
        log(`   - Already had questionId: ${problemSlugs.length - updatedCount - errorCount}`);

    } catch (error) {
        console.error('Error reading or processing file:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    updateQuestionIds().catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });
}

module.exports = { updateQuestionIds }; 