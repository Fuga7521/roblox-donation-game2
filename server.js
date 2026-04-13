const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const USE_TEST_DATA = process.env.USE_TEST_DATA === "true";
const TEST_USER_ID = Number(process.env.TEST_USER_ID || 409257801);

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "render-upstream",
    mode: USE_TEST_DATA ? "test-data" : "live-enumerator",
    now: new Date().toISOString(),
  });
});

app.get("/selling-passes", async (req, res) => {
  const userIdRaw = req.query.userId;

  if (!userIdRaw || !/^\d+$/.test(String(userIdRaw))) {
    return res.status(400).json({
      ok: false,
      error: "Invalid or missing userId",
    });
  }

  const userId = Number(userIdRaw);

  if (USE_TEST_DATA) {
    let items = [];

    if (userId === TEST_USER_ID) {
      items = [
        { id: 1001, name: "Donate 5", price: 5, imageUrl: "" },
        { id: 1002, name: "Donate 10", price: 10, imageUrl: "" },
        { id: 1003, name: "Donate 50", price: 50, imageUrl: "" },
        { id: 1004, name: "Donate 100", price: 100, imageUrl: "" },
      ];
    }

    return res.json({
      ok: true,
      userId,
      items,
    });
  }

  return res.status(500).json({
    ok: false,
    error: "live-enumerator mode is enabled but no enumerator is configured",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
