// @ts-nocheck -- node script, not app code
// Regression check: every fixture validates, streams back identically, and the mock server's rules hold.
// Run: npx tsx ozer/check.ts
import { createSpecStreamCompiler } from '@json-render/core';
import assert from 'node:assert';
import { catalog } from './catalog';
import { route, SUGGESTIONS } from './fixtures';
import { dev, MockActionClient, toSpecStream } from './mock';

async function main() {
  for (const q of SUGGESTIONS) {
    const { spec } = route(q);
    assert(spec, q);
    const v = catalog.validate(spec);
    assert(v.success, `${q} ${JSON.stringify(v.error?.issues)}`);
    for (const el of Object.values(spec.elements))
      for (const b of Object.values(el.on ?? {})) assert(catalog.actionNames.includes((b as { action: string }).action));
    const c = createSpecStreamCompiler();
    const s = toSpecStream(spec);
    for (let i = 0; i < s.length; i += 7) c.push(s.slice(i, i + 7)); // split mid-token
    assert.deepStrictEqual(c.getResult(), spec);
  }
  assert(!route('Did Priya’s refund go through?').spec, 'one-fact question must stay text');

  const a = new MockActionClient();
  const run = (action: any, params: object, key = String(Math.random())) => a.run({ cardId: 'c', action, params: params as any, idempotencyKey: key });
  assert.equal((await run('approve_refund', { orderId: 'o', customer: 'P', amount: '60', orderTotal: 49 })).status, 'rejected');
  assert.equal((await run('approve_refund', { orderId: 'o', customer: 'P', amount: '49', orderTotal: 49 }, 'k')).message, 'Refunded $49 to P');
  assert.equal((await run('send_review_reply', { reviewId: 'r', text: '', offer: 'None', refundShipping: false })).status, 'rejected');
  dev.role = 'team';
  assert.equal((await run('pause_campaign', { campaignId: 'x', name: 'y' })).status, 'rejected');
  assert.equal((await run('send_review_reply', { reviewId: 'r', text: 'hi', offer: 'None', refundShipping: true, shippingFee: 6 })).status, 'rejected');
  assert.equal((await run('recover_carts', { cartIds: ['a', 'b'] })).message, 'Sent to 2 customers');
  console.log('ozer check ok');
}
main();
