const jwt = require("jsonwebtoken");

/**
 * authenticate
 * Validates the Bearer token in the Authorization header.
 * Attaches the decoded payload to req.user on success.
 */
const authenticate = (req, res, next) => {
    const header = req.headers.authorization || "";
    const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: "Authentication required" });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        // Distinguish expired tokens from tampered ones for clearer client errors
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Session expired, please log in again" });
        }
        return res.status(401).json({ error: "Invalid token" });
    }
};

/**
 * authorize(...roles)
 * Must be used AFTER authenticate.
 * Blocks access if the user's role is not in the allowed list.
 *
 * Usage:
 *   router.get("/admin-only", authenticate, authorize("admin"), handler)
 *   router.get("/staff-area", authenticate, authorize("admin", "staff"), handler)
 */
const authorize = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: "You do not have permission to access this resource" });
    }
    next();
};

module.exports = { authenticate, authorize };