import { Router, type IRouter } from "express";
import healthRouter from "./health";
import discoveryRouter from "./discovery";
import adminRouter from "./admin";
import contactRouter from "./contact";
import crmRouter from "./crm";
import crmProjectsRouter from "./crmProjects";
import crmDiscoveryRouter from "./crmDiscovery";
import phoneRouter from "./phone";
import copilotRouter from "./copilot";
import aiToolkitRouter from "./aiToolkit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(discoveryRouter);
router.use(adminRouter);
router.use(contactRouter);
router.use(crmRouter);
router.use(crmProjectsRouter);
router.use(crmDiscoveryRouter);
router.use(phoneRouter);
router.use(copilotRouter);
router.use(aiToolkitRouter);

export default router;
