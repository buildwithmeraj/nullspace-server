import express from "express";
import { protect } from "../middleware/auth";
import { aiControllers } from "../controllers/ai.controller";

const router = express.Router();

// AI utilities are authenticated actions.
router.use(protect);

router.post("/enhance", aiControllers.enhancePost);

export const AiRoutes = router;

