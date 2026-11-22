"use client";

import { useSyncExternalStore } from "react";
import type { CartItem } from "./types";

const STORAGE_KEY = "dondenoe-cart";
const EMPTY: CartItem[] = [];

let items: CartItem[] | null = null;
const listeners = new Set<() => void>();

function read(): CartItem[] {
  if (items === null) {
    try {
      items = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      items = [];
    }
  }
  return items!;
}

function write(next: CartItem[]) {
  items = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCart() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function addToCart(item: Omit<CartItem, "quantity">) {
  const current = read();
  const existing = current.find((i) => i.type === item.type && i.id === item.id);
  write(
    existing
      ? current.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i))
      : [...current, { ...item, quantity: 1 }],
  );
}

export function changeQuantity(type: CartItem["type"], id: string, delta: number) {
  write(
    read()
      .map((i) => (i.type === type && i.id === id ? { ...i, quantity: i.quantity + delta } : i))
      .filter((i) => i.quantity > 0),
  );
}

export function clearCart() {
  write([]);
}
