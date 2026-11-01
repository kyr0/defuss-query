#!/usr/bin/env bun
/**
 * Why: manual launcher for the examples/ page (at /) and the docs site (at
 * /docs/). Tests use server.ts directly on ephemeral ports; this script is
 * for humans trying the bundles by hand on a fixed port (PORT env, default
 * 8080). VERIFIED: the docs pages use relative asset paths, so they work
 * under /docs/ here and at the root of query.defuss.org.
 */
import { resolve } from "node:path";
import { serve } from "./server.ts";
const { url } = await serve(
  resolve(import.meta.dirname, ".."),
  Number(process.env.PORT ?? 8080),
);
console.log(url);
