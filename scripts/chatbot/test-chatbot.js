#!/usr/bin/env node
/* Regressionstest af chatbot-søgning og svarformatering uden browser eller npm-pakker. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../..");
const jsPath = path.join(ROOT, "assets/js/chatbot.js");
const dataPath = path.join(ROOT, "chatbot/data/knowledge.json");
let source = fs.readFileSync(jsPath, "utf8");
const insertionPoint = '  const style = document.createElement("link");';
if (!source.includes(insertionPoint)) throw new Error("Could not locate chatbot test hook");
source = source.replace(insertionPoint,
  '  globalThis.__chatbotTest = { setKnowledge(v) { knowledge = v; }, search, formatAnswer, predefinedAnswer, topics: TOPICS }; return;\n' + insertionPoint);

const context = {
  navigator: { language: "da" },
  document: { baseURI: "https://skyttegaardvej.dk/", getElementById: () => null },
  console, URL, Set, RegExp, String, Math, globalThis: null
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: jsPath });
const api = context.__chatbotTest;
api.setKnowledge(JSON.parse(fs.readFileSync(dataPath, "utf8")));

const tests = [
  ["må vi have hund", doc => doc.section === 6, "Det er ikke tilladt at holde husdyr"],
  ["hvad med nattero", doc => doc.section === 7, "Der står ikke et bestemt klokkeslæt"],
  ["parkering", doc => doc.topic === "overview", "Du kan skrive dig på ventelisten"],
  ["hvordan kommer jeg på ventelisten", doc => doc.topic === "waitlist", "kontaktformularen"],
  ["nogen holder på min plads", doc => doc.topic === "enforcement", "DinParkering"]
];

for (const [question, expectedDocument, expectedAnswer] of tests) {
  const results = api.search(question);
  if (!results.length || !expectedDocument(results[0].doc)) {
    throw new Error(`Forkert kilderesultat for '${question}': ${results[0]?.doc?.title || "intet resultat"}`);
  }
  const answer = api.formatAnswer(results, question);
  if (!answer.includes(expectedAnswer)) throw new Error(`Forkert svar for '${question}': ${answer}`);
  console.log(`OK: ${question} → ${results[0].doc.title}`);
}

const expectedTopics = ["parkering", "vedtaegter", "husorden", "kontakt", "kaelderrum", "noeglebrikker", "nyheder", "generelt"];
for (const topic of expectedTopics) {
  if (!api.topics.some(item => item.id === topic)) throw new Error(`Mangler chatbot-emnet: ${topic}`);
}
console.log("OK: Alle otte emner er tilgængelige");

const generalAnswer = api.predefinedAnswer("Hvad kan jeg spørge om?");
if (!generalAnswer || !generalAnswer.includes("parkering") || !generalAnswer.includes("vedtægter")) {
  throw new Error("Det generelle FAQ-svar mangler relevante emner");
}
const usageAnswer = api.predefinedAnswer("Hvordan bruger jeg chatbotten?");
if (!usageAnswer || !usageAnswer.includes("hele hjemmesidens vidensdatabase")) {
  throw new Error("FAQ-svaret forklarer ikke, at søgningen er global");
}
console.log("OK: Generelle spørgsmål får prædefinerede svar");

const bylawResults = api.search("Hvad siger vedtægterne om udlejning?");
if (!bylawResults.length || bylawResults[0].doc.category !== "vedtaegter") {
  throw new Error("Vedtægtsspørgsmålet fandt ikke vedtægtskilden");
}
const keyResults = api.search("Hvordan bestiller jeg en nøglebrik?");
if (!keyResults.length || keyResults[0].doc.category !== "noeglebrikker") {
  throw new Error("Nøglebrikspørgsmålet fandt ikke nøglebrikskilden");
}
const newsResults = api.search("Hvor finder jeg nyhedsbreve fra bestyrelsen?");
if (!newsResults.length || newsResults[0].doc.category !== "nyheder") {
  throw new Error("Nyhedsspørgsmålet fandt ikke nyhedskilden");
}
console.log("OK: Vedtægter, nøglebrikker og nyheder finder den rigtige kategori");
