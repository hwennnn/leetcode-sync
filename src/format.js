const fs = require('fs').promises;

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

async function generateContent(
    problemID,
    problemTitle,
    problemSlug,
    problemDescription,
    problemDifficulty,
    problemTopics,
    createdAt,
    submissions
) {
    let contents = "";
    try {
        contents = await fs.readFile("templates/PROBLEM_TEMPLATE.md", "utf8");

        contents = contents.replace("{PROBLEM_ID}", problemID)
            .replace("{PROBLEM_TITLE}", problemTitle)
            .replace("{PROBLEM_SLUG}", problemSlug)
            .replace("{PROBLEM_DESCRIPTION}", problemDescription)
            .replace("{CREATED_AT}", createdAt)

        const difficultyTag = `leetcode-${problemDifficulty.toLowerCase()}`;

        const formattedTopicsTags = [difficultyTag, ...problemTopics.map(topic => topic.slug)]
            .map(topic => `  - ${topic}`)
            .join('\n');
        contents = contents.replace("{PROBLEM_TOPICS}", "\n" + formattedTopicsTags);

        let solution = "";
        for (const submission of submissions) {
            const codeTemplate = "### {LANGUAGE_FULL_NAME}\n``` {LANGUAGE} title='{PROBLEM_SLUG}'\n{CODE}\n```\n";
            solution += codeTemplate
                .replace(/{PROBLEM_SLUG}/g, problemSlug)
                .replace(/{LANGUAGE}/g, LANG_TO_EXTENSION[submission.lang])
                .replace(/{LANGUAGE_FULL_NAME}/g, LANG_TO_FULL_NAME[submission.lang])
                .replace("{CODE}", submission.code);
        }

        contents = contents.replace("{PROBLEM_SOLUTION}", solution);

    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }

    return contents;
}

module.exports = { generateContent };