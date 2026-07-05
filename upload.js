
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");


const ARTICLES_DIR = "articles";
const STORE_DISPLAY_NAME = "OptiBot Support Docs";
const CONCURRENCY = 3; 
const MAX_RETRIES = 3; 
const MAX_FILES = 0; 

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listMarkdownFiles(dir) {
  let files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f));
  if (MAX_FILES > 0) files = files.slice(0, MAX_FILES);
  return files;
}


function estimateChunks(text) {
  const tokens = Math.ceil(text.length / 4); 
  const CHUNK = 800;
  if (tokens <= CHUNK) return 1;
  return Math.ceil(tokens / CHUNK);
}


async function uploadOne(fp, storeName) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      let op = await ai.fileSearchStores.uploadToFileSearchStore({
        fileSearchStoreName: storeName,
        file: fp,
        config: { displayName: path.basename(fp), mimeType: "text/markdown" },
      });
      while (!op.done) {
        await sleep(2000);
        op = await ai.operations.get({ operation: op });
      }
      if (op.error) throw new Error(op.error.message || "import failed");
      return;
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      await sleep(2000 * attempt); 
    }
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY. Create a .env with GEMINI_API_KEY=... (get one at aistudio.google.com/api-keys)");
    process.exit(1);
  }

  const files = listMarkdownFiles(ARTICLES_DIR);
  console.log(`Found ${files.length} .md files in ./${ARTICLES_DIR}`);

  let estChunks = 0;
  for (const fp of files) estChunks += estimateChunks(fs.readFileSync(fp, "utf-8"));

  
  const store = await ai.fileSearchStores.create({
    config: { displayName: STORE_DISPLAY_NAME },
  });
  console.log(`Created File Search Store: ${store.name}`);
  fs.writeFileSync(".store", store.name); 

  
  let done = 0;
  let failed = 0;
  let idx = 0;
  async function worker() {
    while (idx < files.length) {
      const fp = files[idx++];
      try {
        await uploadOne(fp, store.name);
        done++;
      } catch (e) {
        failed++;
        console.error(`  error ${path.basename(fp)}: ${e.message}`);
      }
      if ((done + failed) % 20 === 0) {
        console.log(`  progress: ${done + failed}/${files.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("\n===== RESULTS =====");
  console.log(`File Search Store : ${store.name}`);
  console.log(`Files embedded    : ${done} (failed: ${failed})`);
  console.log(`Chunks (estimated): ~${estChunks}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
