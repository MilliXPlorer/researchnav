/** Authenticated routes; everything else resolves to the public landing page. */
export function isProtectedRoute(pathname: string): boolean {
  return (
    pathname === "/app" ||
    /^\/app\/(?:admin|researcher|adviser|instructor|panel|statistician|coordinator|librarian|research-office|research_editor)\/[a-z0-9-]+$/.test(
      pathname,
    ) ||
    /^\/app\/instructor\/sections(?:\/\d+(?:\/projects\/\d+)?)?$/.test(
      pathname,
    ) ||
    /^\/app\/researcher\/(?:submissions|related-studies|similarity(?:\/(?:title|content))?)$/.test(
      pathname,
    ) ||
    /^\/app\/research-office\/similarity(?:\/(?:title|content))?$/.test(
      pathname,
    ) ||
    /^\/research\/\d+$/.test(pathname)
  );
}

export function navItemPath(role: string, item: string): string {
  const slug = item
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `/app/${role}/${slug}`;
}
