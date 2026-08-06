import type { SceneDocument } from './schema';

let counter = 0;
/** Stable, readable ids. Deliberately not random: a diffable id makes a
 *  generated document reviewable in a pull request. */
export function uid(prefix = 'n'): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

// The seed document stands in for what generation will eventually produce. It
// is hand-authored on purpose: the editor has to be provably good at editing a
// tree before anything is allowed to write one automatically.
export const seedDocument: SceneDocument = {
  name: 'Plan',
  root: {
    id: 'screen',
    name: 'Screen',
    type: 'screen',
    props: {
      background: '#0F0F11',
      padding: 20,
      gap: 18,
      direction: 'vertical',
      align: 'leading',
    },
    children: [
      {
        id: 'header',
        name: 'Header',
        type: 'stack',
        props: {
          direction: 'vertical',
          gap: 4,
          padding: 0,
          align: 'leading',
          opacity: 100,
        },
        children: [
          {
            id: 'eyebrow',
            name: 'Eyebrow',
            type: 'text',
            props: {
              content: 'PREMIUM PLAN',
              size: 11,
              weight: 'semibold',
              color: '#A8A8B0',
              opacity: 100,
            },
          },
          {
            id: 'title',
            name: 'Title',
            type: 'text',
            props: {
              content: 'Welcome back, Asha',
              size: 24,
              weight: 'semibold',
              color: '#F2F2F5',
              opacity: 100,
            },
          },
        ],
      },
      {
        id: 'card',
        name: 'Plan Card',
        type: 'box',
        props: {
          fill: {
            type: 'gradient',
            angle: 135,
            stops: [
              { pos: 0, color: '#FF9E45' },
              { pos: 100, color: '#E85D75' },
            ],
          },
          cornerRadius: 18,
          height: 132,
          shadow: true,
          opacity: 100,
        },
      },
      {
        id: 'actions',
        name: 'Actions',
        type: 'stack',
        props: {
          direction: 'vertical',
          gap: 10,
          padding: 0,
          align: 'leading',
          opacity: 100,
        },
        children: [
          {
            id: 'upgrade',
            name: 'Upgrade',
            type: 'button',
            props: {
              label: 'Upgrade now',
              fill: { type: 'solid', color: '#FF9E45' },
              textColor: '#0F0F11',
              cornerRadius: 12,
              height: 48,
              opacity: 100,
            },
          },
          {
            id: 'details',
            name: 'View Details',
            type: 'button',
            props: {
              label: 'View details',
              fill: { type: 'solid', color: '#5B8DBE' },
              textColor: '#F2F2F5',
              cornerRadius: 12,
              height: 44,
              opacity: 100,
            },
            interaction: {
              trigger: 'tap',
              action: 'openSheet',
              actionLabel: 'Plan details',
              motion: { type: 'spring', stiffness: 210, damping: 16 },
            },
          },
        ],
      },
    ],
  },
};
