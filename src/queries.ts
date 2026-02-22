import {pool} from "./db/pool";
import type { PoolClient } from "pg";
import crypto from "crypto";
import bcrypt from "bcrypt";


// 用promise.all同時跑1000個請求，可能會讓伺服器壓力過大
// 寫一個function，限制一次跑的最大數量
