// pos-frontend/src/features/admin/utils/codeGeneration.ts
// Shared utility functions for code generation across admin modals

export function slugifyLocal(text: string): string {
  return (text || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function stripTenantPrefix(code: string): string {
  return (code || "").replace(/^(tnt|str|rgt|tct|trl|prd|var)-/i, "");
}

export const CODE_PREFIXES: Record<string, string> = {
  store: "STR",
  register: "RGT",
  taxcategory: "TCT",
  taxrule: "TRL",
  product: "PRD",
  variants: "VAR",
};

