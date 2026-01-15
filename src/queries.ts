import {pool} from "./pool";
import type { PoolClient } from "pg";
import redis from "../src/redis/redisClient"
import crypto from "crypto";
import bcrypt from "bcrypt";


type Fn = (...params: number[]) => number

function memoize(fn: Fn): Fn {
    const cache = new Map<string, any>();

    return function(...args) {
        // 假設，args是[2, 3]，變成"[2, 3]"字串
        // 把傳入的參數，變成字串，作為索引值
       const key:string = JSON.stringify(args);

       if (cache.has(key)) {
           return cache.get(key);
       } else {
           console.log(...args);
           // 把[2, 3]傳到function
           const val = fn(...args);

           //key="[2, 3]", val=5(function回傳值)
           cache.set(key, val);

           return val;
       }
    }
}

let callCount = 0;
const memoizedFn = memoize(function (a, b) {
    callCount += 1;
    return a + b;
})
memoizedFn(2, 3) // 5
memoizedFn(2, 3) // 5
 console.log(callCount) // 1


