import { Router, type IRouter } from "express";
import healthRouter from "./health";
import discoveryRouter from "./discovery";
import adminRouter from "./admin";
import contactRouter from "./contact";
import crmRouter from "./crm";
import phoneRouter from "./phone";
import copilotRouter from "./copilot";

const router: IRouter = Router();

router.use(healthRouter);
router.use(discoveryRouter);
router.use(adminRouter);
router.use(contactRouter);
router.use(crmRouter);
router.use(phoneRouter);
router.use(copilotRouter);

export default router;
