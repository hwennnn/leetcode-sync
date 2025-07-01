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

async function fetchContestsPage(pageNo, leetcodeSession, csrfToken) {
    log(`Fetching contests page ${pageNo}...`);

    const headers = graphqlHeaders(leetcodeSession, csrfToken);
    const graphql = JSON.stringify({
        query: `
    query pastContests($pageNo: Int, $numPerPage: Int) {
  pastContests(pageNo: $pageNo, numPerPage: $numPerPage) {
    pageNum
    currentPage
    totalNum
    numPerPage
    data {
      title
      titleSlug
      startTime
      originStartTime
      cardImg
      sponsors {
        name
        lightLogo
        darkLogo
      }
    }
  }
}
    `,
        variables: { pageNo: pageNo },
        operationName: "pastContests"
    });

    try {
        const response = await axios.post(
            "https://leetcode.com/graphql/",
            graphql,
            { headers }
        );
        return response.data;
    } catch (error) {
        console.error(`Error fetching page ${pageNo}:`, error.message);
        return null;
    }
}

async function fetchContestDetails(titleSlug, leetcodeSession, csrfToken) {
    log(`Fetching contest details for ${titleSlug}...`);

    try {
        const headers = {
            "accept": "*/*",
            "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
            "authorization": "",
            "content-type": "application/json",
            "priority": "u=1, i",
            "random-uuid": "aa84406d-efd8-1e12-3f10-2eafba5bf827",
            "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\"",
            "sec-ch-ua-arch": "\"arm\"",
            "sec-ch-ua-bitness": "\"64\"",
            "sec-ch-ua-full-version": "\"138.0.7204.50\"",
            "sec-ch-ua-full-version-list": "\"Not)A;Brand\";v=\"8.0.0.0\", \"Chromium\";v=\"138.0.7204.50\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-model": "\"\"",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-ch-ua-platform-version": "\"15.5.0\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-csrftoken": csrfToken,
            "cookie": `csrftoken=${csrfToken}; LEETCODE_SESSION=${leetcodeSession};`,
            "referer": `https://leetcode.com/contest/${titleSlug}/`
        };

        const graphql = JSON.stringify({
            query: `
    query contestQuestionList($contestSlug: String!) {
  contestQuestionList(contestSlug: $contestSlug) {
    isAc
    credit
    title
    titleSlug
    titleCn
    questionId
    isContest
  }
}
    `,
            variables: { contestSlug: titleSlug },
            operationName: "contestQuestionList"
        });

        const response = await axios.post(
            "https://leetcode.com/graphql/",
            graphql,
            { headers }
        );
        return response.data;
    } catch (error) {
        console.error(`Error fetching contest details for ${titleSlug}:`, error.message);
        return null;
    }
}

async function fetchAllContests() {
    if (!LEETCODE_SESSION || !LEETCODE_CSRF_TOKEN) {
        console.error('Error: LEETCODE_SESSION and LEETCODE_CSRF_TOKEN environment variables must be set');
        console.error('Usage: LEETCODE_SESSION=your_session LEETCODE_CSRF_TOKEN=your_token node fetch-contests.js');
        process.exit(1);
    }

    const outputFile = 'leetcode-contests.json';
    let allContests = [];
    let contestDetails = {};

    try {
        // First, fetch all contest pages to get the list of contests
        log('Starting to fetch all contest pages...');

        let currentPage = 1;
        let totalPages = 1;

        do {
            const result = await fetchContestsPage(currentPage, LEETCODE_SESSION, LEETCODE_CSRF_TOKEN);

            if (!result || !result.data || !result.data.pastContests) {
                log(`Failed to fetch page ${currentPage}, stopping pagination`);
                break;
            }

            const contestData = result.data.pastContests;
            totalPages = contestData.pageNum;

            log(`Page ${currentPage}/${totalPages} - Found ${contestData.data.length} contests`);
            allContests = allContests.concat(contestData.data);

            currentPage++;

            // Add delay between requests to avoid rate limiting
            if (currentPage <= totalPages) {
                await delay(1000);
            }

        } while (currentPage <= totalPages);

        log(`✅ Fetched ${allContests.length} contests from ${totalPages} pages`);

        // Now fetch detailed information for each contest
        log('Starting to fetch detailed contest information...');

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < allContests.length; i++) {
            const contest = allContests[i];

            try {
                // Add delay between requests to avoid rate limiting
                if (i > 0) {
                    await delay(1500); // 1.5 second delay between requests
                }

                const details = await fetchContestDetails(contest.titleSlug, LEETCODE_SESSION, LEETCODE_CSRF_TOKEN);

                if (details) {
                    contestDetails[contest.titleSlug] = {
                        basicInfo: contest,
                        detailedInfo: details
                    };
                    successCount++;
                    log(`✅ Fetched details for ${contest.titleSlug} (${i + 1}/${allContests.length})`);
                } else {
                    log(`❌ Failed to fetch details for ${contest.titleSlug}`);
                    errorCount++;
                }
            } catch (error) {
                log(`❌ Error processing ${contest.titleSlug}: ${error.message}`);
                errorCount++;
            }
        }

        // Save all data to JSON file
        const finalData = {
            metadata: {
                totalContests: allContests.length,
                fetchedDetails: successCount,
                errors: errorCount,
                fetchedAt: new Date().toISOString()
            },
            contests: contestDetails
        };

        log('Writing contest data to file...');
        await fs.writeFile(outputFile, JSON.stringify(finalData, null, 2));

        log(`✅ Contest fetching complete!`);
        log(`📊 Summary:`);
        log(`   - Total contests found: ${allContests.length}`);
        log(`   - Successfully fetched details: ${successCount}`);
        log(`   - Errors: ${errorCount}`);
        log(`   - Output file: ${outputFile}`);

    } catch (error) {
        console.error('Error during contest fetching:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    fetchAllContests().catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });
}

module.exports = { fetchAllContests }; 