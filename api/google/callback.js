import { put } from "@vercel/blob";

const REDIRECT =
  "https://practicepal-ai-test.vercel.app/api/google/callback";

function readCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map(x => x.trim())
      .filter(Boolean)
      .map(x => {
        const i = x.indexOf("=");

        return i < 0
          ? [x, ""]
          : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
      })
  );
}

export default async function handler(req, res) {
  try {
    const cookies = readCookies(req.headers.cookie);
    const state = String(req.query.state || "");

    if (!state || state !== cookies.pp_google_oauth_state) {
      return res.status(400).send("Invalid OAuth state.");
    }

    if (req.query.error) {
      return res.redirect("/?calendar=denied");
    }

    const body = new URLSearchParams({
      code: String(req.query.code || ""),
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code"
    });

    const response = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      }
    );

    if (!response.ok) {
      throw new Error("Google token exchange failed");
    }

    const token = await response.json();
    token.saved_at = Date.now();

    await put(
      "practicepal/google-token.json",
      JSON.stringify(token),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json"
      }
    );

    res.setHeader(
      "Set-Cookie",
      "pp_google_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    );

    return res.redirect("/?calendar=connected");
  } catch (error) {
    console.error(error);
    return res.status(500).send("Calendar connection failed");
  }
}
