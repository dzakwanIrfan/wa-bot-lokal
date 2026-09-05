import type { Client } from "whatsapp-web.js";

import type { QuizAttemptOutcome } from "./evaluate-attempt.js";
import type { GenerateQuestions } from "./generate-questions.js";
import { GroupTaskQueue } from "./group-task-queue.js";
import { PostgresQuizGame } from "../infrastructure/postgres-quiz-game.js";

export class QuizRuntime {
  private timer: NodeJS.Timeout | null = null;
  private lifecycleRunning = false;
  private generationRunning = false;
  private nextGenerationAt = 0;
  private readonly advancing = new Set<string>();

  constructor(
    private readonly client: Client,
    readonly game: PostgresQuizGame,
    private readonly generateQuestions: GenerateQuestions,
    private readonly groupTasks: GroupTaskQueue,
    private readonly tickMilliseconds: number,
    private readonly generationIntervalMilliseconds: number,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.tickMilliseconds);
    this.timer.unref();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async afterAttempt(groupId: string, outcome: QuizAttemptOutcome): Promise<void> {
    if (outcome.kind === "correct" || outcome.kind === "expired") {
      await this.advanceGroup(groupId);
    }
  }

  async advanceGroup(groupId: string): Promise<void> {
    if (this.advancing.has(groupId)) return;
    this.advancing.add(groupId);
    try {
      await this.groupTasks.run(groupId, async () => {
        const result = await this.game.advance(groupId);
        if (result.messages.length > 0) {
          await this.client.sendMessage(groupId, result.messages.join("\n\n"));
          await this.game.markOutboxPublished(result.outboxIds);
        }
      });
    } finally {
      this.advancing.delete(groupId);
    }
  }

  private async tick(): Promise<void> {
    if (!this.lifecycleRunning) {
      this.lifecycleRunning = true;
      try {
        const groups = await this.game.groupsNeedingAdvance();
        await Promise.all(groups.map((groupId) => this.advanceGroup(groupId)));
      } catch (error) {
        console.error(`Quiz lifecycle tick failed: ${errorMessage(error)}`);
      } finally {
        this.lifecycleRunning = false;
      }
    }

    if (Date.now() >= this.nextGenerationAt && !this.generationRunning) {
      this.nextGenerationAt = Date.now() + this.generationIntervalMilliseconds;
      this.generationRunning = true;
      try {
        const batch = await this.game.claimGenerationBatch();
        if (!batch) return;

        try {
          const questions = await this.generateQuestions(batch);
          await this.game.completeGenerationBatch(batch, questions);
          if (batch.groupId) {
            await this.client.sendMessage(
              batch.groupId,
              `✅ ${questions.length} soal topik *${batch.topic}* sudah siap. Ketik /kuis ${batch.topic} untuk mulai.`,
            );
          }
        } catch (error) {
          await this.game.failGenerationBatch(batch.id, error);
          if (batch.groupId) {
            await this.client.sendMessage(
              batch.groupId,
              "Maaf, pembuatan bank soal gagal. Coba /requestkuis lagi nanti.",
            ).catch(() => undefined);
          }
          console.error(`Quiz batch ${batch.id} failed: ${errorMessage(error)}`);
        }
      } catch (error) {
        console.error(`Quiz generation tick failed: ${errorMessage(error)}`);
      } finally {
        this.generationRunning = false;
      }
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
}
