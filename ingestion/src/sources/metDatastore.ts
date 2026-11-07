import { withRetry } from "../retry.js";

const MET_DATASTORE_URL = "https://data.london.gov.uk/api/dataset/exy3m";

interface MetResource {
  title: string;
  url: string;
  check_hash: string;
  check_timestamp: string;
  check_size: number;
  temporal_coverage_from: string;
  temporal_coverage_to: string;
}

export interface MetRelease {
  releaseDate: string;
  recent: MetReleaseFile;
  historical: MetReleaseFile;
}

export interface MetReleaseFile {
  title: string;
  url: string;
  checkHash: string;
  checkTimestamp: string;
  checkSize: number;
  temporalCoverageFrom: string;
  temporalCoverageTo: string;
}

const RECENT_TITLE = "MPS LSOA Level Crime.csv";
const HISTORICAL_TITLE = "MPS LSOA Level Crime (Historical).csv";

function newest(resources: MetResource[], title: string): MetResource {
  const matches = resources
    .filter((resource) => resource.title === title)
    .sort((a, b) => b.check_timestamp.localeCompare(a.check_timestamp));
  const resource = matches[0];
  if (!resource) {
    throw new Error(`Missing Met datastore resource: ${title}`);
  }
  return resource;
}

function toReleaseFile(resource: MetResource): MetReleaseFile {
  return {
    title: resource.title,
    url: resource.url,
    checkHash: resource.check_hash,
    checkTimestamp: resource.check_timestamp,
    checkSize: resource.check_size,
    temporalCoverageFrom: resource.temporal_coverage_from,
    temporalCoverageTo: resource.temporal_coverage_to,
  };
}

export async function getLatestMetRelease(): Promise<MetRelease> {
  const response = await withRetry(async () => {
    const response = await fetch(MET_DATASTORE_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Met datastore: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  });

  const dataset: unknown = await response.json();
  if (
    typeof dataset !== "object" ||
    dataset === null ||
    !("resources" in dataset) ||
    typeof dataset.resources !== "object" ||
    dataset.resources === null ||
    Array.isArray(dataset.resources)
  ) {
    throw new Error("Met datastore response has no resources object");
  }

  const resources = Object.values(
    dataset.resources as Record<string, MetResource>,
  );
  const recent = newest(resources, RECENT_TITLE);
  const historical = newest(resources, HISTORICAL_TITLE);
  const recentDate = recent.check_timestamp.split("T")[0];
  const historicalDate = historical.check_timestamp.split("T")[0];
  if (recentDate !== historicalDate) {
    throw new Error(
      `Met release incomplete, try later (recent ${recentDate}, historical ${historicalDate})`,
    );
  }

  return {
    releaseDate: recentDate!,
    recent: toReleaseFile(recent),
    historical: toReleaseFile(historical),
  };
}
