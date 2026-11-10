import { withRetry } from "../retry.js";

export const TFL_MODES = [
  "tube",
  "dlr",
  "overground",
  "elizabeth-line",
  "tram",
] as const;

type StopPointResponse = {
  stopPoints?: unknown;
  total?: unknown;
};

export async function fetchStopPoints(
  mode: string,
): Promise<{ text: string; count: number }> {
  return withRetry(async () => {
    const response = await fetch(`https://api.tfl.gov.uk/StopPoint/Mode/${mode}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch TfL ${mode} stop points: ${response.status} ${response.statusText}`,
      );
    }

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`Failed to parse TfL ${mode} stop points response`, {
        cause: error,
      });
    }

    if (typeof data !== "object" || data === null) {
      throw new Error(`TfL ${mode} stop points response is not an object`);
    }
    const { stopPoints, total } = data as StopPointResponse;
    if (!Array.isArray(stopPoints) || typeof total !== "number") {
      throw new Error(
        `TfL ${mode} stop points response is missing stopPoints or total; TfL may have started paging`,
      );
    }
    if (total !== stopPoints.length) {
      throw new Error(
        `TfL ${mode} stop points total ${total} does not match ${stopPoints.length}; TfL may have started paging`,
      );
    }

    return { text, count: stopPoints.length };
  });
}
