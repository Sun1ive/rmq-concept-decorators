import express, { Request, Response } from "express";
import { promisify } from "util";

const router = express.Router();

router.get("/", async (req: Request, res: Response) => {
  await promisify(setTimeout)(5000);
});

export = router;
