export type MasterCandidate = {
  id: string;
  name: string;
  score: number;
};

export function chooseSuggestion(existing: { id: string; name: string } | null, master: MasterCandidate | null) {
  if (existing) return { action: "actualizar" as const, masterId: master?.id ?? null, productId: existing.id };
  if (master && master.score >= 0.3) return { action: "vincular" as const, masterId: master.id, productId: null };
  return { action: "crear" as const, masterId: null, productId: null };
}

export function lowConfidence(aiConfidence: number | null, matchScore: number | null) {
  return (aiConfidence !== null && aiConfidence < 0.6) || (matchScore !== null && matchScore < 0.4);
}
