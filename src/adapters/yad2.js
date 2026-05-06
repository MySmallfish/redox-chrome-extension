import { emptyNormalized } from "../shared/normalizedModel.js";
import { canonicalizeUrl, getPathId } from "../shared/url.js";
import { toNumber } from "../shared/utils.js";
import {
  parseJsonLd,
  findListingJsonLd,
  mapJsonLdToNormalized,
  parseEmbeddedState,
  findListingInState,
  mapStateListingToNormalized,
  mergeNormalized,
  hasEmbeddedState,
  textFromSelectors,
  textFromLabels,
  booleanFromLabels
} from "./adapterUtils.js";

const siteId = "yad2";

function matchesUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.pathname.startsWith("/realestate/item/");
  } catch {
    return false;
  }
}

function detect(doc, rawUrl) {
  if (!matchesUrl(rawUrl)) return false;
  const hasJsonLd = doc.querySelector('script[type="application/ld+json"]');
  const hasPrice = doc.querySelector(
    '[data-testid="price"], .price, [data-field="price"]'
  );
  return Boolean(hasJsonLd || hasPrice || hasEmbeddedState(doc));
}

function extract(doc, rawUrl) {
  let normalized = emptyNormalized();

  const jsonLdItems = parseJsonLd(doc);
  const listing = findListingJsonLd(jsonLdItems);
  if (listing) {
    normalized = mapJsonLdToNormalized(listing);
  }

  const embeddedState = parseEmbeddedState(doc);
  if (embeddedState.length) {
    const yad2Item = findYad2Item(embeddedState);
    if (yad2Item) {
      const mapped = mapYad2ItemToNormalized(yad2Item);
      normalized = mergeNormalized(normalized, mapped);
    }

    const candidate = findListingInState(embeddedState);
    if (candidate) {
      const mapped = mapStateListingToNormalized(candidate);
      normalized = mergeNormalized(normalized, mapped);
    }
  }

  if (!normalized.title) {
    const titleText = textFromSelectors(doc, [
      '[data-testid="title"]',
      "[data-testid=heading]",
      "h1"
    ]);
    if (titleText) normalized.title = titleText;
  }

  if (!normalized.address) {
    const addressText =
      textFromSelectors(doc, [
        '[data-testid="address"]',
        "[data-testid=street]",
        ".address"
      ]) || textFromLabels(doc, ["\u05db\u05ea\u05d5\u05d1\u05ea", "Address"]);
    if (addressText) normalized.address = addressText;
  }

  if (!normalized.city) {
    const cityText =
      textFromSelectors(doc, ["[data-testid=city]", ".city"]) ||
      textFromLabels(doc, [
        "\u05e2\u05d9\u05e8",
        "\u05d9\u05d9\u05e9\u05d5\u05d1",
        "City"
      ]);
    if (cityText) normalized.city = cityText;
  }

  if (normalized.price == null) {
    const priceText =
      textFromSelectors(doc, ["[data-testid=price]", ".price"]) ||
      textFromLabels(doc, ["\u05de\u05d7\u05d9\u05e8", "Price"]);
    if (priceText) normalized.price = toNumber(priceText);
  }

  if (normalized.rooms == null) {
    const roomsText =
      textFromSelectors(doc, ["[data-testid=rooms]", ".rooms"]) ||
      textFromLabels(doc, [
        "\u05d7\u05d3\u05e8\u05d9\u05dd",
        "\u05de\u05e1\u05e4\u05e8 \u05d7\u05d3\u05e8\u05d9\u05dd",
        "Rooms"
      ]);
    if (roomsText) normalized.rooms = toNumber(roomsText);
  }

  if (normalized.areaSqm == null) {
    const areaText =
      textFromSelectors(doc, ["[data-testid=area]", ".area"]) ||
      textFromLabels(doc, [
        "\u05de\"\u05e8",
        "\u05de\u05b4\u05e8",
        "\u05e9\u05d8\u05d7",
        "\u05e9\u05d8\u05d7 \u05d1\u05e0\u05d5\u05d9",
        "Area"
      ]);
    if (areaText) normalized.areaSqm = toNumber(areaText);
  }

  if (normalized.floor == null) {
    const floorText =
      textFromSelectors(doc, ["[data-testid=floor]", ".floor"]) ||
      textFromLabels(doc, [
        "\u05e7\u05d5\u05de\u05d4",
        "\u05e7\u05d5\u05de\u05ea",
        "Floor"
      ]);
    if (floorText) {
      normalized.floor = toNumber(floorText) ?? floorText;
    }
  }

  if (normalized.totalFloors == null) {
    const totalFloorsText = textFromLabels(doc, [
      "\u05de\u05e1\u05e4\u05e8 \u05e7\u05d5\u05de\u05d5\u05ea",
      "\u05e7\u05d5\u05de\u05d5\u05ea \u05d1\u05d1\u05e0\u05d9\u05d9\u05df",
      "\u05e7\u05d5\u05de\u05d5\u05ea"
    ]);
    if (totalFloorsText) normalized.totalFloors = toNumber(totalFloorsText);
  }

  if (!normalized.description) {
    const descriptionText = textFromSelectors(doc, [
      "[data-testid=description]",
      ".description",
      "[data-testid=details]"
    ]);
    if (descriptionText) normalized.description = descriptionText;
  }

  if (normalized.features.elevator == null) {
    normalized.features.elevator = booleanFromLabels(doc, [
      "\u05de\u05e2\u05dc\u05d9\u05ea",
      "Elevator"
    ]);
  }
  if (normalized.features.accessible == null) {
    normalized.features.accessible = booleanFromLabels(doc, [
      "\u05e0\u05d2\u05d9\u05e9",
      "Accessible"
    ]);
  }
  if (normalized.features.balcony == null) {
    normalized.features.balcony = booleanFromLabels(doc, [
      "\u05de\u05e8\u05e4\u05e1\u05ea",
      "Balcony"
    ]);
  }
  if (normalized.features.solarHeater == null) {
    normalized.features.solarHeater = booleanFromLabels(doc, [
      "\u05d3\u05d5\u05d3 \u05e9\u05de\u05e9",
      "Solar"
    ]);
  }

  return normalized;
}

