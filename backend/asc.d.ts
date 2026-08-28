/**
 * Types for the plain-JavaScript asc sub-app.
 *
 * The module builds a Hono instance and default-exports it. Declaring it here
 * keeps the mount site in server.ts typed without enabling allowJs for the
 * whole backend, and without an implicit any.
 */
import type { Hono } from 'hono';

declare const app: Hono;
export default app;
