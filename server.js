const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// キャッシュ時間
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60_000);

// タイムアウト
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 10_000);

// デバッグ
const DEBUG = process.env.DEBUG === "true";

// テストフォールバック
const USE_TEST_DATA = process.env.USE_TEST_DATA === "true";
const TEST_USER_ID = Number(process.env.TEST_USER_ID || 409257801);

app.use(cors());
app.use(express.json());

const cache = new Map();

function logDebug(...args) {
  if (DEBUG) {
    console.log("[DEBUG]", ...args);
  }
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function getCacheKey(userId) {
  return `selling-passes:${userId}`;
}

function getCached(userId) {
  const entry = cache.get(getCacheKey(userId));
  if (!entry) return null;

  if (Date.now() - entry.time > CACHE_TTL_MS) {
    cache.delete(getCacheKey(userId));
    return null;
  }

  return entry.items;
}

function setCached(userId, items) {
  cache.set(getCacheKey(userId), {
    time: Date.now(),
    items,
  });
}

function createTimeoutController() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
    },
  };
}

async function fetchJson(url) {
  const { signal, cleanup } = createTimeoutController();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.json();
  } finally {
    cleanup();
  }
}

function getTestItems(userId) {
  if (userId !== TEST_USER_ID) {
    return [];
  }

  return [
    { id: 1001, name: "Donate 5", price: 5, imageUrl: "" },
    { id: 1002, name: "Donate 10", price: 10, imageUrl: "" },
    { id: 1003, name: "Donate 50", price: 50, imageUrl: "" },
    { id: 1004, name: "Donate 100", price: 100, imageUrl: "" },
  ];
}

async function fetchUserGames(userId) {
  const url = `https://games.roblox.com/v2/users/${encodeURIComponent(
    userId
  )}/games?accessFilter=Public&limit=50&sortOrder=Asc`;

  const raw = await fetchJson(url);

  // games API は data 配列を返す
  const data = Array.isArray(raw?.data) ? raw.data : [];

  const universes = [];

  for (const game of data) {
    const universeId =
      toNumber(game.id) ??
      toNumber(game.universeId) ??
      toNumber(game.rootPlace?.universeId);

    if (universeId) {
      universes.push(universeId);
    }
  }

  return universes;
}

async function fetchGamePassesForUniverse(universeId) {
  const url = `https://apis.roblox.com/game-passes/v1/universes/${encodeURIComponent(
    universeId
  )}/game-passes?passView=Full`;

  const raw = await fetchJson(url);

  const data = Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.gamePasses)
    ? raw.gamePasses
    : Array.isArray(raw)
    ? raw
    : [];

  const items = [];
  const seen = new Set();

  for (const item of data) {
    const id =
      toNumber(item.id) ??
      toNumber(item.passId) ??
      toNumber(item.gamePassId) ??
      toNumber(item.assetId);

    const name =
      safeString(item.name) ||
      safeString(item.displayName) ||
      safeString(item.title) ||
      "Unnamed Pass";

    const price =
      toNumber(item.price) ??
      toNumber(item.robux) ??
      toNumber(item.priceInRobux) ??
      toNumber(item.cost) ??
      0;

    const imageUrl =
      safeString(item.imageUrl) ||
      safeString(item.thumbnailUrl) ||
      safeString(item.icon) ||
      "";

    if (!id || price <= 0) {
      continue;
    }

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);

    items.push({
      id,
      name,
      price,
      imageUrl,
    });
  }

  return items;
}

async function fetchSellingPassesForUser(userId) {
  if (USE_TEST_DATA) {
    return getTestItems(userId);
  }

  const universes = await fetchUserGames(userId);
  logDebug("universes for user", userId, universes);

  if (universes.length === 0) {
    return [];
  }

  const allItems = [];
  const seen = new Set();

  for (const universeId of universes) {
    try {
      const items = await fetchGamePassesForUniverse(universeId);

      for (const item of items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          allItems.push(item);
        }
      }
    } catch (err) {
      logDebug("failed universe", universeId, String(err));
    }
  }

  allItems.sort((a, b) => a.price - b.price);
  return allItems;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "render-upstream",
    mode: USE_TEST_DATA ? "test-data" : "live-enumerator",
    now: new Date().toISOString(),
  });
});

app.get("/selling-passes", async (req, res) => {
  try {
    const userIdRaw = req.query.userId;

    if (!userIdRaw || !/^\d+$/.test(String(userIdRaw))) {
      return res.status(400).json({
        ok: false,
        error: "Invalid or missing userId",
      });
    }

    const userId = Number(userIdRaw);

    const cached = getCached(userId);
    if (cached) {
      return res.json({
        ok: true,
        userId,
        items: cached,
        cached: true,
      });
    }

    const items = await fetchSellingPassesForUser(userId);
    setCached(userId, items);

    return res.json({
      ok: true,
      userId,
      items,
      cached: false,
    });
  } catch (error) {
    console.error("[ERROR] /selling-passes failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      detail: String(error?.message || error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Mode: ${USE_TEST_DATA ? "test-data" : "live-enumerator"}`);
});
