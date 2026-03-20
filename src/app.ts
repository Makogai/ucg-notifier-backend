import express from "express";
import cors from "cors";
import { apiRoutes } from "./routes";
import { errorMiddleware } from "./middleware/errorMiddleware";

export const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use(apiRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorMiddleware);

