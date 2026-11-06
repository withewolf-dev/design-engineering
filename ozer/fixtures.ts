import type { Spec } from '@json-render/core';

// Saved model replies for the four PRD flows. They double as few-shot examples
// and regression specs once the backend exists.
export type Reply = { text: string; spec?: Spec };

const el = (type: string, props: Record<string, unknown>, children: string[] = []) => ({ type, props, children });
const press = (action: string, params: Record<string, unknown>) => ({ press: { action, params } });

// Flow 1: morning brief
export const brief: Spec = {
  root: 'brief',
  elements: {
    brief: el('BriefCard', { title: 'Morning brief', subtitle: 'Friday, 10 Oct', background: 'aurora' }, ['metrics', 'needs-you', 'actions']),
    metrics: el('MetricRow', {}, ['m-rev', 'm-orders', 'm-ads']),
    'm-rev': el('Metric', { label: 'Revenue', value: '$4,210', change: 12.4 }),
    'm-orders': el('Metric', { label: 'Orders', value: '38', change: 5.0 }),
    'm-ads': el('Metric', { label: 'Ad spend', value: '$310', change: -8.1 }),
    'needs-you': el('List', { title: 'Needs you' }, ['i-carts', 'i-refund', 'i-review']),
    'i-carts': el('ListItem', { icon: 'cart', title: '7 abandoned carts', detail: '$892 total' }),
    'i-refund': el('ListItem', { icon: 'refund', title: 'Refund request from Priya S.', detail: 'Order #1182', amount: '$49' }),
    'i-review': el('ListItem', { icon: 'star', title: 'New 2-star review', detail: 'Shipping took 9 days' }),
    actions: el('ActionRow', {}, ['b-carts', 'b-refund']),
    'b-carts': {
      ...el('Button', { label: 'Send cart reminders', variant: 'primary' }),
      on: press('recover_carts', { cartIds: ['c_101', 'c_102', 'c_103', 'c_104', 'c_105', 'c_106', 'c_107'] }),
    },
    'b-refund': {
      ...el('Button', { label: 'Review refund', variant: 'secondary' }),
      on: press('send_message', { text: "Show me Priya's refund request" }),
    },
  },
};

// Flow 2: reply to a bad review
const review: Spec = {
  root: 'card',
  state: {
    reply: {
      text: "Hi Rahul, sorry your order took 9 days. That's slower than we want. We've switched couriers for your area so it won't happen again.",
      offer: 'None',
      refundShipping: false,
    },
  },
  elements: {
    card: el('BriefCard', { title: 'New 2-star review', subtitle: 'Rahul M. · Order #1204', background: 'sunset' }, [
      'quote', 'reply', 'offer', 'refund', 'refund-note', 'actions',
    ]),
    quote: el('Quote', { text: 'Product is good but shipping took 9 days.', author: 'Rahul M.', rating: 2 }),
    reply: el('Textarea', { label: 'Your reply', value: { $bindState: '/reply/text' } }),
    offer: el('Select', {
      label: 'Add an offer',
      options: ['None', '10% off next order', 'Free shipping next order'],
      value: { $bindState: '/reply/offer' },
    }),
    refund: el('Switch', { label: 'Refund the shipping fee ($6)', checked: { $bindState: '/reply/refundShipping' } }),
    'refund-note': { ...el('Text', { text: '$6 goes back to the original payment method.' }), visible: [{ $state: '/reply/refundShipping' }] },
    actions: el('ActionRow', {}, ['send', 'skip']),
    send: {
      ...el('Button', { label: 'Send reply', variant: 'primary' }),
      on: press('send_review_reply', {
        reviewId: 'r_1204',
        text: { $state: '/reply/text' },
        offer: { $state: '/reply/offer' },
        refundShipping: { $state: '/reply/refundShipping' },
        shippingFee: 6,
      }),
    },
    skip: { ...el('Button', { label: 'Ignore', variant: 'secondary' }), on: press('dismiss', { itemId: 'r_1204' }) },
  },
};

