import { Router, type IRouter } from "express";
import healthRouter from "./health";
import discoveryRouter from "./discovery";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(discoveryRouter);
router.use(adminRouter);

export default router;
