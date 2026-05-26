import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import archiver from "archiver";

export interface ZipResult {
  zipPath: string;
  sizeBytes: number;
}

const EXCLUDE_GLOBS = [
  "**/node_modules/**",
  "**/.next/**",
  "**/.pnpm-store/**",
  "**/.turbo/**",
  "**/.DS_Store",
  "**/*.log",
];

/**
 * Zip a directory into a single .zip file. Excludes build artifacts (node_modules,
 * .next, .pnpm-store) and OS cruft. Streaming + level-6 deflate. The caller is
 * responsible for ensuring `sourceDir` exists and `zipPath`'s parent dir exists.
 */
export async function zipPortfolio(
  sourceDir: string,
  zipPath: string,
): Promise<ZipResult> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("warning", (warn) => {
      if (warn.code === "ENOENT") return;
      reject(warn);
    });
    archive.on("error", reject);

    archive.pipe(output);
    archive.glob("**/*", {
      cwd: sourceDir,
      dot: true,
      ignore: EXCLUDE_GLOBS,
    });
    archive.finalize();
  });

  const st = await stat(zipPath);
  return { zipPath, sizeBytes: st.size };
}
