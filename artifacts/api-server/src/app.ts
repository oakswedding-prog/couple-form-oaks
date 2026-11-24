import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import registerAiRoutes from "./routes/ai";
import { createAiProtection } from "./lib/ai-security";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(createAiProtection());
registerAiRoutes(app);

app.use("/api", router);

const jsonErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (err.type === "entity.too.large") {
    res.status(413).json({ error: "Request body exceeds 256 KB" });
  } else if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON" });
  } else {
    next(err);
  }
};
app.use(jsonErrors);

export default app;
