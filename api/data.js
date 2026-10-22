import { put, list, get } from "@vercel/blob";

const DATA_PATH = "practicepal/data.json";

export default async function handler(req, res) {
  try {
    // READ cloud data
    if (req.method === "GET") {
      const { blobs } = await list({
        prefix: DATA_PATH,
        limit: 1
      });

      const blob = blobs.find(
        (item) => item.pathname === DATA_PATH
      );

      if (!blob) {
        return res.status(404).json({
          error: "No cloud data yet"
        });
      }

      // Private Blob must be read with get()
      const result = await get(DATA_PATH, {
        access: "private"
      });

      if (!result || result.statusCode !== 200) {
        throw new Error("Could not read cloud data");
      }

      const text = await new Response(result.stream).text();
      const state = JSON.parse(text);

      return res.status(200).json(state);
    }

    // SAVE cloud data
    if (req.method === "PUT") {
      const state = req.body;

      if (
        !state ||
        typeof state !== "object" ||
        !Array.isArray(state.students)
      ) {
        return res.status(400).json({
          error: "Invalid PracticePal state"
        });
      }

      const blob = await put(
        DATA_PATH,
        JSON.stringify(state),
        {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json"
        }
      );

      return res.status(200).json({
        ok: true,
        pathname: blob.pathname
      });
    }

    res.setHeader("Allow", "GET, PUT");

    return res.status(405).json({
      error: "Method not allowed"
    });

  } catch (error) {
    console.error("PracticePal data API error:", error);

    return res.status(500).json({
      error: "Cloud storage unavailable"
    });
  }
}
