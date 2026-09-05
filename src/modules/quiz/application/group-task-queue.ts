export class GroupTaskQueue {
  private readonly queues = new Map<string, Promise<unknown>>();

  run<T>(groupId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(groupId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.queues.set(groupId, current);
    return current.finally(() => {
      if (this.queues.get(groupId) === current) this.queues.delete(groupId);
    });
  }
}
