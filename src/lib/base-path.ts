/**
 * basePath 헬퍼 — `next.config.mjs` 의 `basePath` 와 동일 값(`NEXT_PUBLIC_BASE_PATH`).
 *
 * Next.js 는 `<Link>`, `useRouter().push()`, server-side `redirect()` 만 basePath 를
 * 자동 prefix 한다. 다음 호출들은 절대경로를 그대로 사용하므로 수동 prefix 가 필요하다:
 *   - `fetch("/api/...")` (절대경로)
 *   - `window.location.assign("/...")`
 *   - `NextResponse.redirect(new URL("/...", req.url))`
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * 절대경로(`/...`) 앞에 `BASE_PATH` 를 붙인다. 빈 basePath 환경에서는 그대로 반환.
 * 이미 basePath 가 prefix 되어 있으면 중복 prefix 하지 않는다.
 */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (path.startsWith(BASE_PATH + "/") || path === BASE_PATH) return path;
  if (!path.startsWith("/")) return path;
  return `${BASE_PATH}${path}`;
}
