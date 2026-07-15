const express = require("express");
const router = express.Router();

const { globalSearch, searchStudents } = require("../controllers/searchController");
const { authenticate } = require("../middleware/auth");

router.get("/", authenticate, globalSearch);
router.get("/students", authenticate, searchStudents);

module.exports = router;