// Flow 3: refund approval (money)
const refund: Spec = {
  root: 'card',
  state: { refund: { amount: '49' } },
  elements: {
    card: el('BriefCard', { title: 'Refund request', subtitle: 'Priya S. · Order #1182', background: 'plain' }, ['order', 'reason', 'amount', 'actions']),
    order: el('List', {}, ['o-item', 'o-paid']),
    'o-item': el('ListItem', { icon: 'order', title: 'Linen tote, sand', detail: 'Delivered 3 Oct', amount: '$49' }),
    'o-paid': el('ListItem', { icon: 'payment', title: 'Paid with Visa •• 4242', detail: '1 Oct' }),
    reason: el('Quote', { text: 'The strap tore on the second day. I’d like my money back.', author: 'Priya S.' }),
    amount: el('AmountInput', { label: 'Refund amount', value: { $bindState: '/refund/amount' }, max: 49 }),
    actions: el('ActionRow', {}, ['approve', 'decline']),
    approve: {
      ...el('Button', { label: 'Approve', variant: 'primary' }),
      on: press('approve_refund', { orderId: 'o_1182', customer: 'Priya S.', amount: { $state: '/refund/amount' }, orderTotal: 49 }),
    },
    decline: {
      ...el('Button', { label: 'Ask Ozer to reply', variant: 'secondary' }),
      on: press('send_message', { text: 'Draft a reply to Priya offering a replacement instead' }),
    },
  },
};

// Flow 4: a question that earns a chart
const ads: Spec = {
  root: 'card',
  elements: {
    card: el('BriefCard', { title: 'Ads this week', subtitle: '4–10 Oct · Meta + Google', background: 'ocean' }, ['metrics', 'chart', 'campaigns', 'actions']),
    metrics: el('MetricRow', {}, ['m-spend', 'm-roas']),
    'm-spend': el('Metric', { label: 'Spend', value: '$1,840', change: 6.2 }),
    'm-roas': el('Metric', { label: 'Return on ad spend', value: '3.1×', change: -4.0 }),
    chart: el('Chart', {
      type: 'line',
      yLabel: 'Sales from ads ($)',
      data: [
        { x: 'Sat', y: 820 }, { x: 'Sun', y: 760 }, { x: 'Mon', y: 910 }, { x: 'Tue', y: 640 },
        { x: 'Wed', y: 880 }, { x: 'Thu', y: 1020 }, { x: 'Fri', y: 690 },
      ],
    }),
    campaigns: el('List', { title: 'Campaigns' }, ['c1', 'c2', 'c3']),
    c1: el('ListItem', { icon: 'ad', title: 'Autumn totes · Instagram', detail: 'ROAS 4.8×', amount: '$720' }),
    c2: el('ListItem', { icon: 'ad', title: 'Brand search · Google', detail: 'ROAS 3.9×', amount: '$540' }),
    c3: el('ListItem', { icon: 'alert', title: 'Retargeting · Facebook', detail: 'ROAS 0.9×, losing money', amount: '$580' }),
    actions: el('ActionRow', {}, ['pause']),
    pause: {
      ...el('Button', { label: 'Pause worst ad', variant: 'primary' }),
      on: press('pause_campaign', { campaignId: 'cmp_fb_rt', name: 'Retargeting · Facebook' }),
    },
  },
};

// First match wins. Text-only rows are the "one fact" answers that must not become cards.
const ROUTES: [RegExp, Reply][] = [
  [/go through|did .*refund/i, { text: 'Yes, $49 refunded to Priya S. yesterday at 4:10 PM.' }],
  [/brief|summary|morning|today/i, { text: 'Here’s today so far. Revenue is up, and three things need you.', spec: brief }],
  [/review/i, { text: 'Rahul left 2 stars about slow shipping. I drafted a reply.', spec: review }],
  [/refund/i, { text: 'Priya wants $49 back for a torn strap. You can change the amount.', spec: refund }],
  [/ads?\b|campaign|roas/i, { text: 'Ads made $5,720 on $1,840 this week. Retargeting is losing money.', spec: ads }],
  [/replace|draft a reply/i, { text: 'Done. I’ll offer Priya a free replacement and hold the refund until she answers.' }],
];

export const SUGGESTIONS = ['Morning brief', 'Any new reviews?', "Show me Priya's refund request", 'How did ads do this week?'];

export function route(message: string): Reply {
  return (
    ROUTES.find(([re]) => re.test(message))?.[1] ?? {
      text: 'I can show your morning brief, new reviews, refund requests or how ads did this week.',
    }
  );
}
