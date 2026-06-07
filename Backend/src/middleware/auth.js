const jwt = require("jsonwebtoken");

const getBearerToken = (req) => {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : null;
};

const authenticate = (req, res, next) => {
    const token = getBearerToken(req);

    if (!token) {
        return res.status(401).json({ error: "Authentication required" });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Session expired, please log in again" });
        }
        return res.status(401).json({ error: "Invalid token" });
    }
};

const authorize = (...roles) => (req, res, next) => {
    if (roles.length === 0) return next();

    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: "You do not have permission to access this resource" });
    }

    next();
};

const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

/**
 * requireAuth(handler)
 * requireAuth(["admin", "headmaster"], handler)
 *
 * Decorates a route handler so the route is blocked unless the request has a
 * valid JWT. Pass roles to also restrict access by role.
 */
const requireAuth = (rolesOrHandler, maybeHandler) => {
    const roles = Array.isArray(rolesOrHandler) ? rolesOrHandler : [];
    const handler = Array.isArray(rolesOrHandler) ? maybeHandler : rolesOrHandler;

    if (typeof handler !== "function") {
        throw new TypeError("requireAuth expects a route handler function");
    }

    return (req, res, next) => {
        authenticate(req, res, (authErr) => {
            if (authErr) return next(authErr);

            const runHandler = () => asyncHandler(handler)(req, res, next);
            if (roles.length === 0) return runHandler();

            return authorize(...roles)(req, res, (roleErr) => {
                if (roleErr) return next(roleErr);
                return runHandler();
            });
        });
    };
};

module.exports = { authenticate, authorize, requireAuth };
