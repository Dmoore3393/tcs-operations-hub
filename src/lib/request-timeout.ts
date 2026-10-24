export async function withRequestTimeout<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = 12_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("The connection is taking too long. Please try again."));
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(operation(controller.signal)), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
