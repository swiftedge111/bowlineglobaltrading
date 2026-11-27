/**
 * Tells anything showing review-queue counts (the admin tab bar's badges) that
 * a deposit or withdrawal was just decided, so they refresh straight away
 * instead of waiting for the next page change.
 */
const QUEUES_CHANGED = "bowline:admin-queues-changed"

export function notifyQueuesChanged() {
  window.dispatchEvent(new Event(QUEUES_CHANGED))
}

export function onQueuesChanged(listener: () => void): () => void {
  window.addEventListener(QUEUES_CHANGED, listener)
  return () => window.removeEventListener(QUEUES_CHANGED, listener)
}
