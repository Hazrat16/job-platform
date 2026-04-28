import crypto from "crypto";
import { EXTERNAL_SOURCE_SEEDS } from "../config/externalSources.js";
import ExternalJobPosting from "../models/externalJobPostingModel.js";
import ExternalJobSource, { IExternalJobSource } from "../models/externalJobSourceModel.js";

type ParsedJob = {
  title: string;
  location: string;
  employmentType: string;
  applyUrl: string;
  sourceUrl: string;
  descriptionSnippet: string;
  datePosted?: Date;
  raw: Record<string, unknown>;
};

type SyncOutcome = {
  source: string;
  fetched: number;
  upserted: number;
  deactivated: number;
  error?: string;
};

type FetchHtmlResult = {
  body: string;
  source: "direct" | "mirror";
};

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseLocation(jobPosting: Record<string, unknown>): string {
  const raw = jobPosting["jobLocation"];
  const parts: string[] = [];
  for (const loc of asArray(raw as Record<string, unknown> | Record<string, unknown>[])) {
    const addr = (loc?.["address"] ?? {}) as Record<string, unknown>;
    const city = typeof addr["addressLocality"] === "string" ? addr["addressLocality"] : "";
    const region = typeof addr["addressRegion"] === "string" ? addr["addressRegion"] : "";
    const country = typeof addr["addressCountry"] === "string" ? addr["addressCountry"] : "";
    const text = [city, region, country].filter(Boolean).join(", ");
    if (text) parts.push(text);
  }
  return parts.join(" | ");
}

