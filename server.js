const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// ==============================
// 環境設定
// ==============================

// 本番列挙元
// 例:
// https://your-enumerator.example.com/selling-passes?userId={userId}
const ENUMERATOR_URL_TEMPLATE =
  process.env.ENUMERATOR_URL_TEMPLATE ||
  "https://YOUR-ENUMERATOR.example.com/selling-passes?userId={userId}";

// 認証が必要なら Bearer token を使う
const ENUMERATOR_AUTH_TOKEN = process.env.ENUMERATOR_AUTH_TOKEN || "";

// 何秒キャッシュするか
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60_000);

// 列挙元へのタイムアウト
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 10_000);

// デバッグ用
const DEBUG = process.env.DEBUG === "true";

// テスト用固定レスポンスモード
// true にすると外部列挙元を使わず固定データを返す
const USE_TEST_DATA = process.env.USE_TEST_DATA === "true";

// 特定ユーザーだけテスト返却したい場合
const TEST_USER_ID = Number(process.env.TEST_USER_ID || 409257801);

// ==============================
// 基本設定
// ==============================

app.use(cors());
app.use(express.json());

const cache = new Map();

// ==============================
// Utility
// ==============================

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

function buildCacheKey(userId) {
  return `selling-passes:${userId}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.time;
  if (age > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCached(key, value) {
  cache.set(key, {
    time: Date.now(),
    value,
  });
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

function normalizeSellingPasses(raw) {
  let sourceItems = [];

  if (Array.isArray(raw)) {
    sourceItems = raw;
  } else if (raw && Array.isArray(raw.items)) {
    sourceItems = raw.items;
  } else if (raw && Array.isArray(raw.data)) {
    sourceItems = raw.data;
  } else if (raw && raw.result && Array.isArray(raw.result)) {
    sourceItems = raw.result;
  }

  const normalized = [];
  const seen = new Set();

  for (const item of sourceItems) {
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

    normalized.push({
      id,
      name,
      price,
      imageUrl,
    });
  }

  normalized.sort((a, b) => a.price - b.price);
  return normalized;
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

// ==============================
// 本番列挙関数
// ==============================

async function fetchSellingPassesForUser(userId) {
  if (USE_TEST_DATA) {
    return getTestItems(userId);
  }

  if (!ENUMERATOR_URL_TEMPLATE.includes("{userId}")) {
    throw new Error("ENUMERATOR_URL_TEMPLATE に {userId} が入っていません");
  }

  const url = ENUMERATOR_URL_TEMPLATE.replace(
    "{userId}",
    encodeURIComponent(String(userId))
  );

  logDebug("Fetching enumerator URL:", url);

  const headers = {
    Accept: "application/json",
  };

  if (ENUMERATOR_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${ENUMERATOR_AUTH_TOKEN}`;
  }

  const { signal, cleanup } = createTimeoutSignal(FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal,
    });

    if (!response.ok) {
      throw new Error(`Enumerator responded with ${response.status}`);
    }

    const raw = await response.json();
    const items = normalizeSellingPasses(raw);

    return items;
  } finally {
    cleanup();
  }
}

// ==============================
// Routes
// ==============================

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
    const cacheKey = buildCacheKey(userId);

    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({
        ok: true,
        userId,
        items: cached,
        cached: true,
      });
    }

    const items = await fetchSellingPassesForUser(userId);
    setCached(cacheKey, items);

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

// ==============================
// Start
// ==============================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Mode: ${USE_TEST_DATA ? "test-data" : "live-enumerator"}`);
});
