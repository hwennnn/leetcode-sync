const fs = require('fs').promises;

async function generateContent(
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
) {
    let contents = "";
    try {
        contents = await fs.readFile("templates/PROBLEM_TEMPLATE.md", "utf8");

        contents = contents.replace("{PROBLEM_ID}", problemID)
            .replace("{PROBLEM_TITLE}", problemTitle)
            .replace("{PROBLEM_SLUG}", problemSlug)
            .replace("{PROBLEM_DESCRIPTION}", problemDescription)
            .replace("{SUBMISSION_TIME}", submissionTime);

        const difficulty_badge = `https://img.shields.io/badge/Difficulty-${problemDifficulty}-blue.svg`;
        contents = contents.replace("PROBLEM_DIFFICULTY", difficulty_badge);

        const formattedTopicsTags = problemTopics
            .map(topic => `  - ${topic.name.toLowerCase().replace(/ /g, '-')}`)
            .join('\n');
        contents = contents.replace("{PROBLEM_TOPICS}", "\n" + formattedTopicsTags);

        const codeTemplate = "### {LANGUAGE_FULL_NAME}\n``` {LANGUAGE} title='{PROBLEM_SLUG}'\n{CODE}\n```\n";
        let solution = codeTemplate
            .replace(/{PROBLEM_SLUG}/g, problemSlug)
            .replace(/{LANGUAGE}/g, language)
            .replace(/{LANGUAGE_FULL_NAME}/g, languageFullName)
            .replace("{CODE}", code);

        contents = contents.replace("{PROBLEM_SOLUTION}", solution);

    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }

    return contents;
}

module.exports = { generateContent };