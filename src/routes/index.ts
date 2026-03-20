import { Router } from "express";
import { facultyRoutes } from "./facultyRoutes";
import { programRoutes } from "./programRoutes";
import { subjectRoutes } from "./subjectRoutes";
import { subscriptionRoutes } from "./subscriptionRoutes";
import { deviceRoutes } from "./deviceRoutes";
import { adminRoutes } from "./adminRoutes";

export const apiRoutes = Router();

apiRoutes.use(facultyRoutes);
apiRoutes.use(programRoutes);
apiRoutes.use(subjectRoutes);
apiRoutes.use(subscriptionRoutes);
apiRoutes.use(deviceRoutes);
apiRoutes.use(adminRoutes);

