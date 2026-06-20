/**
 * 访客 ID 工具 — 从 cookie 读取 pv_id（由后端 set-cookie 管理）
 */

const VISITOR_COOKIE = 'pv_id'

/** 读取 cookie 中的 visitor_id */
export function getVisitorId(): string | null {
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${VISITOR_COOKIE}=`))
  return match ? match.split('=')[1] : null
}
