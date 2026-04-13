const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "render-upstream",
    mode: "manual-real-pass-map",
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

async function fetchSellingPassesForUser(userId) {
  const PASS_MAP = {
    409257801: [
      {
        id: 1234567890, // ← 本物のGamePass ID
        name: "Donate 5",
        price: 5,
        imageUrl: ""
      },
      {
        id: 1234567891, // ← 本物のGamePass ID
        name: "Donate 10",
        price: 10,
        imageUrl: ""
      },
      {
        id: 1234567892, // ← 本物のGamePass ID
        name: "Donate 50",
        price: 50,
        imageUrl: ""
      },
      {
        id: 1234567893, // ← 本物のGamePass ID
        name: "Donate 100",
        price: 100,
        imageUrl: ""
      }
    ],

    111111111: [
      {
        id: 2222222201,
        name: "Tip 5",
        price: 5,
        imageUrl: ""
      },
      {
        id: 2222222202,
        name: "Tip 20",
        price: 20,
        imageUrl: ""
      }
    ]
  };

  return PASS_MAP[userId] || [];
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
