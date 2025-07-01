const fs = require('fs');

// Read the JSON files
const contestsData = JSON.parse(fs.readFileSync('leetcode-contests.json', 'utf8'));
const submissionsData = JSON.parse(fs.readFileSync('processed-submissions.json', 'utf8'));

// Create a mapping of questionId to contest info
const questionContestMap = new Map();

// Process contests data
Object.entries(contestsData.contests).forEach(([contestSlug, contestInfo]) => {
    const { basicInfo, detailedInfo } = contestInfo;

    // Process each question in the contest
    detailedInfo.data.contestQuestionList.forEach(question => {
        questionContestMap.set(question.questionId, {
            contest: {
                basicInfo: {
                    ...basicInfo,
                    questionTitle: question.title,
                    questionCredit: question.credit
                }
            }
        });
    });
});

// Update submissions data with contest information
Object.entries(submissionsData).forEach(([key, submission]) => {
    if (submission.questionData) {
        const questionId = submission.questionData.questionId;
        const contestInfo = questionContestMap.get(questionId);

        if (contestInfo) {
            submission.questionData = {
                ...submission.questionData,
                ...contestInfo
            };
        }
    }
});

// Write the updated data back to processed-submissions.json
fs.writeFileSync(
    'processed-submissions.json',
    JSON.stringify(submissionsData, null, 2),
    'utf8'
);

console.log('Successfully updated processed-submissions.json with contest information'); 