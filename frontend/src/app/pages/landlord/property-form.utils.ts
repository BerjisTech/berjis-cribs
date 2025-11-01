import { Property } from "../../shared/models";

type MaybeRecord = Record<string, unknown> | null | undefined;

export function buildPropertyPayload(raw: any): Partial<Property> {
  const name = requireString(raw?.name);
  const addressType = requireString(raw?.addressType);
  const description = optionalString(raw?.description);
  const address = cleanRecord(raw?.address);
  const location = normalizeLocation(raw?.location);
  const amenities = toStringList(raw?.details?.amenities ?? raw?.amenities);
  const details = cleanRecord({
    occupancyModes: toStringList(raw?.details?.occupancyModes),
    baseRates: optionalString(raw?.details?.baseRates),
  });
  const policies = cleanRecord({
    cancellation: optionalString(raw?.policies?.cancellation ?? raw?.policies?.cancellationPolicy),
    houseRules: optionalString(raw?.policies?.houseRules),
  });

  const payload: Partial<Property> = {
    name: name ?? "",
    addressType: addressType ?? undefined,
    description: description,
    address,
    location,
    details,
    amenities: amenities && amenities.length > 0 ? amenities : undefined,
    policies,
  };

  if (!payload.description) {
    delete payload.description;
  }
  if (!payload.addressType) {
    delete payload.addressType;
  }
  if (!payload.address) {
    delete payload.address;
  }
  if (!payload.location) {
    delete payload.location;
  }
  if (!payload.details) {
    delete payload.details;
  }
  if (!payload.policies) {
    delete payload.policies;
  }
  if (!payload.amenities) {
    delete payload.amenities;
  }

  return payload;
}

export function buildMediaPayload(raw: any): { kind: string; url: string; caption?: string; unitId?: string } {
  const url = requireString(raw?.url) ?? "";
  const kind = requireString(raw?.kind) ?? "interior";
  const caption = optionalString(raw?.caption);
  const unitId = optionalString(raw?.unitId);

  const payload: { kind: string; url: string; caption?: string; unitId?: string } = { kind, url };
  if (caption) {
    payload.caption = caption;
  }
  if (unitId) {
    payload.unitId = unitId;
  }
  return payload;
}

function cleanRecord(value: MaybeRecord): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (raw === null || raw === undefined) {
      return;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed) {
        result[key] = trimmed;
      }
      return;
    }
    if (typeof raw === "number") {
      if (!Number.isNaN(raw)) {
        result[key] = raw;
      }
      return;
    }
    if (Array.isArray(raw)) {
      const cleaned = raw
        .map((item) => (typeof item === "string" ? item.trim() : item))
        .filter((item) => item !== null && item !== undefined && !(typeof item === "string" && item === ""));
      if (cleaned.length > 0) {
        result[key] = cleaned;
      }
      return;
    }
    if (typeof raw === "object") {
      const nested = cleanRecord(raw as MaybeRecord);
      if (nested && Object.keys(nested).length > 0) {
        result[key] = nested;
      }
      return;
    }
    result[key] = raw;
  });
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeLocation(value: any): { lat: number; lng: number } | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const lat = toNumber((value as any).lat);
  const lng = toNumber((value as any).lng);
  if (lat === undefined || lng === undefined) {
    return undefined;
  }
  return { lat, lng };
}

function toStringList(value: any): string[] | undefined {
  if (!value && value !== 0) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "")))
      .filter((item) => item && item.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof value === "string") {
    const cleaned = value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  return undefined;
}

function optionalString(value: any): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function requireString(value: any): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function toNumber(value: any): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
