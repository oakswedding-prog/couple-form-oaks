import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notifyHandler from "./notify";
import numberingRouter from "./numbering";
import moodboardImageRouter from "./moodboardImage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(numberingRouter);
router.use(moodboardImageRouter);
router.all("/notify", notifyHandler);

export default router;
