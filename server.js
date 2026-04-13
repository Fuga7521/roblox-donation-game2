const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "render-upstream",
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

    const items = await fetchSellingPassesForUser(userId);

    return res.json({
      ok: true,
      userId,
      items,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      detail: String(error?.message || error),
    });
  }
});

/*
  ここが本番列挙ポイント
  返り値は [{ id, name, price, imageUrl }] にそろえる
*/
async function fetchSellingPassesForUser(userId) {
  // ============================
  // いったんダミーではなく「本番用の差し替え地点」
  // ここにあなたが使う外部列挙元を入れる
  // ============================

  // 例:
  // const res = await fetch("https://YOUR-ENUMERATOR.example.com/selling-passes?userId=" + userId);
  // const raw = await res.json();
  // return normalizeSellingPasses(raw);

  throw new Error("fetchSellingPassesForUser() を本番列挙元に差し替えてください");
}

function normalizeSellingPasses(raw) {
  let sourceItems = [];

  if (Array.isArray(raw)) {
    sourceItems = raw;
  } else if (raw && Array.isArray(raw.items)) {
    sourceItems = raw.items;
  } else if (raw && Array.isArray(raw.data)) {
    sourceItems = raw.data;
  }

  const normalized = [];

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

    if (id && price > 0) {
      normalized.push({
        id,
        name,
        price,
        imageUrl,
      });
    }
  }

  normalized.sort((a, b) => a.price - b.price);
  return normalized;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
