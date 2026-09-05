export type QuestionBatch = Readonly<{
  id: string;
  groupId: string | null;
  topic: string;
  difficulty: number;
  groupWinRate: number | null;
  count: number;
  model: string;
}>;

export type GeneratedQuestion = Readonly<{
  questionText: string;
  canonicalAnswer: string;
  acceptedAnswers: readonly string[];
  explanation: string;
  personaPrompt: string;
  maxLevenshteinDistance: number;
}>;

export type GenerateQuestions = (
  batch: QuestionBatch,
) => Promise<readonly GeneratedQuestion[]>;
