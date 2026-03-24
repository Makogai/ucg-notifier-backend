import { Router } from "express";
import { facultyRoutes } from "./facultyRoutes";
import { programRoutes } from "./programRoutes";
import { subjectRoutes } from "./subjectRoutes";
import { subscriptionRoutes } from "./subscriptionRoutes";
import { deviceRoutes } from "./deviceRoutes";
import { adminRoutes } from "./adminRoutes";
import { professorRoutes } from "./professorRoutes";
import { postRoutes } from "./postRoutes";

export const apiRoutes = Router();

apiRoutes.use(facultyRoutes);
apiRoutes.use(postRoutes);
apiRoutes.use(programRoutes);
apiRoutes.use(subjectRoutes);
apiRoutes.use(subscriptionRoutes);
apiRoutes.use(deviceRoutes);
apiRoutes.use(adminRoutes);
apiRoutes.use(professorRoutes);

