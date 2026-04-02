export const ZONE_COLORS: Record<string, string> = {
  MAZ: "hsl(45, 100%, 58%)",
  APAC: "hsl(34, 7%, 35%)",
  GHQ: "hsl(142, 76%, 36%)",
  SAZ: "hsl(206, 100%, 42%)",
  AFR: "hsl(0, 84%, 60%)",
  NAZ: "hsl(38, 92%, 50%)",
  EU: "hsl(179, 100%, 32%)",
};

export const PLATFORM_COLORS = [
  "hsl(45, 100%, 58%)",
  "hsl(34, 7%, 35%)",
  "hsl(142, 76%, 36%)",
  "hsl(206, 100%, 42%)",
  "hsl(0, 84%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(179, 100%, 32%)",
  "hsl(280, 60%, 50%)",
];

export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 400];

export const chartConfig = {
  count: { label: "Total", color: "hsl(var(--primary))" },
  value: { label: "Total", color: "hsl(var(--primary))" },
  total: { label: "Total", color: "hsl(var(--destructive))" },
  failures: { label: "Failures", color: "hsl(var(--destructive))" },
  automanage: { label: "Automanage", color: "hsl(var(--warning))" },
};

export function getPaginationPages(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (currentPage > 3) pages.push("ellipsis");
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push("ellipsis");
  if (totalPages > 1) pages.push(totalPages);
  return pages;
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.substring(0, max) + "..." : str;
}
