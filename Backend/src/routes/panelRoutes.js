const express = require("express");
const router = express.Router();
const { getGradingScale, getModerationChecklist, getNotes, createNote } = require("../controllers/panelController");
const { authenticate, authorize } = require("../middleware/auth");

router.get("/settings/grading-scale", authenticate, getGradingScale);

router.get("/moderation/checklist",
    authenticate,
    authorize("admin", "headmaster"),
    getModerationChecklist
);

router.get("/notes",
    authenticate,
    authorize("admin", "headmaster", "staff"),
    getNotes
);

router.post("/notes",
    authenticate,
    authorize("admin", "headmaster", "staff"),
    createNote
);

module.exports = router;