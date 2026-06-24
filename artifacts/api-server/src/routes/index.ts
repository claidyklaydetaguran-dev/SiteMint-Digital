import { Router, type IRouter } from "express";
import healthRouter from "./health";
import discoveryRouter from "./discovery";
import adminRouter from "./admin";
import contactRouter from "./contact";
import crmRouter from "./crm";
import phoneRouter from "./phone";

const router: IRouter = Router();

router.use(healthRouter);
router.use(discoveryRouter);
router.use(adminRouter);
router.use(contactRouter);
router.use(crmRouter);
router.use(phoneRouter);

export default router;
