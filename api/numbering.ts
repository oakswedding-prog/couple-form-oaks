import { handleSubmissionNumberingRequest } from "@workspace/submission-numbering";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      code: "method_not_allowed",
      error: "Method not allowed.",
    });
  }

  const result = await handleSubmissionNumberingRequest({
    authorization: req.headers?.authorization,
    body: req.body,
  });
  return res.status(result.status).json(result.body);
}
