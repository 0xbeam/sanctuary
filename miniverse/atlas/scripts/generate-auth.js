#!/usr/bin/env node
// Interactive script to log into Google and save auth cookies for the bot.
// Usage: node scripts/generate-auth.js

const { chromium } = require("playwright");
const { writeFileSync } = require("fs");
const { resolve } = require("path");

const OUTPUT = resolve(__dirname, "..", "auth.json");

async function main() {
  console.log("Opening browser — please log into your Google account...");
  console.log("After logging in, navigate to https://meet.google.com and press Enter in this terminal.\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://accounts.google.com");

  // Wait for user to log in
  process.stdin.resume();
  await new Promise((resolve) => {
    process.stdin.once("data", resolve);
  });

  const cookies = await context.cookies();
  writeFileSync(OUTPUT, JSON.stringify(cookies, null, 2));
  console.log(`Saved ${cookies.length} cookies to ${OUTPUT}`);

  await browser.close();
  process.exit(0);
}

main().catch(console.error);
