import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react-native/schema';
import { z } from 'zod';

// The single source of truth for what Ozer's model may write. No colour, font,
// size or style props anywhere: visual style only comes from presets.
// Bump on breaking changes (renamed prop, removed component) and ship a migration.
export const CATALOG_VERSION = 1;

export const ICONS = [
  'cart', 'refund', 'star', 'invoice', 'ad', 'lead', 'ticket', 'payment',
  'order', 'email', 'website', 'alert', 'check', 'clock', 'user',
] as const;

export const BACKGROUNDS = ['plain', 'aurora', 'sunset', 'ocean', 'glass'] as const;

export const catalog = defineCatalog(schema, {
  components: {
    // ── Ozer components (8) ──
    BriefCard: {
      props: z.object({
        title: z.string(),
        subtitle: z.string().nullish(),
        background: z.enum(BACKGROUNDS),
      }),
      slots: ['default'],
      description: 'Container for every card reply. Always the root.',
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string().describe('Pre-formatted by tools, e.g. "$4,210". Never format numbers yourself.'),
        change: z.number().nullish().describe('% change vs previous period'),
      }),
      slots: [],
      description: 'One headline number. Only inside MetricRow.',
    },
    MetricRow: {
      props: z.object({}),
      slots: ['default'],
      description: '2–4 Metric children side by side.',
    },
    List: {
      props: z.object({ title: z.string().nullish() }),
      slots: ['default'],
      description: 'ListItem children: carts, leads, tickets, orders, reviews. Max 5 items.',
    },
    ListItem: {
      props: z.object({
        icon: z.enum(ICONS),
        title: z.string(),
        detail: z.string().nullish(),
        amount: z.string().nullish(),
      }),
      slots: [],
      description: 'One row in a List.',
    },
    Quote: {
      props: z.object({
        text: z.string(),
        author: z.string().nullish(),
        rating: z.number().int().min(1).max(5).nullish(),
      }),
      slots: [],
      description: 'A review or customer message.',
    },
    Chart: {
      props: z.object({
        type: z.enum(['bar', 'line']),
        data: z.array(z.object({ x: z.string(), y: z.number() })).min(2).max(50),
        yLabel: z.string().nullish(),
      }),
      slots: [],
      description: 'Ads or sales trend.',
    },
    ActionRow: {
      props: z.object({}),
      slots: ['default'],
      description: '1–3 Button children. Replaced by the result once an action has run.',
    },

    // ── Inputs and text, Ozer-styled (PRD fallback: the standard RN set has colour props and no picker) ──
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(['primary', 'secondary']).nullish(),
      }),
      events: ['press'],
      slots: [],
      description: 'Bind an action with on.press. Only inside ActionRow.',
    },
    Text: {
      props: z.object({ text: z.string() }),
      slots: [],
      description: 'A short line of supporting text.',
    },
    Textarea: {
      props: z.object({ label: z.string().nullish(), value: z.string().nullish() }),
      slots: [],
      description: 'Multiline editable text. Bind value with $bindState.',
    },
    Select: {
      props: z.object({
        label: z.string().nullish(),
        options: z.array(z.string()).min(2).max(6),
        value: z.string().nullish(),
      }),
      slots: [],
      description: 'Pick one option. Bind value with $bindState.',
    },
    Switch: {
      props: z.object({ label: z.string(), checked: z.boolean().nullish() }),
      slots: [],
      description: 'On/off. Bind checked with $bindState.',
    },
    AmountInput: {
      props: z.object({ label: z.string().nullish(), value: z.string().nullish(), max: z.number().nullish() }),
      slots: [],
      description: 'Editable money amount (numbers only). Bind value with $bindState.',
    },
  },

  // Params are validated again on the server as untrusted input.
  actions: {
    recover_carts: {
      params: z.object({ cartIds: z.array(z.string()).min(1) }),
      description: 'Send reminders to abandoned carts.',
    },
    send_review_reply: {
      params: z.object({
        reviewId: z.string(),
        text: z.string().min(1).max(1000),
        offer: z.enum(['None', '10% off next order', 'Free shipping next order']),
        refundShipping: z.boolean(),
        shippingFee: z.number().nullish(),
      }),
      description: 'Publish a reply to a review, optionally with an offer and a shipping refund.',
    },
    approve_refund: {
      params: z.object({ orderId: z.string(), customer: z.string(), amount: z.coerce.number().positive(), orderTotal: z.number() }),
      description: 'Refund an order. The app always confirms first.',
    },
    pause_campaign: {
      params: z.object({ campaignId: z.string(), name: z.string() }),
      description: 'Pause an ad campaign. The app confirms first.',
    },
    send_message: {
      params: z.object({ text: z.string().min(1) }),
      description: "Send text as the owner's next chat message.",
    },
    dismiss: {
      params: z.object({ itemId: z.string() }),
      description: 'Hide an item.',
    },
  },
});

export type ActionName = keyof typeof catalog.data.actions;
export const MONEY_ACTIONS: ActionName[] = ['approve_refund', 'pause_campaign'];
export const TEAM_ACTIONS: ActionName[] = ['send_review_reply', 'recover_carts', 'send_message', 'dismiss'];
