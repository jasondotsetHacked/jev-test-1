# Tiny Jev playground

This is a deliberately small, dependency-free Node.js example of
[TypeSafe's Jev model](https://typesafe.ai/). It sends one customer message to
three typed questions and displays the structured answers and probabilities.

## Prerequisites

- Node.js 18.17 or newer
- A TypeSafe API key

## Run locally

Copy `.env.example` to `.env`, then add your API key:

```bash
cp .env.example .env
```

On Windows Command Prompt, use `copy .env.example .env` instead.

Start the app:

```bash
npm start
```

Then open <http://127.0.0.1:8000> and try the example buttons or write your own message.

## What to look at

- `state` in `app.js` is the customer message Jev examines.
- `QUESTIONS` contains three typed judgments: Choice, Noul, and Score.
- `/api/evaluate` sends those questions to Jev and returns structured JSON.
- `static/index.html` turns that JSON into visible labels and bars.
- The expandable sections show the exact API input and response.
- The API key stays on the server and is never sent to the browser.

Change the question wording or criteria in `QUESTIONS`, restart the server, and submit the same message again. That is the quickest way to learn how the rubric shapes Jev's judgment.

## Publishing and deployment

The real `.env` file is intentionally ignored by Git. Never commit an API key.
This demo binds to `127.0.0.1` by default and is intended for local learning. If
you deploy it on the public internet, add authentication and rate limiting so
other people cannot spend your API quota through `/api/evaluate`.
