const express = require("express");
const router = express.Router();

//Import our controller function
const { signup, login, getMe, logout } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// Define the routes and attach the controllers
// When a POST request hits '/signup', the signup function runs
//When a POST request hits '/login', the login function runs
router.post("/signup", signup);
router.post("/login", login);

//protected routes-require a valid Bearer token to access
router.get("/me", authenticate, getMe);
router.post("/logout", authenticate, logout);

//export router 
module.exports = router;