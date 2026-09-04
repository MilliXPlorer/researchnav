/** Authenticated routes; everything else resolves to the public landing page. */
export function isProtectedRoute(pathname: string): boolean {
  return (
    pathname === "/app" ||
    /^\/app\/researcher\/(submissions|similarity|related-studies)$/.test(
      pathname,
    ) ||
    /^\/research\/\d+$/.test(pathname)
  );
}
