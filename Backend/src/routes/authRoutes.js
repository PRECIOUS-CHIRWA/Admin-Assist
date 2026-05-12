const express = require("express");
const router = express.Router();

//Import our controller function
const { signup, login } = require("../controllers/authController");

// Define the routes and attach the controllers
// When a POST request hits '/signup', the signup function runs
router.post("/signup", signup);

//When a POST request hits '/login', the login function runs
router.post("/login", login);

//export router 
module.exports = router;