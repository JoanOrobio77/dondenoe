"use client";

import { useSyncExternalStore } from "react";
import type { CartItem } from "./types";

const EMPTY: CartItem[] = [];

const carts = new Map<string, CartItem[]>();
const listeners = new Set<() => void>();

function key(slug: string) {
  return `dondenoe-cart:${slug}`;
}

function read(slug: string): CartItem[] {
  const cached = carts.get(slug);
  if (cached) return cached;
  try {
    const parsed = JSON.parse(localStorage.getItem(key(slug)) ?? "[]") as CartItem[];
    const items = Array.isArray(parsed) ? parsed : [];
    carts.set(slug, items);
    return items;
  } catch {
    carts.set(slug, []);
    return [];
  }
}

function write(slug: string, next: CartItem[]) {
  carts.set(slug, next);
  localStorage.setItem(key(slug), JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCart(slug: string) {
  return useSyncExternalStore(subscribe, () => read(slug), () => EMPTY);
}

export function addToCart(slug: string, item: Omit<CartItem, "quantity">) {
  const current = read(slug);
  const existing = current.find((i) => i.type === item.type && i.id === item.id);
  write(
    slug,
    existing
      ? current.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i))
      : [...current, { ...item, quantity: 1 }],
  );
}

export function changeQuantity(slug: string, type: CartItem["type"], id: string, delta: number) {
  write(
    slug,
    read(slug)
      .map((i) => (i.type === type && i.id === id ? { ...i, quantity: i.quantity + delta } : i))
      .filter((i) => i.quantity > 0),
  );
}

export function clearCart(slug: string) {
  write(slug, []);
}
