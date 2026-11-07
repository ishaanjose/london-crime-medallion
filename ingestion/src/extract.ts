import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

const LONDON_FILE = /^(\d{4}-\d{2})\/\1-(metropolitan|city-of-london)-(street|outcomes)\.csv$/;

export async function getArchiveMonth(extractDir: string): Promise<string> {
  const archiveMonth = (
    await readdir(extractDir, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (!archiveMonth) {
    throw new Error("No month folders found in extracted archive");
  }
  return archiveMonth;
}

function isInsideDirectory(path: string, directory: string): boolean {
  const relativePath = relative(directory, path);
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !relativePath.startsWith(sep);
}

export async function extractLondonFiles(
  zipPath: string,
  outDir: string,
): Promise<string[]> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  return new Promise((resolvePromise, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(error ?? new Error("Failed to open zip file"));
        return;
      }

      const extractedPaths: string[] = [];
      let settled = false;

      const fail = (entryError: Error): void => {
        if (!settled) {
          settled = true;
          zipfile.close();
          reject(entryError);
        }
      };

      zipfile.on("error", fail);
      zipfile.on("end", () => {
        if (!settled) {
          settled = true;
          resolvePromise(extractedPaths);
        }
      });
      zipfile.on("entry", (entry) => {
        const match = LONDON_FILE.exec(entry.fileName);
        if (!match) {
          zipfile.readEntry();
          return;
        }

        const outputPath = resolve(outDir, entry.fileName);
        if (!isInsideDirectory(outputPath, resolve(outDir))) {
          fail(new Error(`Zip entry is outside extraction directory: ${entry.fileName}`));
          return;
        }

        mkdir(dirname(outputPath), { recursive: true })
          .then(
            () =>
              new Promise<void>((resolveStream, rejectStream) => {
                zipfile.openReadStream(entry, (streamError, stream) => {
                  if (streamError || !stream) {
                    rejectStream(streamError ?? new Error("Failed to read zip entry"));
                    return;
                  }
                  pipeline(stream, createWriteStream(outputPath)).then(
                    resolveStream,
                    rejectStream,
                  );
                });
              }),
          )
          .then(() => {
            extractedPaths.push(outputPath);
            zipfile.readEntry();
          })
          .catch(fail);
      });

      zipfile.readEntry();
    });
  });
}
