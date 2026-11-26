export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      code: "method_not_allowed",
      error: "Method not allowed.",
    });
  }

  const source = req.body?.source;
  if (typeof source !== "string" || source.length > 4096) {
    return res.status(400).json({
      success: false,
      code: "invalid_media_source",
      error: "A valid image source is required.",
    });
  }

  try {
    const { readAdminMoodboardImage, NumberingServiceError } = await import(
      "../lib/submission-numbering/dist/index.js"
    );
    const image = await readAdminMoodboardImage({
      authorization: req.headers?.authorization,
      source,
    });
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Content-Length", String(image.bytes.byteLength));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(image.bytes);
  } catch (error) {
    if (error instanceof Error && error.name === "NumberingServiceError") {
      const serviceError = error as Error & { status?: number; code?: string };
      return res.status(serviceError.status || 500).json({
        success: false,
        code: serviceError.code || "image_unavailable",
        error: serviceError.message,
      });
    }
    return res.status(500).json({
      success: false,
      code: "image_unavailable",
      error: "The original image could not be downloaded.",
    });
  }
}
