#!/usr/bin/env node

/**
 * Seed script — generates test data in output/ for dashboard development.
 * Run: node bin/seed.js
 */

import { saveInstruction } from "../core/store.js";
import { generateInstructionMd } from "../core/markdown-generator.js";

const OUTPUT_DIR = "./public/output";

const SEED_INSTRUCTIONS = [
  {
    id: "slack-1710500000-000000",
    source: "slack",
    sourceUrl: "https://spacekayak.slack.com/archives/C0DESIGN/p1710500000000000",
    project: "sanctuary-parc",
    title: "Updated dashboard layout for Sanctuary Parc v2",
    root: {
      id: "1710500000.000000",
      author: "Alex (Design Lead)",
      authorId: "U001",
      text: "Here's the updated dashboard layout for Sanctuary Parc v2. Key changes:\n• Sidebar nav moved to left\n• New card grid for project overview\n• Dark mode support added\nPlease review and share feedback — need sign-off by EOD Friday.",
      category: "context",
      attachments: [
        { type: "image", name: "dashboard-v2-light.png", title: "Dashboard V2 — Light Mode", mimetype: "image/png", url: "" },
        { type: "image", name: "dashboard-v2-dark.png", title: "Dashboard V2 — Dark Mode", mimetype: "image/png", url: "" },
      ],
      timestamp: "2026-03-15T10:53:00.000Z",
      isRoot: true,
      meta: { reactions: [{ name: "eyes", count: 3 }] },
    },
    replies: [
      {
        id: "1710500100.000000",
        author: "Jordan (Engineer)",
        authorId: "U002",
        text: "Love the new layout! The card grid looks solid. One thing — can we swap the font on the sidebar to match the heading font?",
        category: "approval",
        attachments: [],
        timestamp: "2026-03-15T10:55:00.000Z",
        isRoot: false,
        meta: { reactions: [{ name: "thumbsup", count: 2 }] },
      },
      {
        id: "1710500200.000000",
        author: "Sam (PM)",
        authorId: "U003",
        text: "Looks good overall. Question — are we tracking click-through rates on the project cards? We need analytics hooks before shipping.",
        category: "question",
        attachments: [],
        timestamp: "2026-03-15T10:56:00.000Z",
        isRoot: false,
        meta: {},
      },
      {
        id: "1710500300.000000",
        author: "Riley (QA)",
        authorId: "U004",
        text: "Blocker: the dark mode toggle is broken on Safari. The theme doesn't persist after page refresh. This needs to be fixed before we ship.",
        category: "blocker",
        attachments: [
          { type: "image", name: "safari-bug.png", title: "Safari dark mode bug", mimetype: "image/png", url: "" },
        ],
        timestamp: "2026-03-15T10:58:00.000Z",
        isRoot: false,
        meta: { reactions: [{ name: "rotating_light", count: 2 }] },
      },
      {
        id: "1710500400.000000",
        author: "Casey (Stakeholder)",
        authorId: "U005",
        text: "Ship it! LGTM",
        category: "approval",
        attachments: [],
        timestamp: "2026-03-15T11:00:00.000Z",
        isRoot: false,
        meta: { reactions: [{ name: "white_check_mark", count: 3 }] },
      },
      {
        id: "1710500500.000000",
        author: "Jordan (Engineer)",
        authorId: "U002",
        text: "Also — the spacing between the cards should be 24px instead of 16px. It looks cramped on smaller screens. And make the card hover state more subtle.",
        category: "revision",
        attachments: [
          { type: "image", name: "spacing-comparison.png", title: "Card spacing — 16px vs 24px", mimetype: "image/png", url: "" },
        ],
        timestamp: "2026-03-15T11:01:00.000Z",
        isRoot: false,
        meta: {},
      },
    ],
    allEntries: [], // filled below
    stats: {
      totalEntries: 6,
      totalReplies: 5,
      categories: { context: 1, approval: 2, question: 1, blocker: 1, revision: 1 },
      imageCount: 4,
      fileCount: 0,
      blockerCount: 1,
      revisionCount: 1,
    },
    scrapedAt: "2026-03-15T12:00:00.000Z",
  },
  {
    id: "figma-abc123def",
    source: "figma",
    sourceUrl: "https://figma.com/design/abc123def/Sanctuary-Parc-Mobile",
    project: "sanctuary-parc",
    title: "Sanctuary Parc Mobile — Navigation Redesign",
    root: {
      id: "fc001",
      author: "Maya (Designer)",
      authorId: "figma-maya",
      text: "Mobile nav redesign — bottom tab bar with 5 items. Icons use the Lucide set. Please review the spacing and tap targets.",
      category: "context",
      attachments: [],
      timestamp: "2026-03-14T09:00:00.000Z",
      isRoot: true,
      meta: {},
    },
    replies: [
      {
        id: "fc002",
        author: "Dev Team",
        authorId: "figma-dev",
        text: "The icons are too small on the bottom nav. Should be at least 24px for accessibility. Also the labels overlap on smaller screens.",
        category: "revision",
        attachments: [],
        timestamp: "2026-03-14T10:15:00.000Z",
        isRoot: false,
        meta: {},
      },
      {
        id: "fc003",
        author: "PM",
        authorId: "figma-pm",
        text: "Looks great, approved for development!",
        category: "approval",
        attachments: [],
        timestamp: "2026-03-14T11:00:00.000Z",
        isRoot: false,
        meta: {},
      },
    ],
    allEntries: [],
    stats: {
      totalEntries: 3,
      totalReplies: 2,
      categories: { context: 1, revision: 1, approval: 1 },
      imageCount: 0,
      fileCount: 0,
      blockerCount: 0,
      revisionCount: 1,
    },
    scrapedAt: "2026-03-14T12:00:00.000Z",
  },
  {
    id: "twitter-1234567890",
    source: "twitter",
    sourceUrl: "https://x.com/designinspo/status/1234567890",
    project: "spacekayak",
    title: "Great thread on dashboard design patterns for SaaS products",
    root: {
      id: "1234567890",
      author: "designinspo",
      authorId: "designinspo",
      text: "Great thread on dashboard design patterns for SaaS products. Key takeaway: use progressive disclosure, show only what matters at each level of the hierarchy.",
      category: "context",
      attachments: [],
      timestamp: "2026-03-13T15:30:00.000Z",
      isRoot: true,
      meta: { likes: 1240, retweets: 380 },
    },
    replies: [],
    allEntries: [],
    stats: {
      totalEntries: 1,
      totalReplies: 0,
      categories: { context: 1 },
      imageCount: 0,
      fileCount: 0,
      blockerCount: 0,
      revisionCount: 0,
    },
    scrapedAt: "2026-03-13T16:00:00.000Z",
  },
  {
    id: "slack-1710600000-000000",
    source: "slack",
    sourceUrl: "https://spacekayak.slack.com/archives/C0DEV/p1710600000000000",
    project: "spacekayak",
    title: "API rate limiting needs to be implemented before launch",
    root: {
      id: "1710600000.000000",
      author: "Devon (Backend Lead)",
      authorId: "U010",
      text: "We need to add rate limiting to the public API before launch. Currently no throttling in place. Proposing 100 req/min for free tier, 1000 for pro.",
      category: "context",
      attachments: [],
      timestamp: "2026-03-16T08:00:00.000Z",
      isRoot: true,
      meta: {},
    },
    replies: [
      {
        id: "1710600100.000000",
        author: "Security (Audit)",
        authorId: "U011",
        text: "This is a blocker for launch. Without rate limiting we're exposed to DDoS and scraping attacks. Critical priority.",
        category: "blocker",
        attachments: [],
        timestamp: "2026-03-16T08:15:00.000Z",
        isRoot: false,
        meta: { reactions: [{ name: "octagonal_sign", count: 3 }] },
      },
      {
        id: "1710600200.000000",
        author: "CTO",
        authorId: "U012",
        text: "Should we use a token bucket or sliding window algorithm? What are the tradeoffs?",
        category: "question",
        attachments: [],
        timestamp: "2026-03-16T08:30:00.000Z",
        isRoot: false,
        meta: {},
      },
      {
        id: "1710600300.000000",
        author: "Devon (Backend Lead)",
        authorId: "U010",
        text: "I'd recommend sliding window — it's smoother for burst traffic. We can use Redis for distributed counting. I'll draft the implementation.",
        category: "approval",
        attachments: [],
        timestamp: "2026-03-16T09:00:00.000Z",
        isRoot: false,
        meta: { reactions: [{ name: "thumbsup", count: 4 }] },
      },
    ],
    allEntries: [],
    stats: {
      totalEntries: 4,
      totalReplies: 3,
      categories: { context: 1, blocker: 1, question: 1, approval: 1 },
      imageCount: 0,
      fileCount: 0,
      blockerCount: 1,
      revisionCount: 0,
    },
    scrapedAt: "2026-03-16T10:00:00.000Z",
  },
];

async function seed() {
  console.log("Seeding test data...\n");

  for (const inst of SEED_INSTRUCTIONS) {
    // Fill allEntries
    inst.allEntries = [inst.root, ...inst.replies];

    const md = generateInstructionMd(inst);
    await saveInstruction(inst, OUTPUT_DIR, md);
    console.log(`  [${inst.source.toUpperCase().padEnd(7)}] ${inst.title}`);
  }

  console.log(`\nSeeded ${SEED_INSTRUCTIONS.length} instructions to ${OUTPUT_DIR}/`);
  console.log("Run 'npm run dev' to see them in the dashboard.");
}

seed().catch(console.error);
