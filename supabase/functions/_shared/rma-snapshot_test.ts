import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPrevTopicMap,
  computePercentual,
  emptyTopic,
  mergeTopics,
  type ExpectedTopic,
  type TopicSnapshot,
} from "./rma-snapshot.ts";

const expected: ExpectedTopic[] = [
  { number: 1, name: "Balancete" },
  { number: 2, name: "DRE" },
  { number: 3, name: "DFC" },
];

function topic(name: string, completude: number, status: TopicSnapshot["status"] = "completo"): TopicSnapshot {
  return { number: 0, name, status, completude, fileCount: 1, docsParsed: 1, errors: [] };
}

Deno.test("mergeTopics: prev snapshot é preservado quando não há live", () => {
  const prev = buildPrevTopicMap([topic("Balancete", 90), topic("DRE", 70)]);
  const out = mergeTopics(expected, [], prev, null);
  assertEquals(out.length, 3);
  assertEquals(out[0].completude, 90);
  assertEquals(out[1].completude, 70);
  assertEquals(out[2].status, "pendente");
  assertEquals(out[2].completude, 0);
});

Deno.test("mergeTopics: live overrides prev e nunca regride para pendente quando há baseline", () => {
  const prev = buildPrevTopicMap([topic("Balancete", 90), topic("DRE", 70), topic("DFC", 50)]);
  const live = [topic("DRE", 95)];
  const out = mergeTopics(expected, live, prev, null);
  assertEquals(out[0].completude, 90, "Balancete preservado");
  assertEquals(out[1].completude, 95, "DRE atualizado");
  assertEquals(out[2].completude, 50, "DFC preservado");
  for (const t of out) assertEquals(t.processing, false);
});

Deno.test("mergeTopics: marca processing apenas para currentName", () => {
  const prev = buildPrevTopicMap([topic("Balancete", 90)]);
  const out = mergeTopics(expected, [], prev, "DRE");
  assertEquals(out[0].processing, false);
  assertEquals(out[1].processing, true);
  // DFC sem prev → emptyTopic com processing=false (currentName é DRE)
  assertEquals(out[2].processing, false);
});

Deno.test("computePercentual: nunca regride abaixo do baseline", () => {
  const topics = [topic("Balancete", 10), topic("DRE", 0, "pendente"), topic("DFC", 0, "pendente")];
  const live = computePercentual(topics, 0); // ~3
  assert(live <= 10);
  // Mesmo cenário com baseline 80 → resultado deve ser >= 80
  const guarded = computePercentual(topics, 80);
  assertEquals(guarded, 80);
});

Deno.test("computePercentual: usa live quando excede baseline", () => {
  const topics = [topic("Balancete", 100), topic("DRE", 100), topic("DFC", 100)];
  assertEquals(computePercentual(topics, 50), 100);
});

Deno.test("computePercentual: clamp 0..100", () => {
  assertEquals(computePercentual([], 150), 100);
  assertEquals(computePercentual([], -5), 0);
});

Deno.test("Cenário falha-no-meio: snapshot final mantém tópicos já processados anteriormente", () => {
  // Run 1: tudo a 80%
  const baseline = [topic("Balancete", 80), topic("DRE", 80), topic("DFC", 80)];
  const prev = buildPrevTopicMap(baseline);
  // Run 2: só Balancete reprocessa (vai para 100), DRE e DFC falham antes
  const live = [topic("Balancete", 100)];
  const merged = mergeTopics(expected, live, prev, null);
  const pct = computePercentual(merged, 80);
  // Esperado: 100, 80, 80 → média 86, mas baseline é 80 → final 86
  assertEquals(merged[0].completude, 100);
  assertEquals(merged[1].completude, 80);
  assertEquals(merged[2].completude, 80);
  assertEquals(pct, 87); // round((100+80+80)/3) = 87
});

Deno.test("Cenário UI: nova execução sem prev → todos pendentes a 0%", () => {
  const prev = buildPrevTopicMap([]);
  const out = mergeTopics(expected, [], prev, null);
  assertEquals(out.every((t) => t.status === "pendente"), true);
  assertEquals(computePercentual(out, 0), 0);
});

Deno.test("emptyTopic: forma consistente", () => {
  const t = emptyTopic({ number: 5, name: "X" });
  assertEquals(t.completude, 0);
  assertEquals(t.status, "pendente");
  assertEquals(t.errors.length, 0);
});
