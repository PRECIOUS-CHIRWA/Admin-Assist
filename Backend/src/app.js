const express = require('express');
const cors = require('cors');
require('dotenv').config({ quiet: true });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//Import and connect routes
const authRoutes = require('./routes/authRoutes');

//1. Import the routes
app.use('/api/auth', authRoutes);

//2.Tell app to use them for any URL starting with /api/auth
// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Admin Assist API' });
});

module.exports = app;
