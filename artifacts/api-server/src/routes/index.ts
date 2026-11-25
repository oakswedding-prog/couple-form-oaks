import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notifyHandler from "./notify";
import numberingRouter from "./numbering";

const router: IRouter = Router();

router.use(healthRouter);
router.use(numberingRouter);
router.all("/notify", notifyHandler);

export default router;
