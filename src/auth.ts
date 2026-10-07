import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { encryptToken } from "@/lib/crypto";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/", error: "/" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  logger: {
    error() {
      console.error("Authentication failed. Check Google OAuth configuration.");
    },
  },
  callbacks: {
    async signIn({ account, profile }) {
      return (
        account?.provider === "google" &&
        profile?.email_verified === true &&
        !!profile.sub &&
        !!profile.email
      );
    },
    async jwt({ token, account, profile }) {
      if (account && profile?.sub && profile.email && profile.email_verified) {
        const existing = await db.user.findFirst({
          where: { googleId: profile.sub },
        });
        // Never silently link an unrelated existing account by email.
        const emailOwner = await db.user.findUnique({
          where: { email: profile.email.toLowerCase() },
        });
        if (emailOwner && emailOwner.id !== existing?.id)
          throw new Error("Account requires administrator review.");
        const scopes = new Set((account.scope ?? "").split(" "));
        const gmailAuthorized =
          scopes.has("https://www.googleapis.com/auth/gmail.send") &&
          scopes.has("https://www.googleapis.com/auth/gmail.readonly");
        const data = {
          email: profile.email.toLowerCase(),
          name: profile.name ?? null,
          gmailAuthorized,
          ...(account.refresh_token
            ? { encryptedRefreshToken: encryptToken(account.refresh_token) }
            : {}),
        };
        const user = existing
          ? await db.user.update({ where: { id: existing.id }, data })
          : await db.user.create({ data: { ...data, googleId: profile.sub } });
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      return session;
    },
  },
});
