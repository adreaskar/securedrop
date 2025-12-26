const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const config = require("../config");

// Create JWKS client for Keycloak public key verification
const client = jwksClient({
  jwksUri: `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
});

// Get signing key from Keycloak
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

// Middleware to verify Keycloak JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.substring(7);

  jwt.verify(
    token,
    getKey,
    {
      issuer: `${config.keycloak.url}/realms/${config.keycloak.realm}`,
      algorithms: ["RS256"],
    },
    (err, decoded) => {
      if (err) {
        console.error("Token verification failed:", err.message);
        return res.status(401).json({ error: "Invalid token" });
      }

      // Attach user info to request
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        username: decoded.preferred_username,
      };

      next();
    }
  );
};

module.exports = verifyToken;