function toAbsoluteUrl(urlLike: string, baseUrl: string): string {
  try {
    return new URL(urlLike, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function pickUrl(node: Record<string, unknown>, baseUrl: string): string {
  const url = typeof node["url"] === "string" ? node["url"] : "";
  return toAbsoluteUrl(url || baseUrl, baseUrl);
}

function parseJsonLdJobPostings(html: string, sourceUrl: string): ParsedJob[] {
  const scriptMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const jobs: ParsedJob[] = [];

  for (const match of scriptMatches) {
    const raw = (match[1] || "").trim();
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const nodes = asArray(parsed as Record<string, unknown> | Record<string, unknown>[]);
    const expandedNodes: Record<string, unknown>[] = [];
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      if (Array.isArray((n as Record<string, unknown>)["@graph"])) {
        expandedNodes.push(...((n as Record<string, unknown>)["@graph"] as Record<string, unknown>[]));
      } else {
        expandedNodes.push(n);
      }
    }

    for (const node of expandedNodes) {
      const t = node["@type"];
      const types = asArray(typeof t === "string" ? t : (t as string[]));
      if (!types.some((x) => x.toLowerCase() === "jobposting")) continue;

      const title = typeof node["title"] === "string" ? node["title"].trim() : "";
      if (!title) continue;
      const employmentType =
        typeof node["employmentType"] === "string" ? node["employmentType"] : "";
      const descriptionRaw =
        typeof node["description"] === "string" ? node["description"] : "";
      const descriptionSnippet = stripHtml(descriptionRaw).slice(0, 1000);
      const datePosted = parseDate(node["datePosted"]);
      jobs.push({
        title,
        location: parseLocation(node),
        employmentType,
        applyUrl: pickUrl(node, sourceUrl),
        sourceUrl,
        descriptionSnippet,
        ...(datePosted ? { datePosted } : {}),
        raw: node,
      });
    }
  }

  return jobs;
}

async function fetchHtml(url: string): Promise<FetchHtmlResult> {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 20_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent": "JobPlatformBot/1.0 (+external-job-ingestion)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { body: await response.text(), source: "direct" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaMirror(url: string): Promise<FetchHtmlResult> {
  const mirrorUrl = `https://r.jina.ai/http://${new URL(url).host}${new URL(url).pathname}`;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 25_000);
  try {
    const response = await fetch(mirrorUrl, {
      method: "GET",
      signal: ac.signal,
      headers: {
        "User-Agent": "JobPlatformBot/1.0 (+external-job-ingestion)",
        Accept: "text/plain,text/markdown,*/*",
      },
    });
    if (!response.ok) throw new Error(`Mirror HTTP ${response.status}`);
    return { body: await response.text(), source: "mirror" };
  } finally {
    clearTimeout(timeout);
  }
}

function parseMarkdownJobs(sourceUrl: string, markdown: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null = null;
  while ((m = linkRegex.exec(markdown)) !== null) {
    const title = (m[1] || "").trim().replace(/\s+/g, " ");
    const applyUrl = (m[2] || "").trim();
    if (!title || !applyUrl) continue;
    if (title.length < 4 || title.length > 120) continue;
    if (/^(View Jobs|HOME|ABOUT US|SERVICES|CONTACT US|Powered by)$/i.test(title)) continue;
    if (!/(postings|career|jobs|vacanc|position|opening)/i.test(applyUrl)) continue;
    const key = `${title}|${applyUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({
      title,
      location: "",
      employmentType: "",
      applyUrl,
      sourceUrl,
      descriptionSnippet: "",
      raw: { title, applyUrl, parser: "markdown_link_fallback" },
    });
  }
  return jobs;
}

function fingerprint(sourceKey: string, job: ParsedJob): string {
  const payload = `${sourceKey}|${job.title.toLowerCase()}|${job.location.toLowerCase()}|${job.applyUrl}`;
  return crypto.createHash("sha1").update(payload).digest("hex");
}

export async function seedExternalSources(): Promise<void> {
  for (const seed of EXTERNAL_SOURCE_SEEDS) {
    await ExternalJobSource.updateOne(
      { companyKey: seed.companyKey },
      {
        $setOnInsert: {
          companyName: seed.companyName,
          careersUrl: seed.careersUrl,
          phase: seed.phase,
          enabled: true,
          parserType: "json_ld",
          crawlIntervalMinutes: 60 * 12,
        },
      },
      { upsert: true },
    );
  }
}

async function syncOne(source: IExternalJobSource): Promise<SyncOutcome> {
  const outcome: SyncOutcome = {
    source: source.companyKey,
    fetched: 0,
    upserted: 0,
    deactivated: 0,
  };
  try {
    let fetchResult: FetchHtmlResult;
    try {
      fetchResult = await fetchHtml(source.careersUrl);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("HTTP 403")) throw error;
      fetchResult = await fetchViaMirror(source.careersUrl);
    }

    let parsed = parseJsonLdJobPostings(fetchResult.body, source.careersUrl);
    if (parsed.length === 0 && fetchResult.source === "mirror") {
      parsed = parseMarkdownJobs(source.careersUrl, fetchResult.body);
    }
    outcome.fetched = parsed.length;

    const activeFingerprints = new Set<string>();
    for (const job of parsed) {
      const fp = fingerprint(source.companyKey, job);
      activeFingerprints.add(fp);
      await ExternalJobPosting.updateOne(
        { fingerprint: fp },
        {
          $set: {
            source: source._id,
            sourceCompanyKey: source.companyKey,
            companyName: source.companyName,
            title: job.title,
            location: job.location,
            employmentType: job.employmentType,
            applyUrl: job.applyUrl,
            sourceUrl: job.sourceUrl,
            descriptionSnippet: job.descriptionSnippet,
            datePosted: job.datePosted,
            isActive: true,
            lastSeenAt: new Date(),
            raw: job.raw,
          },
          $setOnInsert: { fingerprint: fp },
        },
        { upsert: true },
      );
      outcome.upserted += 1;
    }

    const deactivateFilter = {
      source: source._id,
      isActive: true,
      ...(activeFingerprints.size
        ? { fingerprint: { $nin: Array.from(activeFingerprints) } }
        : {}),
    };
    const deactivated = await ExternalJobPosting.updateMany(
      deactivateFilter,
      { $set: { isActive: false } },
    );
    outcome.deactivated = deactivated.modifiedCount;

    source.lastCrawledAt = new Date();
    source.lastSuccessAt = new Date();
    source.lastError = fetchResult.source === "mirror" ? "synced_via_mirror_fallback" : "";
    await source.save();
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    source.lastCrawledAt = new Date();
    source.lastError = message;
    await source.save();
    outcome.error = message;
    return outcome;
  }
}

export async function syncExternalSources(companyKey?: string): Promise<SyncOutcome[]> {
  await seedExternalSources();
  const filter: Record<string, unknown> = { enabled: true };
  if (companyKey) filter["companyKey"] = companyKey;
  const sources = await ExternalJobSource.find(filter).sort({ companyName: 1 });
  const outcomes: SyncOutcome[] = [];
  for (const source of sources) {
    // Sequential sync keeps external traffic polite and predictable.
    outcomes.push(await syncOne(source));
  }
  return outcomes;
}

