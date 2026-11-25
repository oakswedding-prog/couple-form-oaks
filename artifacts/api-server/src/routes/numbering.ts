import { Router, type IRouter } from "express";
import { handleSubmissionNumberingRequest } from "@workspace/submission-numbering";

const router: IRouter = Router();

router.post("/numbering", async (req, res): Promise<void> => {
  const result = await handleSubmissionNumberingRequest({
    authorization: req.get("authorization"),
    body: req.body,
  });
  if (result.status >= 500) {
    req.log.error(
      { status: result.status, code: result.body.code },
      "Submission numbering request failed"
    );
  }
  res.status(result.status).json(result.body);
});

export default router;
