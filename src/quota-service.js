// Browser-local waiting state. Passwords and OTPs are never queued or stored.
export const QUOTA_WAIT_KEY = 'amanah:service-wait:v1'
export const RECOVERY_QUEUE_KEY = 'amanah:recovery-queue:v1'
export const QUOTA_CHECK_INTERVAL = 10 * 60 * 1000
export const EMAIL_RETRY_INTERVAL = 60 * 60 * 1000
export const WAIT_EVENT = 'amanah:service-wait-changed'
const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
const write = (key, value) => { try { if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key) } catch {} }
const signal = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(WAIT_EVENT)) }
export const getServiceWait = () => read(QUOTA_WAIT_KEY)
export const getPendingRecovery = () => read(RECOVERY_QUEUE_KEY)
export const isQuotaError = error => Number(error?.status) === 402 || /exceed[_-]egress[_-]quota|service for this project is restricted/i.test(String(error?.message || error || ''))
export const isEmailRateError = error => Number(error?.status) === 429 || /rate limit|too many requests|email.*limit/i.test(String(error?.message || ''))
export function markQuotaWait() {
  const now = Date.now(), previous = getServiceWait()
  const nextCheckAt = previous?.type === 'quota' && previous?.nextCheckAt > now ? previous.nextCheckAt : now + QUOTA_CHECK_INTERVAL
  write(QUOTA_WAIT_KEY, {type:'quota', since:previous?.type === 'quota' ? previous.since : now, nextCheckAt})
  signal()
}
export function markEmailWait() {
  const now = Date.now()
  write(QUOTA_WAIT_KEY, {type:'email', since:now, nextCheckAt:now + EMAIL_RETRY_INTERVAL})
  signal()
}
export function postponeQuotaCheck(ms = QUOTA_CHECK_INTERVAL) {
  const previous = getServiceWait()
  if (previous?.type !== 'quota') return
  write(QUOTA_WAIT_KEY, {...previous, nextCheckAt:Date.now() + ms})
  signal()
}
export function queueRecovery(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return
  const current = getPendingRecovery()
  if (current?.email === normalized) return
  write(RECOVERY_QUEUE_KEY, {email:normalized, requestedAt:Date.now(), nextAttemptAt:0})
  signal()
}
export function deferRecovery(ms = EMAIL_RETRY_INTERVAL) {
  const queued = getPendingRecovery()
  if (queued) { write(RECOVERY_QUEUE_KEY, {...queued, nextAttemptAt:Date.now() + ms}); signal() }
}
export function clearPendingRecovery() { write(RECOVERY_QUEUE_KEY, null); signal() }
export function markRecoverySent() {
  write(QUOTA_WAIT_KEY, {type:'sent', since:Date.now()})
  signal()
}
export function clearServiceWait() { write(QUOTA_WAIT_KEY, null); signal() }
