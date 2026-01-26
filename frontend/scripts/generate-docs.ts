// ── scripts/generate-docs.ts ─────────────────────────────
// This script scans the `docs/` folder, builds a table of
// contents, concatenates every *.md file (except the output
// file) and writes the result to COMBINED.md.
//
// It is written as an ES‑module, so we obtain __dirname from
// import.meta.url.
// ─────────────────────────────────────────────────────────────

import { promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------
// ES‑module equivalent of __dirname / __filename
// ---------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------
const DOCS_ROOT = path.resolve(__dirname, "../../", "docs");
const OUTPUT_FILE = path.join(DOCS_ROOT, "COMBINED.md");

// ---------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------
function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // remove punctuation
    .replace(/\s+/g, "-");
}

async function readMarkdown(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf-8");
}

/**
 * Returns the first level‑1 heading (`# …`) found in the markdown,
 * otherwise falls back to the supplied string.
 */
function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

// ---------------------------------------------------------------
// Main routine
// ---------------------------------------------------------------
(async () => {
  try {
    // -----------------------------------------------------------------
    // 1️⃣ Gather all *.md files (skip the output file itself)
    // -----------------------------------------------------------------
    const entries = await fs.readdir(DOCS_ROOT, { withFileTypes: true });
    const mdFiles = entries
      .filter(
        (e) =>
          e.isFile() &&
          e.name.endsWith(".md") &&
          e.name !== path.basename(OUTPUT_FILE),
      )
      .map((e) => e.name);

    if (mdFiles.length === 0) {
      console.warn("⚠️ No markdown files found in docs/. Nothing to do.");
      return;
    }

    // -----------------------------------------------------------------
    // 2️⃣ Build Table of Contents + combined body
    // -----------------------------------------------------------------
    const tocLines: string[] = [
      "# Combined Documentation",
      "",
      "## Table of Contents",
      "",
    ];
    const bodyLines: string[] = [];

    for (const fileName of mdFiles) {
      const filePath = path.join(DOCS_ROOT, fileName);
      const raw = await readMarkdown(filePath);
      const title = extractTitle(raw, fileName.replace(/\.md$/, ""));

      const anchor = slugify(title);
      tocLines.push(`- [${title}](#${anchor})`);

      // Insert a level‑2 heading that mirrors the original file’s title
      bodyLines.push(`\n## ${title}\n`);
      bodyLines.push(raw.trim()); // preserve original formatting
    }

    // -----------------------------------------------------------------
    // 3️⃣ Assemble final markdown
    // -----------------------------------------------------------------
    const finalContent = [...tocLines, ...bodyLines].join("\n");

    // -----------------------------------------------------------------
    // 4️⃣ Write to COMBINED.md (create/overwrite)
    // -----------------------------------------------------------------
    await fs.writeFile(OUTPUT_FILE, finalContent, "utf-8");

    // -----------------------------------------------------------------
    // 5️⃣ Log a friendly summary
    // -----------------------------------------------------------------
    console.log(`✅ Generated ${path.relative(process.cwd(), OUTPUT_FILE)}`);
    console.log(
      `   Processed ${mdFiles.length} file(s): ${mdFiles.join(", ")}`,
    );
  } catch (err) {
    console.error("❌ Failed to generate combined docs:", err);
    process.exit(1);
  }
})();
