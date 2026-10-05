"use client";

import { useEffect, useState } from "react";
import { getPublicSettings } from "./api";

export interface ShippingRules {
  freeThreshold: number;
  fee: number;
}

// Used until /settings/public answers (and if it can't). Checkout re-prices on
// the server either way, so these only drive the estimate shown in the bag.
const FALLBACK: ShippingRules = { freeThreshold: 5000, fee: 150 };

let cached: ShippingRules | null = null;
let inflight: Promise<ShippingRules> | null = null;

function load(): Promise<ShippingRules> {
  if (cached) return Promise.resolve(cached);
  inflight ??= getPublicSettings()
    .then((s) => (cached = { freeThreshold: Number(s.free_shipping_threshold), fee: Number(s.shipping_fee) }))
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Platform shipping rules (free-shipping threshold, flat fee), fetched once. */
export function useShippingRules(): ShippingRules {
  const [rules, setRules] = useState<ShippingRules>(cached ?? FALLBACK);
  useEffect(() => {
    let active = true;
    load().then((r) => active && setRules(r));
    return () => {
      active = false;
    };
  }, []);
  return rules;
}

export function shippingFor(subtotal: number, rules: ShippingRules): number {
  return subtotal >= rules.freeThreshold ? 0 : rules.fee;
}
