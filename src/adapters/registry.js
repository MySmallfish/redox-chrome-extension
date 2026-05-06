import { yad2Adapter } from "./yad2.js";
import { madlanAdapter } from "./madlan.js";

const adapters = [yad2Adapter, madlanAdapter];

export function getAdapterForUrl(rawUrl) {
  return adapters.find((adapter) => adapter.matchesUrl(rawUrl)) || null;
}

export function listAdapters() {
  return adapters.slice();
}


