import bcrypt from "bcryptjs";
import { createCookieSessionStorage, redirect } from "react-router";
import prisma from "./db.server";

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-production";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    secrets: [SESSION_SECRET],
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function getSession(request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

export async function createUserSession(userId, redirectTo) {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

export async function getUserId(request) {
  const session = await getSession(request);
  const userId = session.get("userId");
  if (!userId || typeof userId !== "string") {
    return null;
  }
  return userId;
}

export async function getUser(request) {
  const userId = await getUserId(request);
  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: true,
      stores: true,
    },
  });

  return user;
}

export async function requireUser(request) {
  const user = await getUser(request);
  if (!user) {
    throw redirect("/login");
  }
  return user;
}

export async function logout(request) {
  const session = await getSession(request);
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}
