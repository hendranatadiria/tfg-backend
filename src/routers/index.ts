import express, {Router} from "express";
import { showIndex } from "../controllers";

const app = express();
const router = Router();

router.get("/", showIndex);


export const indexRouter = router;