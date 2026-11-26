import { Router, type IRouter } from "express";
import {
  NumberingServiceError,
  readAdminMoodboardImage,
} from "@workspace/submission-numbering";

const router: IRouter = Router();

router.post("/moodboard-image", async (req, res): Promise<void> => {
  const source = req.body?.source;
  if (typeof source !== "string" || source.length > 4096) {
    res.status(400).json({
      success: false,
      code: "invalid_media_source",
      error: "A valid image source is required.",
    });
    return;
  }

  try {
    const image = await readAdminMoodboardImage({
      authorization: req.get("authorization"),
      source,
    });
    res
      .setHeader("Content-Type", image.contentType)
      .setHeader("Content-Length", String(image.bytes.byteLength))
      .setHeader("Cache-Control", "private, no-store")
      .setHeader("X-Content-Type-Options", "nosniff")
      .status(200)
      .send(image.bytes);
  } catch (error) {
    if (error instanceof NumberingServiceError) {
      res.status(error.status).json({
        success: false,
        code: error.code,
        error: error.message,
      });
      return;
    }
    req.log.error(
      { errorType: error instanceof Error ? error.name : "unknown" },
      "Could not load a moodboard image"
    );
    res.status(500).json({
      success: false,
      code: "image_unavailable",
      error: "The original image could not be downloaded.",
    });
  }
});

export default router;
