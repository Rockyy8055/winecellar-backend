const basicAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header missing" });
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString(
    "ascii"
  );
  const [username, password] = credentials.split(":");

  const validUsername = "admin";
  const validPassword = "password";

  if (username === validUsername && password === validPassword) {
    next();
  } else {
    return res.status(401).json({ error: "Invalid credentials" });
  }
};

module.exports = basicAuth;