function getExternalId(rawUrl) {
  return getPathId(rawUrl, "/realestate/item/");
}

function canonicalizeUrlFn(rawUrl) {
  return canonicalizeUrl(rawUrl);
}

export const yad2Adapter = {
  siteId,
  matchesUrl,
  detect,
  extract,
  getExternalId,
  canonicalizeUrl: canonicalizeUrlFn
};

function findYad2Item(embeddedState) {
  for (const state of embeddedState) {
    const queries = state?.props?.pageProps?.dehydratedState?.queries;
    if (!Array.isArray(queries)) continue;
    for (const query of queries) {
      const key = query?.queryKey;
      if (Array.isArray(key) && key[0] === "item") {
        const data = query?.state?.data;
        if (data && typeof data === "object") return data;
      }
    }
  }
  return null;
}

function mapYad2ItemToNormalized(item) {
  const normalized = emptyNormalized();
  if (!item) return normalized;

  normalized.price = toNumber(item.price ?? item.abovePrice ?? null);

  const details = item.additionalDetails || {};
  const rooms = details.roomsCount ?? details.rooms ?? null;
  if (rooms != null) normalized.rooms = toNumber(rooms);

  const area =
    details.squareMeter ??
    details.squareMeterBuild ??
    details.squareMeterGarden ??
    null;
  if (area != null) normalized.areaSqm = toNumber(area);

  const address = item.address || {};
  const street = address?.street?.text || "";
  const houseNumber = address?.house?.number;
  const addressText = [street, houseNumber].filter(Boolean).join(" ").trim();
  if (addressText) normalized.address = addressText;
  if (address?.city?.text) normalized.city = address.city.text;
  if (address?.house?.floor != null) {
    normalized.floor =
      toNumber(address.house.floor) ?? String(address.house.floor);
  }

  if (item.metaData?.description) {
    normalized.description = item.metaData.description;
  }
  if (Array.isArray(item.metaData?.images)) {
    normalized.images = item.metaData.images.filter(Boolean);
  }

  const inProperty = item.inProperty || {};
  if (typeof inProperty.includeBalcony === "boolean") {
    normalized.features.balcony = inProperty.includeBalcony;
  }

  return normalized;
}
