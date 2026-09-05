const MAX_ANSWER_CHARACTERS = 200;

export type AnswerKey = Readonly<{
  canonicalAnswer: string;
  acceptedAnswers: readonly string[];
  maxLevenshteinDistance: number;
}>;

export type AnswerEvaluation = Readonly<{
  normalizedAnswer: string;
  isCorrect: boolean;
  levenshteinDistance: number | null;
}>;

export function normalizeQuizAnswer(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("id-ID").trim().replace(/\s+/gu, " ");
}

export function levenshteinDistance(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];

    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }

    previous = current;
  }

  return previous[b.length] ?? a.length;
}

export function evaluateQuizAnswer(
  answer: string,
  key: AnswerKey,
): AnswerEvaluation {
  const normalizedAnswer = normalizeQuizAnswer(answer);
  if (
    normalizedAnswer.length === 0 ||
    [...normalizedAnswer].length > MAX_ANSWER_CHARACTERS
  ) {
    return {
      normalizedAnswer: [...normalizedAnswer]
        .slice(0, MAX_ANSWER_CHARACTERS)
        .join(""),
      isCorrect: false,
      levenshteinDistance: null,
    };
  }

  const candidates = [key.canonicalAnswer, ...key.acceptedAnswers]
    .map(normalizeQuizAnswer)
    .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);

  if (candidates.includes(normalizedAnswer)) {
    return { normalizedAnswer, isCorrect: true, levenshteinDistance: 0 };
  }

  if (key.maxLevenshteinDistance <= 0) {
    return { normalizedAnswer, isCorrect: false, levenshteinDistance: null };
  }

  let closestDistance: number | null = null;
  for (const candidate of candidates) {
    if (
      Math.abs([...candidate].length - [...normalizedAnswer].length) >
      key.maxLevenshteinDistance
    ) {
      continue;
    }

    const distance = levenshteinDistance(normalizedAnswer, candidate);
    closestDistance = Math.min(closestDistance ?? distance, distance);
  }

  return {
    normalizedAnswer,
    isCorrect:
      closestDistance !== null &&
      closestDistance <= key.maxLevenshteinDistance,
    levenshteinDistance: closestDistance,
  };
}
