export type ProcessPromptOptions = {
    maxContextSize: number,
};

const CONSERVATIVE_CHARS_PER_TOKEN = 5.5;

const processPrompt = (prompt: string, options: ProcessPromptOptions) => {
    const numCharsToKeep = Math.ceil(CONSERVATIVE_CHARS_PER_TOKEN * options.maxContextSize);
    return prompt.slice(-numCharsToKeep);
};

export default processPrompt;
