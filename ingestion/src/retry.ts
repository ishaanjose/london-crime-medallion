export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }
      const delaySeconds = 2 ** (attempt - 1);
      console.log(
        `retrying in ${delaySeconds}s (attempt ${attempt + 1}/${attempts})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
  }

  throw new Error("Retry attempts must be greater than zero");
}
