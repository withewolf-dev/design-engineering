'use client';

import { current } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { seedDocument } from './document';
import type { Fill, Motion, SceneDocument, SceneNode } from './schema';
import { findNode, propsOf } from './schema';

/**
 * Where the inspector is pointed. Selection alone isn't enough — the same node
 * can be inspected as an element, as its fill, or as the motion inside its
 * interaction, and those are different instruments on the same object rather
 * than different objects.
 */
export type Focus = 'node' | 'fill' | 'interaction' | 'motion';

const HISTORY_LIMIT = 100;

interface EditorState {
  doc: SceneDocument;
  selectedId: string | null;
  focus: Focus;
  activeStop: number;
  past: SceneDocument[];
  future: SceneDocument[];

  /** Bumped to ask the canvas to play a node's interaction. A counter rather
   *  than a boolean so pressing Test twice in a row replays rather than
   *  no-opping on an already-true flag. */
  playToken: number;
  playNodeId: string | null;

  select: (id: string | null, focus?: Focus) => void;
  setFocus: (focus: Focus) => void;
  setActiveStop: (index: number) => void;
  requestPlay: (id: string) => void;

  /**
   * Opens a history entry. Called once at the START of a gesture — a pointer
   * press on a scrub field, a click on a swatch — so a drag that emits two
   * hundred updates collapses into a single undo step. Without this the undo
   * stack records frames instead of intentions.
   */
  begin: () => void;

  setProp: (id: string, key: string, value: unknown) => void;
  setFillAngle: (id: string, angle: number) => void;
  setStopPos: (id: string, index: number, pos: number) => void;
  setStopColor: (id: string, index: number, color: string) => void;
  addStop: (id: string, pos: number, color: string) => void;
  removeStop: (id: string, index: number) => void;
  convertFill: (id: string, to: Fill['type']) => void;
  setMotion: (id: string, motion: Motion) => void;

  undo: () => void;
  redo: () => void;
}

/** Reads a node's fill without caring which node type it came from. */
function fillOf(node: SceneNode | null): Fill | null {
  if (!node) return null;
  const fill = propsOf(node).fill;
  return fill && typeof fill === 'object' ? (fill as Fill) : null;
}

export const useEditor = create<EditorState>()(
  immer((set) => ({
    doc: seedDocument,
    selectedId: 'card',
    focus: 'node',
    activeStop: 0,
    past: [],
    future: [],
    playToken: 0,
    playNodeId: null,

    select: (id, focus = 'node') =>
      set((s) => {
        s.selectedId = id;
        s.focus = focus;
        s.activeStop = 0;
      }),

    setFocus: (focus) =>
      set((s) => {
        s.focus = focus;
      }),

    setActiveStop: (index) =>
      set((s) => {
        s.activeStop = index;
      }),

    requestPlay: (id) =>
      set((s) => {
        s.playNodeId = id;
        s.playToken += 1;
      }),

    begin: () =>
      set((s) => {
        s.past.push(current(s.doc));
        if (s.past.length > HISTORY_LIMIT) s.past.shift();
        s.future = [];
      }),

    setProp: (id, key, value) =>
      set((s) => {
        const node = findNode(s.doc.root, id);
        if (!node) return;
        propsOf(node)[key] = value;
      }),

    setFillAngle: (id, angle) =>
      set((s) => {
        const fill = fillOf(findNode(s.doc.root, id));
        if (fill?.type === 'gradient') fill.angle = angle;
      }),

    setStopPos: (id, index, pos) =>
      set((s) => {
        const fill = fillOf(findNode(s.doc.root, id));
        if (fill?.type === 'gradient' && fill.stops[index]) {
          fill.stops[index].pos = pos;
        }
      }),

    setStopColor: (id, index, color) =>
      set((s) => {
        const fill = fillOf(findNode(s.doc.root, id));
        if (fill?.type === 'gradient' && fill.stops[index]) {
          fill.stops[index].color = color;
        } else if (fill?.type === 'solid') {
          fill.color = color;
        }
      }),

    addStop: (id, pos, color) =>
      set((s) => {
        const fill = fillOf(findNode(s.doc.root, id));
        if (fill?.type !== 'gradient' || fill.stops.length >= 8) return;
        fill.stops.push({ pos, color });
        s.activeStop = fill.stops.length - 1;
      }),

    removeStop: (id, index) =>
      set((s) => {
        const fill = fillOf(findNode(s.doc.root, id));
        // Two stops is the floor: one stop isn't a gradient.
        if (fill?.type !== 'gradient' || fill.stops.length <= 2) return;
        fill.stops.splice(index, 1);
        s.activeStop = 0;
      }),

    convertFill: (id, to) =>
      set((s) => {
        const node = findNode(s.doc.root, id);
        const fill = fillOf(node);
        if (!node || !fill || fill.type === to) return;
        const props = propsOf(node);
        if (to === 'solid') {
          // Keep the first stop's colour, so converting reads as a simplification
          // of what's on screen rather than a reset to some unrelated default.
          props.fill = {
            type: 'solid',
            color: fill.type === 'gradient' ? fill.stops[0].color : '#FF9E45',
          } satisfies Fill;
        } else {
          const base = fill.type === 'solid' ? fill.color : '#FF9E45';
          props.fill = {
            type: 'gradient',
            angle: 135,
            stops: [
              { pos: 0, color: base },
              { pos: 100, color: '#E85D75' },
            ],
          } satisfies Fill;
        }
        s.activeStop = 0;
      }),

    setMotion: (id, motion) =>
      set((s) => {
        const node = findNode(s.doc.root, id);
        if (node?.interaction) node.interaction.motion = motion;
      }),

    undo: () =>
      set((s) => {
        const prev = s.past.pop();
        if (!prev) return;
        s.future.push(current(s.doc));
        s.doc = prev;
      }),

    redo: () =>
      set((s) => {
        const next = s.future.pop();
        if (!next) return;
        s.past.push(current(s.doc));
        s.doc = next;
      }),
  })),
);

/** The node the inspector is currently pointed at, or null. */
export function useSelectedNode(): SceneNode | null {
  return useEditor((s) => (s.selectedId ? findNode(s.doc.root, s.selectedId) : null));
}
