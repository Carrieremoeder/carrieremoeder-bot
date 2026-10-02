// Server-only, read-only test adapter. No collection or cancellation mutations.
export function mollieReader({ key = process.env.MOLLIE_API_KEY, fetcher = fetch } = {}) {
  if (!/^test_[A-Za-z0-9]+$/.test(key || '')) throw new Error('Mollie test configuration required');
  function id(value, prefix) {
    if (typeof value !== 'string' || !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)) throw new Error('Invalid Mollie identifier');
    return value;
  }
  async function read(path, expectedId, resource) {
    let response;
    try {
      response = await fetcher(`https://api.mollie.com/v2/${path}`, {
        method: 'GET', redirect: 'error', cache: 'no-store',
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
    } catch { throw new Error('Mollie unavailable'); }
    // Never copy provider error bodies or request headers into logs/errors.
    if (!response.ok) throw new Error('Mollie request failed');
    let data;
    try { data = await response.json(); } catch { throw new Error('Invalid Mollie response'); }
    if (!data || data.id !== expectedId || data.resource !== resource || data.mode !== 'test') throw new Error('Mollie response identity mismatch');
    return data;
  }
  return {
    payment(paymentId) {
      const value = id(paymentId, 'tr');
      return read(`payments/${value}`, value, 'payment');
    },
    subscription(customerId, subscriptionId) {
      const customer = id(customerId, 'cst');
      const subscription = id(subscriptionId, 'sub');
      return read(`customers/${customer}/subscriptions/${subscription}`, subscription, 'subscription');
    },
  };
}

