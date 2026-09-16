#!/usr/bin/env node
"use strict";

/** Tiny TypeSafe/Jev playground. Run with: npm start */

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const API_URL = "https://api.typesafe.ai/v1/systemone";
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "8000", 10);
const MAX_BODY_BYTES = 16 * 1024;

function loadDotenv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;

    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const QUESTIONS = {
  department: {
    type: "choice",
    instructions: "Which team should handle `message`?",
    criteria: {
      billing: "Charges, invoices, refunds, or subscriptions",
      technical: "Bugs, outages, or product failures",
      sales: "Pricing, upgrades, or buying",
      security: "Compromised accounts, exposed credentials, or unauthorized activity",
      unknown: "The issue is unclear or outside these categories",
    },
  },
  is_urgent: {
    type: "noul",
    instructions:
      "Does `message` require expedited handling because it describes active harm, account compromise, major business interruption, or a near-term deadline?",
    criteria: {
      true: "There is a time-sensitive consequence",
      false: "There is no time-sensitive consequence; emotion alone is not urgency",
    },
  },
  frustration: {
    type: "score",
    instructions: "How frustrated does the writer of `message` appear?",
    criteria: ["Calm", "Frustrated but civil", "Very angry"],
  },
};

function sendJson(response, status, value) {
  const data = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(data);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new Error("Request body is too large."));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

async function evaluate(request, response) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    if (!response.headersSent) sendJson(response, 400, { error: error.message });
    return;
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    sendJson(response, 400, { error: "Please enter a message." });
    return;
  }
  if (message.length > 4000) {
    sendJson(response, 400, { error: "Keep the example under 4,000 characters." });
    return;
  }

  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    sendJson(response, 500, { error: "TYPESAFE_API_KEY is missing from .env" });
    return;
  }

  try {
    const input = {
      state: { message },
      model: "jev-latest",
      questions: QUESTIONS,
    };
    const apiResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await apiResponse.text();

    if (!apiResponse.ok) {
      sendJson(response, apiResponse.status, { error: "TypeSafe API request failed." });
      return;
    }

    sendJson(response, 200, { input, output: JSON.parse(text) });
  } catch (error) {
    const detail = error.name === "TimeoutError" ? "request timed out" : error.message;
    sendJson(response, 502, { error: `Could not reach TypeSafe: ${detail}` });
  }
}

function serveIndex(request, response) {
  fs.readFile(path.join(ROOT, "static", "index.html"), (error, data) => {
    if (error) {
      sendJson(response, 500, { error: "Could not load the application." });
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": data.length,
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    response.end(request.method === "HEAD" ? undefined : data);
  });
}

loadDotenv();

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;

  if (request.method === "POST" && pathname === "/api/evaluate") {
    await evaluate(request, response);
  } else if ((request.method === "GET" || request.method === "HEAD") && pathname === "/") {
    serveIndex(request, response);
  } else {
    sendJson(response, 404, { error: "Not found" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Jev playground running at http://${HOST}:${PORT}`);
  console.log("Press Ctrl+C to stop.");
});

process.on("SIGINT", () => {
  console.log("\nStopped.");
  server.close(() => process.exit(0));
});
