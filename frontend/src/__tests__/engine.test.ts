import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, roleFromText, scoreCards } from "../lib/engine";
import { buildFlow, guards, phaseQs } from "../lib/flow";
import { buildIndex, entMatches, looksLikeUrl, search } from "../lib/search";
import type { Content } from "../lib/types";
import { parseCo, parseHeadline } from "../lib/util";

const dir = new URL("../../../backend/app/content/", import.meta.url);
const D: Content = { ...JSON.parse(readFileSync(new URL("content.json", dir), "utf-8")), ents: JSON.parse(readFileSync(new URL("entities.json", dir), "utf-8")) };

describe("classify", () => {
  it("finds a known company", () => {
    const r = classify("Apollo Hospitals");
    expect(r.top?.ind).toBe("healthcare");
    expect(r.known).toBe(true);
  });
  it("asks the seller to choose for group names", () => {
    expect(classify("Tata").ambiguous.length).toBeGreaterThanOrEqual(2);
    expect(classify("Reliance").ambiguous.length).toBeGreaterThanOrEqual(2);
  });
});

describe("scoreCards credit gating", () => {
  it("serves card 16 to a startup", () => {
    expect(scoreCards({ ctype: "startup" }).primary.id).toBe("16");
  });
  it("never serves credit cards 16/17 to an enterprise, even if it asks for credits", () => {
    const r = scoreCards({ ctype: "enterprise", interest: "credits", pain: "runway", cloud: "gcp" });
    expect(r.ranked.map((x) => x.id)).not.toContain("16");
    expect(r.ranked.map((x) => x.id)).not.toContain("17");
    expect(r.notes.length).toBe(2);
  });
  it("treats a known established company as non-startup", () => {
    const r = scoreCards({ knownCompany: true, interest: "credits" });
    expect(r.nonStartup).toBe(true);
    expect(r.ranked.map((x) => x.id)).not.toContain("16");
  });
  it("maps designations to role cards", () => {
    expect(roleFromText("Head of Information Security")).toBe("ciso");
    expect(roleFromText("Co-founder and CEO")).toBe("ceo");
    expect(scoreCards({ designation: "CFO" }).primary.id).toBe("23");
  });
  it("falls back to card 01", () => { expect(scoreCards({}).primary.id).toBe("01"); });
});

describe("search", () => {
  const IDX = buildIndex(D);
  it("lists several HDFC entities", () => { expect(entMatches(D.ents, "HDFC").length).toBeGreaterThanOrEqual(4); });
  it("treats a URL as a company", () => { expect(looksLikeUrl("https://www.apollohospitals.com")).toBe(true); });
  it("finds keyword results", () => { expect(search(IDX, "shadow AI").length).toBeGreaterThan(0); });
  it("parses URLs and headlines", () => {
    expect(parseCo("https://www.apollohospitals.com/about").display).toBe("Apollohospitals");
    expect(parseCo("infosys.co.in").brand).toBe("infosys");
    expect(parseHeadline("CISO at HDFC Bank | Cyber risk")).toEqual({ designation: "CISO", company: "HDFC Bank" });
  });
});

describe("all 43 cards (QA)", () => {
  it("has 43 cards and 17 offers", () => {
    expect(D.cards.length).toBe(43);
    expect(Object.keys(D.offers.catalog).length).toBe(17);
  });
  for (const c of D.cards) {
    it(`card ${c.id} has questions, offers and no undefined`, () => {
      const B = buildFlow(D, c, { company: "Acme", person: "Asha Rao", designation: "CTO", role: "cio" });
      const hello = B.find((x) => x.lab === "Say hello, then ask") ? 1 : 0;
      const page1 = hello + phaseQs(B, 0).length + phaseQs(B, 2).length + (B.find((x) => x.lab === "What we do, in one line") ? 1 : 0);
      const page2 = phaseQs(B, 3).length + phaseQs(B, 4).length;
      expect(page1).toBeGreaterThanOrEqual(4);
      expect(page2).toBeGreaterThanOrEqual(4);
      expect((D.offers.map[c.id] || []).filter(([o]) => D.offers.catalog[o]).length).toBeGreaterThan(0);
      expect(JSON.stringify(B) + JSON.stringify(c)).not.toMatch(/undefined/);
      expect(guards(D, c).every(Boolean)).toBe(true);
    });
  }
  it("only startup cards show the credits guard line", () => {
    const credit = D.ref.guard[0];
    for (const c of D.cards) {
      const has = guards(D, c).includes(credit);
      expect(has).toBe(["16", "17", "25", "36"].includes(c.id));
    }
  });
  // the internal ORG rule "Never name PDMaaS to customers" is the only allowed mention
  it("customer-facing content never names PDMaaS", () => {
    const txt = JSON.stringify({ cards: D.cards, offers: D.offers, kb: D.kb.filter((e) => e.cat !== "ORG"), pitches: D.ref.pitches, objs: D.ref.objs });
    expect(txt).not.toMatch(/PDMaaS/);
  });
});
