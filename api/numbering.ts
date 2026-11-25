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
      "../lib/submission-numbering/dist/index.js"
    );
    const result = await handleSubmissionNumberingRequest({
      authorization: req.headers?.authorization,
      body: req.body,
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error(
      "The submission numbering function could not start.",
      error instanceof Error ? error.name : "Unknown error"
    );
    return res.status(500).json({
      success: false,
      code: "numbering_function_unavailable",
      error: "The secure numbering service is temporarily unavailable.",
    });
  }
}
