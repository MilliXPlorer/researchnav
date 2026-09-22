/** Authenticated routes; everything else resolves to the public landing page. */
export function isProtectedRoute(pathname: string): boolean {
  return (
    pathname === "/app" ||
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
