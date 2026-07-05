require("dotenv").config();
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");
 

const SYSTEM_PROMPT = `You are OptiBot, the customer-support bot for OptiSigns.com.
• Tone: helpful, factual, concise.
• Only answer using the uploaded docs.
• Max 5 bullet points; else link to the doc.
• Cite up to 3 "Article URL:" lines per reply.`;
 
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
 
async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY in .env");
    process.exit(1);
  }
  const storeName = (
    process.env.FILE_SEARCH_STORE ||
    (fs.existsSync(".store") ? fs.readFileSync(".store", "utf-8").trim() : "")
  ).trim();
  if (!storeName) {
    console.error("Store not found. Set FILE_SEARCH_STORE in .env or run upload.js/main.js first.");
    process.exit(1);
  }
  const question = process.argv.slice(2).join(" ") || "How do I add a YouTube video?";
 
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: question,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ fileSearch: { fileSearchStoreNames: [storeName] } }],
    },
  });
 
  console.log("\n=== QUESTION ===");
  console.log(question);
  console.log("\n=== ANSWER ===");
  console.log(response.text);


  const gm = response.candidates?.[0]?.groundingMetadata;
  const chunks = gm?.groundingChunks || [];
  if (chunks.length) {
    console.log("\n=== SOURCES (retrieved chunks) ===");
    chunks.forEach((c, i) => {
      const ctx = c.retrievedContext || {};
      console.log(`[${i + 1}] ${ctx.title || ctx.uri || "?"}`);
    });
  } else {
    console.log("\n(No cited sources found — check whether the store has files yet.)");
  }
}
 
main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
 