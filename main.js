require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const { fetchAllArticles, articleToMarkdown, slugFor, OUTPUT_DIR } = require("./scraper");
 
const STORE_DISPLAY_NAME = "OptiBot Support Docs";
const CONCURRENCY = 3;
const MAX_RETRIES = 3;
 
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hashContent = (t) => crypto.createHash("sha256").update(t).digest("hex");
 

async function resolveStore() {
  if (process.env.FILE_SEARCH_STORE) return process.env.FILE_SEARCH_STORE;
  const store = await ai.fileSearchStores.create({ config: { displayName: STORE_DISPLAY_NAME } });
  fs.writeFileSync(".store", store.name);
  console.log(`No FILE_SEARCH_STORE found -> created new store: ${store.name}`);
  console.log(`>> Add to .env:  FILE_SEARCH_STORE=${store.name}  then re-run to see the delta.`);
  return store.name;
}
 

async function loadStateFromStore(storeName) {
  const state = {};
  const pager = await ai.fileSearchStores.documents.list({
    parent: storeName,
    config: { pageSize: 20 },
  });
  for await (const doc of pager) {
    const meta = doc.customMetadata || [];
    const h = meta.find((m) => m.key === "hash");
    state[doc.displayName] = { hash: h?.stringValue || "", docName: doc.name };
  }
  return state;
}
 
async function deleteDoc(docName) {
  await ai.fileSearchStores.documents.delete({ name: docName });
}
 
async function uploadDoc(storeName, filePath, displayName, hash) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      let op = await ai.fileSearchStores.uploadToFileSearchStore({
        fileSearchStoreName: storeName,
        file: filePath,
        config: {
          displayName,
          mimeType: "text/markdown",
          customMetadata: [{ key: "hash", stringValue: hash }],
        },
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
 

async function runPool(items, worker, concurrency) {
  let i = 0;
  async function loop() {
    while (i < items.length) await worker(items[i++]);
  }
  await Promise.all(Array.from({ length: concurrency }, loop));
}
 
async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY in .env");
    process.exit(1);
  }
 
 
  console.log("1) Re-scrape from OptiSigns...");
  const articles = await fetchAllArticles();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const scraped = articles.map((art) => {
    const fileName = slugFor(art);
    const filePath = path.join(OUTPUT_DIR, fileName);
    const md = articleToMarkdown(art);
    fs.writeFileSync(filePath, md, "utf-8");
    return { fileName, filePath, hash: hashContent(md) };
  });
  console.log(`   Scraped ${scraped.length} articles.`);
 
 
  const storeName = await resolveStore();
  console.log("2) Reading current state from store...");
  const state = await loadStateFromStore(storeName);
 
 
  const toAdd = [];
  const toUpdate = [];
  let skipped = 0;
  for (const s of scraped) {
    const prev = state[s.fileName];
    if (!prev) toAdd.push(s);
    else if (prev.hash !== s.hash) toUpdate.push({ ...s, oldDocName: prev.docName });
    else skipped++;
  }
  console.log(`3) Delta: will add ${toAdd.length}, update ${toUpdate.length}, skip ${skipped}`);
 
 
  let added = 0;
  let updated = 0;
  let failed = 0;
 
  await runPool(
    toAdd,
    async (s) => {
      try {
        await uploadDoc(storeName, s.filePath, s.fileName, s.hash);
        added++;
      } catch (e) {
        failed++;
        console.error(`   error add ${s.fileName}: ${e.message}`);
      }
    },
    CONCURRENCY
  );
 
  await runPool(
    toUpdate,
    async (s) => {
      try {
        if (s.oldDocName) await deleteDoc(s.oldDocName);
        await uploadDoc(storeName, s.filePath, s.fileName, s.hash);
        updated++;
      } catch (e) {
        failed++;
        console.error(`   error update ${s.fileName}: ${e.message}`);
      }
    },
    CONCURRENCY
  );
 
 
  console.log("\n===== JOB SUMMARY =====");
  console.log(`added   : ${added}`);
  console.log(`updated : ${updated}`);
  console.log(`skipped : ${skipped}`);
  if (failed) console.log(`failed  : ${failed}`);
  console.log(`store   : ${storeName}`);
  console.log(`time    : ${new Date().toISOString()}`);
}
 
main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
 