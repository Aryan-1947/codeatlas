// Two schemas doing two different jobs:
//  - buildGraphJsonSchema(): a JSON Schema passed to Groq's strict
//    response_format. Because `path` is an `enum` of real, pre-computed
//    candidate paths, the model *cannot* return a path that doesn't exist in
//    the repo — this is enforced by constrained decoding, not a prompt
//    instruction the model could ignore.
//  - LlmGraphSchema: a zod schema we run locally after parsing, as a second
//    line of defense (a provider outage/downgrade could theoretically send
//    non-conforming JSON; we never trust external input blindly).

import { z } from "zod";
import { NODE_ROLES } from "../types/graph.js";

export const NodeRoleSchema = z.enum(NODE_ROLES as [string, ...string[]]);

export const LlmGraphSchema = z.object({
  groups: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        title: z.string().min(1).max(60),
      }),
    )
    .min(1)
    .max(8),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().min(1).max(60),
        role: NodeRoleSchema,
        group: z.string().min(1).max(40),
        path: z.string().min(1),
        isDirectory: z.boolean(),
        detail: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(16),
  edges: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        label: z.string().max(40).nullable(),
        dashed: z.boolean(),
      }),
    )
    .max(40),
});

export type LlmGraph = z.infer<typeof LlmGraphSchema>;

/**
 * Builds the JSON Schema for Groq's `response_format: { type: "json_schema" }`.
 * `candidatePaths` must be non-empty and come from ContextSummary — every
 * path in it is real, pre-verified against the repo's actual tree.
 */
export function buildGraphJsonSchema(candidatePaths: string[]) {
  return {
    name: "diagram_graph",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["groups", "nodes", "edges"],
      properties: {
        groups: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
            },
          },
        },
        nodes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "role", "group", "path", "isDirectory", "detail"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              role: { type: "string", enum: NODE_ROLES },
              group: { type: "string" },
              // The critical constraint: the model can only choose a path
              // that genuinely exists in this repo's tree.
              path: { type: "string", enum: candidatePaths },
              isDirectory: { type: "boolean" },
              detail: { type: "string" },
            },
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["from", "to", "label", "dashed"],
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              label: { type: ["string", "null"] },
              dashed: { type: "boolean" },
            },
          },
        },
      },
    },
  } as const;
}
