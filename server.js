console.log("=== DUMMY ONLY SERVER STARTED ===");

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "roblox-upstream",
    mode: "dummy-only",
    now: new Date().toISOString(),
  });
});

app.get("/gamepasses", (req, res) => {
  console.log("HIT /gamepasses", req.query);

  const userIdRaw = req.query.userId;

  if (!userIdRaw || !/^\d+$/.test(String(userIdRaw))) {
    return res.status(400).json({
      ok: false,
      error: "Invalid or missing userId",
    });
  }

  const userId = Number(userIdRaw);

  return res.json({
    ok: true,
    userId,
    items: [
      { id: 1001, name: "Donate 5", price: 5, imageUrl: "" },
      { id: 1002, name: "Donate 10", price: 10, imageUrl: "" },
      { id: 1003, name: "Donate 50", price: 50, imageUrl: "" },
      { id: 1004, name: "Donate 100", price: 100, imageUrl: "" }
    ],
    dummy: true
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});