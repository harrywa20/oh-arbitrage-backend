import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db.js";
import { randomUUID } from "crypto";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, region: user.region }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, region: user.region } });
});

// admin-only: create analyst/admin accounts
authRouter.post("/users", requireAuth, requireRole("admin"), (req, res) => {
  const { email, password, role = "analyst", region = null } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const hash = bcrypt.hashSync(password, 10);
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO users (id, email, password_hash, role, region) VALUES (?, ?, ?, ?, ?)").run(
      id,
      email,
      hash,
      role,
      region
    );
    res.status(201).json({ id, email, role, region });
  } catch (e) {
    res.status(409).json({ error: "email already exists" });
  }
});

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "invalid or expired token" });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: "insufficient permissions" });
    next();
  };
}
