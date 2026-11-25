export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      code: "method_not_allowed",
      error: "Method not allowed.",
    });
  }

  try {
    const { handleSubmissionNumberingRequest } = await import(
      "@workspace/submission-numbering"
    );
    const result = await handleSubmissionNumberingRequest({
      authorization: req.headers?.authorization,
      body: req.body,
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}` : "Unknown startup error";
    return res.status(500).json({
      success: false,
      code: "numbering_function_unavailable",
      error:
        req.headers?.["x-oaks-numbering-diagnostic"] === "check"
          ? detail.slice(0, 240)
          : "The secure numbering service is temporarily unavailable.",
    });
  }
}
