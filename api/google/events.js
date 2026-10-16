import { get, put } from "@vercel/blob";

const TOKEN_PATH = "practicepal/google-token.json";

async function loadToken() {
  const result = await get(TOKEN_PATH, { access: "private" });

  if (!result || result.statusCode !== 200) {
    return null;
  }

  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

async function refreshToken(token) {
  const age = Date.now() - (token.saved_at || 0);
  const lifetime = (token.expires_in || 3600) * 1000;

  if (age < lifetime - 60000) {
    return token;
  }

  if (!token.refresh_token) {
    return token;
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: token.refresh_token,
    grant_type: "refresh_token"
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
    throw new Error("Google token refresh failed");
  }

  const refreshed = await response.json();

  const merged = {
    ...token,
    ...refreshed,
    saved_at: Date.now()
  };

  await put(
    TOKEN_PATH,
    JSON.stringify(merged),
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    }
  );

  return merged;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    let token = await loadToken();

    if (!token) {
      return res.status(401).json({
        connected: false
      });
    }

    token = await refreshToken(token);

    const timeMin = new Date();
    const timeMax = new Date(
      Date.now() + 48 * 60 * 60 * 1000
    );

    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20"
    });

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?" +
        params.toString(),
      {
        headers: {
          Authorization: "Bearer " + token.access_token
        }
      }
    );

    if (!response.ok) {
      console.error(
        "Calendar API error:",
        response.status
      );

      return res.status(response.status).json({
        error: "Calendar read failed"
      });
    }

    const data = await response.json();

    const events = (data.items || []).map(event => ({
      id: event.id,
      summary: event.summary || "",
      start:
        event.start?.dateTime ||
        event.start?.date ||
        "",
      end:
        event.end?.dateTime ||
        event.end?.date ||
        ""
    }));

    return res.status(200).json({
      connected: true,
      events
    });
  } catch (error) {
    if (
      String(error?.message || error)
        .toLowerCase()
        .includes("not found")
    ) {
      return res.status(401).json({
        connected: false
      });
    }

    console.error(error);

    return res.status(500).json({
      error: "Calendar read failed"
    });
  }
}
