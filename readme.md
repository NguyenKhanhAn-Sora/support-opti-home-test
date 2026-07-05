OptiBot Mini-Clone — Support Docs RAG Assistant

A small pipeline that ingests OptiSigns support articles, indexes them into a
managed vector store, and answers questions as OptiBot with cited source
URLs. A daily job keeps the index in sync by uploading only new/changed articles.

Stack: Node.js · Google Gemini API (File Search) · Docker · GitHub Actions


What it does


Scrape → Markdown — pulls all published articles from
support.optisigns.com via the Zendesk Help Center API and converts each to
clean Markdown (headings, links, and code blocks preserved). Each file keeps an
Article URL: line so answers can cite the original.
Index (vector store) — uploads the Markdown files to a Gemini File
Search Store (managed RAG: automatic chunking, embedding, and retrieval).
Ask — queries the store with the OptiBot system prompt; replies are grounded
in the docs and include citations.
Daily sync — a scheduled job re-scrapes, detects deltas, and uploads only
the changes.


Last full index: 403 files embedded (~831 chunks).


Prerequisites


Node.js 18+
Docker (for the containerized job)
A free Gemini API key from https://aistudio.google.com/api-keys


Setup

bashgit clone <https://github.com/NguyenKhanhAn-Sora/support-opti-home-test>
cd <support-opti-home-test>
npm install

.env:

GEMINI_API_KEY=your-gemini-api-key
FILE_SEARCH_STORE=fileSearchStores/your-store-name
Run locally

bashnode scraper.js    # 1) scrape articles -> ./articles/*.md
node upload.js     # 2) create a store and upload all files (one-off)
node ask.js        # 3) test: "How do I add a YouTube video?" (add your own: node ask.js "your question")
node main.js       # daily job: re-scrape + delta detection + upload only changes

Run with Docker

bashdocker build -t optibot-job .
docker run --rm --env-file .env optibot-job     # runs once and exits 0


Chunking strategy

Indexing uses Gemini File Search, a fully managed RAG system. It chunks and
embeds each document automatically (default ~800-token chunks) with the
gemini-embedding model, so chunk boundaries are not hand-tuned. The API does not
return an exact chunk count, so the reported chunk figure is an estimate derived
from document token counts.

Delta detection (daily job)

On every run, main.js re-scrapes all articles and computes a SHA-256 hash of
each article's Markdown. The previous state is read back from the store itself —
each document stores its content hash in customMetadata. Comparing hashes yields:


added — article not in the store
updated — hash changed → old document deleted, new one uploaded
skipped — hash unchanged → left as-is


Because state lives in the store (not on local disk), the job is correct even on
ephemeral/serverless runners. Example second run:

===== JOB SUMMARY =====
added   : 0
updated : 0
skipped : 403

Daily deployment & logs

Scheduled via GitHub Actions (.github/workflows/daily.yml) — free, no card
required. It runs at 02:00 UTC daily (and on manual Run workflow), builds the
Docker image, and runs the job once. Secrets (GEMINI_API_KEY, FILE_SEARCH_STORE)
are stored in GitHub Actions secrets, never in code.

Job logs: <https://github.com/NguyenKhanhAn-Sora/support-opti-home-test/actions/runs/28733337209/job/85202951278>

Screenshots

See the screenshots/ folder:


ask.png — OptiBot answering the sample question with a cited Article URL:
upload.png — files/chunks embedded
delta.png — daily job logging added / updated / skipped
docker.png — docker run completing and exiting 0
