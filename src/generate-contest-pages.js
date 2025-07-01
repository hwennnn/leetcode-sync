const fs = require('fs');
const path = require('path');
const config = require("./test_config");

// Read the JSON files
const contestsData = JSON.parse(fs.readFileSync('leetcode-contests.json', 'utf8'));
const submissionsData = JSON.parse(fs.readFileSync('processed-submissions.json', 'utf8'));

// Create a mapping of questionId to questionFrontendId
const questionIdToFrontendId = new Map();
Object.values(submissionsData).forEach(submission => {
    if (submission.questionData) {
        questionIdToFrontendId.set(
            submission.questionData.questionId,
            submission.questionData.questionFrontendId
        );
    }
});

// Helper function to normalize problem name for filename
function normalizeProblemName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Helper function to check if solution file exists
function solutionFileExists(questionId, titleSlug) {
    const frontendId = questionIdToFrontendId.get(questionId);
    if (!frontendId) {
        return false; // If we can't find the frontendId, assume no solution exists
    }

    const normalizedName = normalizeProblemName(titleSlug);
    const fullName = `${frontendId}-${normalizedName}`;

    // Skip specific problems as per requirement
    if (fullName === "2917-find-the-k-or-of-an-array") {
        return false;
    }

    const destinationFolder = config.DESTINATION_FOLDER || '.';
    const filePath = path.join(destinationFolder, `${fullName}.md`);

    return fs.existsSync(filePath);
}

// Helper function to generate problem link
function generateProblemLink(problem) {
    const { questionId, titleSlug, title } = problem;
    const frontendId = questionIdToFrontendId.get(questionId);

    if (frontendId && solutionFileExists(questionId, titleSlug)) {
        const normalizedName = normalizeProblemName(titleSlug);
        const fullName = `${frontendId}-${normalizedName}`;
        return `[${title.trim()}](${fullName}.md)`;
    }

    return `[${title}](https://leetcode.com/problems/${titleSlug}/)`;
}

// Generate contest section
function generateContestSection(contest, detailed = false) {
    const { basicInfo, detailedInfo } = contest;
    const problems = detailedInfo.data.contestQuestionList;

    const problemLinks = problems
        .map((problem, idx) => `  - ${generateProblemLink(problem)}`)
        .join('\n');

    if (detailed) {
        return `## ${basicInfo.title}\n${problemLinks}\n\n`;
    }

    return `- [${basicInfo.title}](https://leetcode.com/contest/${basicInfo.titleSlug}/)\n${problemLinks}\n`;
}

// Get recent 5 contests
const recentContests = Object.entries(contestsData.contests)
    .sort(([, a], [, b]) => b.basicInfo.startTime - a.basicInfo.startTime)
    .slice(0, 5);

// Generate content for CONTEST_TEMPLATE.md
const templateContent = fs.readFileSync('templates/CONTEST_TEMPLATE.md', 'utf8');
const recentContestsList = recentContests
    .map(([, contest]) => generateContestSection(contest))
    .join('\n');

const currentDate = new Date().toISOString().split('T')[0];
const updatedTemplateContent = templateContent.replace(
    '{RECENT_CONTEST_LIST}',
    recentContestsList
).replace('{MODIFIED_AT}', currentDate);

// Generate CONTEST_LIST.md content using template
const contestListTemplate = fs.readFileSync('templates/CONTEST_LIST.md', 'utf8');
const allContests = Object.entries(contestsData.contests)
    .sort(([, a], [, b]) => b.basicInfo.startTime - a.basicInfo.startTime)
    .map(([, contest]) => generateContestSection(contest, true))
    .join('');


const updatedContestListContent = contestListTemplate
    .replace('{CONTEST_LIST}', allContests)
    .replace('{MODIFIED_AT}', currentDate);

// Write the files
fs.writeFileSync(path.join(config.DESTINATION_FOLDER, 'index.md'), updatedTemplateContent);
fs.writeFileSync(path.join(config.DESTINATION_FOLDER, 'contests_list.md'), updatedContestListContent);

console.log('Successfully generated contest pages'); 