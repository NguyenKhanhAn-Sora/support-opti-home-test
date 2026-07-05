const fs = require("fs");
const path = require("path");
const axios = require("axios");
const TurndownService = require("turndown");
const slugify = require("slugify");
 
const BASE_URL =
  "https://support.optisigns.com/api/v2/help_center/en-us/articles.json";
const OUTPUT_DIR = "articles";
const PER_PAGE = 100;
const REQUEST_DELAY = 300;
 
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
 
async function fetchAllArticles() {
  const articles = [];
  let url = `${BASE_URL}?per_page=${PER_PAGE}`;
  while (url) {
    const { data } = await axios.get(url, {
      headers: { Accept: "application/json" },
      timeout: 30000,
    });
    for (const art of data.articles || []) {
      if (art.draft) continue;
      if (!art.body) continue;
      articles.push(art);
    }
    url = data.next_page;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY));
  }
  return articles;
}
 
function articleToMarkdown(art) {
  const body = turndown.turndown(art.body).trim();
  const header = `# ${art.title}\n\n**Article URL:** ${art.html_url}\n\n`;
  return header + body + "\n";
}
 

function slugFor(art) {
  return (slugify(art.title, { lower: true, strict: true }) || String(art.id)) + ".md";
}
 
function saveArticles(articles) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let saved = 0;
  for (const art of articles) {
    fs.writeFileSync(path.join(OUTPUT_DIR, slugFor(art)), articleToMarkdown(art), "utf-8");
    saved++;
  }
  return saved;
}
 
async function main() {
  console.log("Fetching article list from OptiSigns...");
  const articles = await fetchAllArticles();
  console.log(`Found ${articles.length} published articles.`);
  const saved = saveArticles(articles);
  console.log(`Saved ${saved} Markdown files to ./${OUTPUT_DIR}/`);
}
 

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
 
module.exports = { fetchAllArticles, articleToMarkdown, slugFor, OUTPUT_DIR };
 