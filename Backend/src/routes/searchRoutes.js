const express = require("express");
const router = express.Router();
const { globalSearch } = require("../controllers/searchController");
const { authenticate } = require("../middleware/auth");

router.get("/", authenticate, globalSearch);

module.exports = router;
